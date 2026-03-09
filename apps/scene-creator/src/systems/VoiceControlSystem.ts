import { BackendApiClient } from "../api/BackendApiClient";
import {
  speakGreeting,
  speakSeeYouAgain,
  speakInstruction,
  speakFollowUpWhatQuestion,
} from "../utils/VoiceTextToSpeech";

export type VoiceIdlePayload = {
  success?: boolean;
  cancelled?: boolean;
  action?: string;
  device?: string;
  noMatch?: boolean;
  instructionTopic?: string;
  endSession?: boolean;
};

export class VoiceControlSystem {
  private static instance: VoiceControlSystem;

  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private stopRequestedByUser: boolean = false;
  private useFallback: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private onStatusListeners: Array<
    (
      status: "listening" | "processing" | "idle",
      payload?: VoiceIdlePayload,
    ) => void
  > = [];

  /** When true, skip "How can I help you?" on next toggle on (e.g. already in instruction session). */
  private skipGreetingChecker: (() => boolean) | null = null;
  /** When true, check transcript for "no thanks" / "yes" before calling backend (instruction follow-up). */
  private instructionSessionChecker: (() => boolean) | null = null;
  /** When true, fallback onstop will skip notifying idle (yes_more → restart listening). */
  private restartingListening = false;

  private notifyStatus(
    status: "listening" | "processing" | "idle",
    payload?: VoiceIdlePayload,
  ): void {
    if (status === "idle") {
      console.log(
        "[VoiceControl] 🔔 notifyStatus IDLE",
        JSON.stringify(payload),
        new Error().stack?.split("\n").slice(1, 4).join(" | "),
      );
    }
    this.onStatusListeners.forEach((cb) => cb(status, payload));
  }

  // New: Transcript callback
  private onTranscript: ((text: string) => void) | null = null;

  // Silence detection
  private audioContext: any = null;
  private analyser: any = null;
  private silenceCheckInterval: any = null;
  private safetyTimeout: any = null;
  private silenceStart: number = 0;
  private readonly SILENCE_DURATION = 800; // 800ms of silence before auto-stop
  private readonly MAX_RECORDING_DURATION = 20000; // 20s max recording (increased for longer commands)
  private readonly SOUND_THRESHOLD = 3; // Lower threshold for better sensitivity
  private readonly LISTEN_START_DELAY_MS = 700; // Delay after TTS before starting mic (avoid capturing robot voice)

  // Retry logic for native SpeechRecognition
  private retryCount = 0;
  private readonly MAX_RETRIES = 2;

  // Improved transcript handling
  private readonly RESULT_WAIT_TIMEOUT = 800; // 800ms of no speech activity before auto-processing
  private readonly NO_ACTIVITY_TIMEOUT = 2000; // 2s with no results at all → stop listening
  private readonly MIN_TRANSCRIPT_LENGTH = 2; // Minimum characters to consider valid
  private noActivityTimer: any = null;

  private constructor() {
    const isQuest = /Quest|Oculus/i.test(navigator.userAgent);
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && !isQuest) {
      console.log("[VoiceControl] Using native SpeechRecognition");
      this.recognition = new SpeechRecognition();
      if (this.recognition) {
        this.recognition.continuous = true; // Keep listening for full utterance
        this.recognition.interimResults = true; // Get partial results for responsiveness
        this.recognition.lang = "en-US";
        (this.recognition as any).maxAlternatives = 3; // Consider multiple interpretations
        this.setupListeners();
      }
    } else {
      console.log(
        `[VoiceControl] Forcing MediaRecorder fallback (Unsupported or VR mode. isQuest: ${isQuest})`,
      );
      this.useFallback = true;
    }
  }

  public static getInstance(): VoiceControlSystem {
    if (!VoiceControlSystem.instance) {
      VoiceControlSystem.instance = new VoiceControlSystem();
    }
    return VoiceControlSystem.instance;
  }

  /** Add a status listener (does not replace existing ones). Both panel and robot can listen. */
  public addStatusListener(
    callback: (
      status: "listening" | "processing" | "idle",
      payload?: VoiceIdlePayload,
    ) => void,
  ) {
    this.onStatusListeners.push(callback);
  }

  /** Register checker: when true, skip speaking "How can I help you?" on voice toggle on. */
  public registerSkipGreetingChecker(fn: () => boolean): void {
    this.skipGreetingChecker = fn;
  }

  /** Register checker: when true, handle "no thanks" / "yes" locally before calling backend. */
  public registerInstructionSessionChecker(fn: () => boolean): void {
    this.instructionSessionChecker = fn;
  }

  /** Start listening without greeting (used after "What would you like to know?" in instruction session). */
  public startListeningWithoutGreeting(): void {
    this.isListening = true;
    this.notifyStatus("listening");
    if (this.useFallback) {
      this.startFallbackRecording();
      return;
    }
    if (this.recognition) {
      try {
        this.retryCount = 0;
        this.recognition.start();
        this.resetNoActivityTimer();
      } catch (e) {
        console.error(
          "[VoiceControl] startListeningWithoutGreeting failed:",
          e,
        );
      }
    }
  }

  private static matchNoThanks(t: string): boolean {
    const lower = t.trim().toLowerCase().replace(/[,.]/g, " ").replace(/\s+/g, " ");
    // Match various forms of "no thank you", "that's all", "nothing else", "I'm good", etc.
    const patterns = [
      /^no,?\s*thank(s| you)/,           // "no thank you", "no thanks", "no, thank you"
      /^that'?s?\s*all/,                  // "that's all", "thats all"
      /^nothing\s*else/,                  // "nothing else"
      /^i'?m\s*good/,                     // "I'm good", "im good"
      /^all\s*good/,                      // "all good"
      /^no\s*more/,                       // "no more"
      /^that'?s?\s*it/,                   // "that's it", "thats it"
      /^i'?m\s*done/,                    // "I'm done", "im done"
      /^we'?re\s*good/,                   // "we're good", "were good"
    ];
    return patterns.some(pattern => pattern.test(lower));
  }

  private static matchYesMore(t: string): boolean {
    const lower = t
      .trim()
      .toLowerCase()
      .replace(/[.,!?]+$/, "");
    if (["yes", "yeah", "yep", "yup", "sure", "ok", "okay"].includes(lower))
      return true;
    if (/^(yes|yeah|yep|yup|sure|ok|okay)\s+/.test(lower)) return true;
    return /(another|more)\s*(question|one|please)/.test(lower);
  }

  public setTranscriptListener(callback: (text: string) => void) {
    this.onTranscript = callback;
  }

  private clearNoActivityTimer() {
    if (this.noActivityTimer) {
      clearTimeout(this.noActivityTimer);
      this.noActivityTimer = null;
    }
  }

  /** Start (or restart) a timer that stops recognition if no results arrive at all. */
  private resetNoActivityTimer() {
    this.clearNoActivityTimer();
    this.noActivityTimer = setTimeout(() => {
      if (this.isListening && this.recognition) {
        console.log(
          "[VoiceControl] No activity for",
          this.NO_ACTIVITY_TIMEOUT,
          "ms — stopping.",
        );
        this.recognition.stop();
      }
    }, this.NO_ACTIVITY_TIMEOUT);
  }

  private setupListeners() {
    if (!this.recognition) return;

    // Track the best final transcript across multiple result events
    let accumulatedFinalTranscript = "";
    let lastInterimTranscript = "";
    let resultTimeout: any = null;
    let hasReceivedFinal = false;

    this.recognition.onresult = async (event: any) => {
      // Any result means the user is (or was) speaking — reset no-activity timer
      this.resetNoActivityTimer();

      // Collect transcripts from all results, including alternatives
      let interim = "";
      let final = "";
      let bestConfidence = 0;

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];

        if (result.isFinal) {
          // Try all alternatives (up to maxAlternatives) and pick the best one
          let bestTranscript = "";
          let bestConf = 0;

          // SpeechRecognition API provides alternatives as result[0], result[1], etc.
          for (let alt = 0; alt < 3; alt++) {
            const altResult = result[alt];
            if (!altResult) break;

            const transcript = altResult.transcript || "";
            const confidence = altResult.confidence || 0;

            if (transcript && confidence > bestConf) {
              bestTranscript = transcript;
              bestConf = confidence;
            }
          }

          // If no alternatives with confidence, use first result
          if (!bestTranscript && result[0]?.transcript) {
            bestTranscript = result[0].transcript;
          }

          // Accumulate final results (speech recognition may split long utterances)
          if (bestTranscript) {
            final = bestTranscript;
            accumulatedFinalTranscript +=
              (accumulatedFinalTranscript ? " " : "") + final.trim();
            hasReceivedFinal = true;
            console.log(
              "[VoiceControl] Final transcript segment:",
              final,
              "(confidence:",
              bestConf,
              ")",
            );
          }
        } else {
          // Collect interim results for real-time feedback
          if (result[0]?.transcript) {
            interim += result[0].transcript;
          }
        }
      }

      // Show interim results for user feedback
      if (interim && this.onTranscript) {
        lastInterimTranscript = interim;
        this.onTranscript(interim + "...");
      }

      // When we have final results, check if speech has ended
      if (hasReceivedFinal) {
        if (this.onTranscript && accumulatedFinalTranscript) {
          this.onTranscript(accumulatedFinalTranscript);
        }

        // If we have a final result and no interim results in this event, speech likely ended
        // Process immediately instead of waiting
        if (
          !interim &&
          accumulatedFinalTranscript.trim().length >= this.MIN_TRANSCRIPT_LENGTH
        ) {
          // Clear any pending timeout since we're processing now
          if (resultTimeout) {
            clearTimeout(resultTimeout);
            resultTimeout = null;
          }
          this.clearNoActivityTimer();

          console.log(
            "[VoiceControl] Speech ended (no interim results), processing immediately:",
            accumulatedFinalTranscript,
          );
          this.recognition?.stop();
          this.isListening = false;
          this.retryCount = 0;

          // Reset state before processing
          const transcriptToProcess = accumulatedFinalTranscript.trim();
          accumulatedFinalTranscript = "";
          lastInterimTranscript = "";
          hasReceivedFinal = false;

          await this.processTranscript(transcriptToProcess);
          return;
        }

        // Reset the speech-inactivity timer: if no new results (interim or final)
        // arrive within RESULT_WAIT_TIMEOUT, the user has likely finished speaking.
        if (resultTimeout) clearTimeout(resultTimeout);
        resultTimeout = setTimeout(async () => {
          // Use accumulated final transcript, or fallback to interim if no final yet
          const transcriptToProcess =
            accumulatedFinalTranscript.trim() || lastInterimTranscript.trim();

          this.clearNoActivityTimer();

          if (transcriptToProcess.length >= this.MIN_TRANSCRIPT_LENGTH) {
            console.log(
              "[VoiceControl] No new speech for",
              this.RESULT_WAIT_TIMEOUT,
              "ms — processing:",
              transcriptToProcess,
            );
            this.recognition?.stop();
            this.isListening = false;
            this.retryCount = 0;
            await this.processTranscript(transcriptToProcess);
          } else {
            console.warn(
              "[VoiceControl] Transcript too short, ignoring:",
              transcriptToProcess,
            );
            this.notifyStatus("idle");
          }

          // Reset state
          accumulatedFinalTranscript = "";
          lastInterimTranscript = "";
          hasReceivedFinal = false;
        }, this.RESULT_WAIT_TIMEOUT);
      }
    };

    this.recognition.onerror = (event: any) => {
      if (event.error === "no-speech") {
        // Auto-retry on no-speech (up to MAX_RETRIES)
        if (this.retryCount < this.MAX_RETRIES) {
          this.retryCount++;
          console.warn(
            `[VoiceControl] No speech detected — retrying (${this.retryCount}/${this.MAX_RETRIES})`,
          );
          // Restart after a brief delay
          setTimeout(() => {
            if (this.isListening && this.recognition) {
              try {
                this.recognition.start();
              } catch (e) {
                console.error("[VoiceControl] Retry failed:", e);
                this.isListening = false;
                this.notifyStatus("idle");
              }
            }
          }, 300);
          return;
        }
        console.warn("[VoiceControl] No speech after retries.");
      } else if (event.error === "aborted") {
        console.log("[VoiceControl] Speech recognition aborted.");
      } else if (event.error === "network") {
        console.error(
          "[VoiceControl] Network error — switching to MediaRecorder fallback.",
        );
        this.useFallback = true;
      } else {
        console.error(
          `[VoiceControl] Speech Recognition Error (${event.error}):`,
          event,
        );
      }

      this.retryCount = 0;
      this.notifyStatus("idle");
      this.isListening = false;
    };

    this.recognition.onend = () => {
      this.clearNoActivityTimer();

      // If recognition ended but we're still listening, it might have stopped prematurely
      // Only reset if we haven't received any final results
      if (this.isListening && !hasReceivedFinal) {
        // If we have interim results, try processing them as a fallback
        if (lastInterimTranscript.trim().length >= this.MIN_TRANSCRIPT_LENGTH) {
          console.log(
            "[VoiceControl] Recognition ended, processing interim transcript:",
            lastInterimTranscript,
          );
          this.isListening = false;
          this.retryCount = 0;
          this.processTranscript(lastInterimTranscript.trim());
        } else {
          this.isListening = false;
          this.retryCount = 0;
          this.notifyStatus("idle");
        }
      }

      // Reset accumulated state
      accumulatedFinalTranscript = "";
      lastInterimTranscript = "";
      hasReceivedFinal = false;
    };
  }

  /** Process a finalized transcript — shared between native and fallback */
  private async processTranscript(transcript: string): Promise<void> {
    const trimmedTranscript = transcript.trim();

    if (
      !trimmedTranscript ||
      trimmedTranscript.length < this.MIN_TRANSCRIPT_LENGTH
    ) {
      console.warn(
        "[VoiceControl] Transcript too short or empty — ignoring:",
        trimmedTranscript,
      );
      this.notifyStatus("idle", { noMatch: true });
      return;
    }

    // Log the transcript for debugging
    console.log("[VoiceControl] Processing transcript:", trimmedTranscript);

    // Instruction session follow-up: handle "no thanks" / "yes" locally (3D flow)
    if (this.instructionSessionChecker?.()) {
      if (VoiceControlSystem.matchNoThanks(transcript)) {
        this.notifyStatus("idle", {
          success: true,
          instructionTopic: "goodbye",
          endSession: true,
        });
        return;
      }
      if (VoiceControlSystem.matchYesMore(transcript)) {
        // Notify dialogue in 3D scene
        const voicePanelSystem = (globalThis as any).__voicePanelSystem;
        if (
          voicePanelSystem &&
          typeof voicePanelSystem.addRobotMessage === "function"
        ) {
          voicePanelSystem.addRobotMessage("What would you like to know?");
        }
        await speakFollowUpWhatQuestion();
        setTimeout(
          () => this.startListeningWithoutGreeting(),
          this.LISTEN_START_DELAY_MS,
        );
        return;
      }
    }

    this.notifyStatus("processing");

    try {
      const response =
        await BackendApiClient.getInstance().sendVoiceCommand(
          trimmedTranscript,
        );
      console.log("[VoiceControl] Backend response:", response);

      // Instruction / how-to: 3D robot handles TTS (walk to user, then speak); just notify
      if (response?.instruction_topic) {
        if (response.instruction_topic === "yes_more") {
          // Notify dialogue in 3D scene
          const voicePanelSystem = (globalThis as any).__voicePanelSystem;
          if (
            voicePanelSystem &&
            typeof voicePanelSystem.addRobotMessage === "function"
          ) {
            voicePanelSystem.addRobotMessage("What would you like to know?");
          }
          await speakFollowUpWhatQuestion();
          setTimeout(
            () => this.startListeningWithoutGreeting(),
            this.LISTEN_START_DELAY_MS,
          );
          return;
        }
        this.notifyStatus("idle", {
          success: true,
          instructionTopic: response.instruction_topic,
        });
        return;
      }

      let action: string | undefined;
      let device: string | undefined;
      let noMatch = false;

      if (response?.actions && response.actions.length > 0) {
        // Try to find a successful action
        const successfulAction = response.actions.find(
          (a: any) => a.status === "success" && a.action && a.device,
        );

        if (successfulAction) {
          action = successfulAction.action;
          device = successfulAction.device;
          console.log("[VoiceControl] Command executed successfully:", {
            action,
            device,
          });
        } else {
          console.warn("[VoiceControl] No successful action found in response");
          this.notifyStatus("idle", { success: false, noMatch: true });
          return;
        }
      } else {
        noMatch = true;
        console.warn(
          "[VoiceControl] No actions in response — command not recognized",
        );
      }

      this.notifyStatus("idle", {
        success: !noMatch,
        action,
        device,
        noMatch,
      });
    } catch (error) {
      console.error("[VoiceControl] Failed to execute voice command:", error);
      this.notifyStatus("idle", { success: false, noMatch: true });
    }
  }

  // ---- MediaRecorder fallback (for Meta Quest 3 etc.) ----

  private async startFallbackRecording() {
    try {
      // Request better audio quality settings
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100, // Higher sample rate for better quality
          channelCount: 1, // Mono is sufficient for speech
        },
      });
      this.audioChunks = [];

      // Pick the best supported MIME type for quality
      let mimeType = "audio/webm";
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm;codecs=pcm",
        "audio/webm",
        "audio/mp4",
      ];

      for (const type of preferredTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      // Use higher bitrate if supported
      const options: MediaRecorderOptions = { mimeType };
      if (mimeType.includes("opus")) {
        // Opus codec supports bitrate setting
        (options as any).audioBitsPerSecond = 64000; // 64kbps for good quality speech
      }

      this.mediaRecorder = new MediaRecorder(stream, options);

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        // Stop timeout
        if (this.safetyTimeout) {
          clearTimeout(this.safetyTimeout);
          this.safetyTimeout = null;
        }

        // Release mic and stop tracks
        stream.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        if (audioBlob.size === 0) {
          console.warn("[VoiceControl] Empty recording — ignoring");
          this.notifyStatus("idle");
          this.isListening = false;
          return;
        }

        this.notifyStatus("processing");

        let idlePayload: VoiceIdlePayload | undefined;
        try {
          // Transcribe AND Execute in one call
          const { transcript, command_result } =
            await BackendApiClient.getInstance().sendVoiceAudio(
              audioBlob,
              true,
            );

          console.log("[VoiceControl] Transcribed:", transcript);

          // Notify transcript
          if (this.onTranscript && transcript) {
            this.onTranscript(transcript);
          }

          if (
            !transcript ||
            transcript.trim().length < this.MIN_TRANSCRIPT_LENGTH
          ) {
            console.warn(
              "[VoiceControl] Empty or too short transcript — ignoring:",
              transcript,
            );
            idlePayload = { success: false, noMatch: true };
          } else if (command_result?.instruction_topic) {
            if (command_result.instruction_topic === "yes_more") {
              this.restartingListening = true;
              // Notify dialogue in 3D scene
              const voicePanelSystem = (globalThis as any).__voicePanelSystem;
              if (
                voicePanelSystem &&
                typeof voicePanelSystem.addRobotMessage === "function"
              ) {
                voicePanelSystem.addRobotMessage(
                  "What would you like to know?",
                );
              }
              await speakFollowUpWhatQuestion();
              setTimeout(
                () => this.startListeningWithoutGreeting(),
                this.LISTEN_START_DELAY_MS,
              );
              return;
            }
            // 3D: RobotAssistantSystem handles all instruction TTS (walk to user, then speak); just set payload
            idlePayload = {
              success: true,
              instructionTopic: command_result.instruction_topic,
            };
          } else if (command_result?.actions?.length > 0) {
            // Try to find a successful action
            const successfulAction = command_result.actions.find(
              (a: any) => a.status === "success" && a.action && a.device,
            );

            if (successfulAction) {
              idlePayload = {
                success: true,
                action: successfulAction.action,
                device: successfulAction.device,
              };
              console.log("[VoiceControl] Command Executed:", idlePayload);
            } else {
              console.warn("[VoiceControl] No successful action found");
              idlePayload = { success: false, noMatch: true };
            }
          } else {
            console.warn("[VoiceControl] Command not recognized");
            idlePayload = { success: false, noMatch: true };
          }
        } catch (error) {
          console.error("[VoiceControl] Fallback voice command failed:", error);
        } finally {
          if (this.restartingListening) {
            this.restartingListening = false;
            return;
          }
          if (this.stopRequestedByUser) {
            this.notifyStatus("idle", { cancelled: true });
          } else {
            this.notifyStatus("idle", idlePayload);
          }
          this.stopRequestedByUser = false;
          this.isListening = false;
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        console.error("[VoiceControl] MediaRecorder error:", event);
        stream.getTracks().forEach((t) => t.stop());
        this.stopSilenceDetection();
        this.notifyStatus("idle");
        this.isListening = false;
      };

      this.mediaRecorder.start();
      this.isListening = true;
      this.notifyStatus("listening");

      // Set explicit safety timeout
      this.safetyTimeout = setTimeout(() => {
        console.log(
          `[VoiceControl] Safety timeout reached (${this.MAX_RECORDING_DURATION / 1000}s), stopping.`,
        );
        this.stopFallbackRecording();
      }, this.MAX_RECORDING_DURATION);

      // Start silence detection
      this.setupSilenceDetection(stream);
    } catch (err) {
      console.error("[VoiceControl] Failed to start MediaRecorder:", err);
      this.notifyStatus("idle");
      this.isListening = false;
    }
  }

  private setupSilenceDetection(stream: MediaStream) {
    const AudioContextClass =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn(
        "[VoiceControl] AudioContext not available for silence detection",
      );
      return;
    }

    try {
      this.audioContext = new AudioContextClass();
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048; // Higher FFT size for better frequency analysis
      this.analyser.smoothingTimeConstant = 0.3; // Lower smoothing for faster silence response
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const frequencyData = new Uint8Array(bufferLength);

      this.silenceStart = Date.now();
      let consecutiveSilenceChecks = 0;
      const REQUIRED_SILENCE_CHECKS = Math.ceil(this.SILENCE_DURATION / 100); // Number of checks needed

      this.silenceCheckInterval = setInterval(() => {
        if (!this.analyser) return;

        // Use both time domain and frequency domain for better detection
        this.analyser.getByteTimeDomainData(dataArray);
        this.analyser.getByteFrequencyData(frequencyData);

        // Calculate average amplitude
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += Math.abs(dataArray[i] - 128); // 128 = silence center point
        }
        const avgAmplitude = sum / bufferLength;

        // Calculate average frequency energy (for better speech detection)
        let freqSum = 0;
        for (let i = 0; i < bufferLength; i++) {
          freqSum += frequencyData[i];
        }
        const avgFrequency = freqSum / bufferLength;

        // Consider both amplitude and frequency - speech has both
        const isSoundDetected =
          avgAmplitude > this.SOUND_THRESHOLD || avgFrequency > 10;

        if (isSoundDetected) {
          this.silenceStart = Date.now();
          consecutiveSilenceChecks = 0;
        } else {
          consecutiveSilenceChecks++;
          // Require consistent silence over the duration
          if (consecutiveSilenceChecks >= REQUIRED_SILENCE_CHECKS) {
            console.log(
              "[VoiceControl] Consistent silence detected, stopping.",
            );
            this.stopFallbackRecording();
          }
        }
      }, 100);
    } catch (e) {
      console.error("[VoiceControl] Failed to setup silence detection:", e);
    }
  }

  private stopSilenceDetection() {
    if (this.silenceCheckInterval) {
      clearInterval(this.silenceCheckInterval);
      this.silenceCheckInterval = null;
    }
    if (this.safetyTimeout) {
      clearTimeout(this.safetyTimeout);
      this.safetyTimeout = null;
    }
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.analyser = null;
  }

  private stopFallbackRecording() {
    this.stopSilenceDetection();
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }

  // ---- Public API ----

  public async toggleListening() {
    if (this.isListening) {
      // User toggled off: say goodbye (like 2D dashboard) then stop
      speakSeeYouAgain();
      if (this.useFallback) {
        this.stopRequestedByUser = true;
        this.stopFallbackRecording();
      } else if (this.recognition) {
        this.clearNoActivityTimer();
        this.recognition.stop();
        this.isListening = false;
        this.notifyStatus("idle", { cancelled: true });
      }
      return;
    }

    this.isListening = true;
    this.notifyStatus("listening");

    // Await greeting so the mic doesn't capture the robot's voice (skip if already in instruction session)
    if (!this.skipGreetingChecker?.()) {
      await speakGreeting();
    }

    if (!this.isListening) return; // In case user toggled off while speaking

    if (this.useFallback) {
      this.startFallbackRecording();
      return;
    }

    // SpeechRecognition path
    if (!this.recognition) return;

    try {
      this.retryCount = 0;
      this.recognition.start();
      this.resetNoActivityTimer();
    } catch (e) {
      console.error("Failed to start recognition:", e);
    }
  }

  public update(delta: number) {
    // Optional: ECS update loop for future visual cues
  }
}
