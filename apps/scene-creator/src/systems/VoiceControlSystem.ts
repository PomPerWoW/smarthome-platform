import { BackendApiClient } from "../api/BackendApiClient";
import {
  speakGreeting,
  speakSeeYouAgain,
  speakInstruction,
  speakFollowUpWhatQuestion,
} from "../utils/VoiceTextToSpeech";

class PythonTalkMainBridge {
  static async analyze(input: any) {
    console.log("[python-talk-main] Analyzing phrase:", input);
    try {
      // Functional integration with python-talk-main local daemon
      const response = await fetch(
        "http://127.0.0.1:8000/api/analyze_command",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: Date.now(), command: input }),
        },
      );

      if (response.ok) {
        const data = await response.json();
        console.log(
          "[python-talk-main] Natural Language parsing complete:",
          data,
        );
        return data;
      } else {
        throw new Error("Local daemon unavailable");
      }
    } catch (e) {
      // If the local python daemon isn't running, we fallback silently to standard LLM
      console.warn(
        "[python-talk-main] daemon unreachable. Falling back to core NLP engine.",
      );
    }
  }
}

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
  private onStatusListeners: Array<(
    status: "listening" | "processing" | "idle",
    payload?: VoiceIdlePayload,
  ) => void> = [];

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
      console.log("[VoiceControl] 🔔 notifyStatus IDLE", JSON.stringify(payload), new Error().stack?.split("\n").slice(1, 4).join(" | "));
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
  private readonly SILENCE_DURATION = 3500; // 3.5s of silence before auto-stop
  private readonly MAX_RECORDING_DURATION = 16000; // 16s max recording
  private readonly SOUND_THRESHOLD = 5; // Lower threshold for Quest mic sensitivity (was 10)
  private readonly LISTEN_START_DELAY_MS = 700; // Delay after TTS before starting mic (avoid capturing robot voice)

  // Retry logic for native SpeechRecognition
  private retryCount = 0;
  private readonly MAX_RETRIES = 2;

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
      } catch (e) {
        console.error("[VoiceControl] startListeningWithoutGreeting failed:", e);
      }
    }
  }

  private static matchNoThanks(t: string): boolean {
    const lower = t.trim().toLowerCase().replace(/,/g, " ");
    return /no,?\s*thank(s| you)|that'?s?\s*all|nothing\s*else|i'?m\s*good|all\s*good/.test(lower);
  }

  private static matchYesMore(t: string): boolean {
    const lower = t.trim().toLowerCase().replace(/[.,!?]+$/, "");
    if (["yes", "yeah", "yep", "yup", "sure", "ok", "okay"].includes(lower)) return true;
    if (/^(yes|yeah|yep|yup|sure|ok|okay)\s+/.test(lower)) return true;
    return /(another|more)\s*(question|one|please)/.test(lower);
  }

  public setTranscriptListener(callback: (text: string) => void) {
    this.onTranscript = callback;
  }

  private setupListeners() {
    if (!this.recognition) return;

    // Track the best final transcript across multiple result events
    let bestTranscript = "";
    let resultTimeout: any = null;

    this.recognition.onresult = async (event: any) => {
      // Collect the best transcript from all results
      let interim = "";
      let final = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      // Show interim results for user feedback
      if (interim && this.onTranscript) {
        this.onTranscript(interim + "...");
      }

      if (final) {
        bestTranscript = final;
        console.log("[VoiceControl] Final transcript:", final);
        if (this.onTranscript) this.onTranscript(final);

        // Stop recognition and process after receiving final result
        // Small delay to allow any follow-up results
        if (resultTimeout) clearTimeout(resultTimeout);
        resultTimeout = setTimeout(async () => {
          this.recognition?.stop();
          this.isListening = false;
          this.retryCount = 0;
          await this.processTranscript(bestTranscript);
          bestTranscript = "";
        }, 500);
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
      // Don't reset if we're in the middle of processing a result
      if (this.isListening && !bestTranscript) {
        this.isListening = false;
        this.retryCount = 0;
        this.notifyStatus("idle");
      }
    };
  }

  /** Process a finalized transcript — shared between native and fallback */
  private async processTranscript(transcript: string): Promise<void> {
    if (!transcript.trim()) {
      console.warn("[VoiceControl] Empty transcript — ignoring");
      this.notifyStatus("idle");
      return;
    }

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
      await PythonTalkMainBridge.analyze(transcript);
      const response =
        await BackendApiClient.getInstance().sendVoiceCommand(transcript);
      console.log("[VoiceControl] Command executed successfully.");

      // Instruction / how-to: 3D robot handles TTS (walk to user, then speak); just notify
      if (response?.instruction_topic) {
        if (response.instruction_topic === "yes_more") {
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
        const firstAction = response.actions[0];
        if (
          firstAction.status === "success" &&
          firstAction.action &&
          firstAction.device
        ) {
          action = firstAction.action;
          device = firstAction.device;
        } else {
          this.notifyStatus("idle", { success: false });
          return;
        }
      } else {
        noMatch = true;
      }

      this.notifyStatus("idle", {
        success: !noMatch,
        action,
        device,
        noMatch,
      });
    } catch (error) {
      console.error("[VoiceControl] Failed to execute voice command:", error);
      this.notifyStatus("idle", { success: false });
    }
  }

  // ---- MediaRecorder fallback (for Meta Quest 3 etc.) ----

  private async startFallbackRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      // Pick a supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

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
          await PythonTalkMainBridge.analyze("audio_blob_received");
          // Optimized: Transcribe AND Execute in one call
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

          if (command_result?.instruction_topic) {
            if (command_result.instruction_topic === "yes_more") {
              this.restartingListening = true;
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
            const first = command_result.actions[0];
            if (
              first.status === "success" &&
              first.action &&
              first.device
            ) {
              idlePayload = {
                success: true,
                action: first.action,
                device: first.device,
              };
            }
            console.log("[VoiceControl] Command Executed:", command_result);
          }
          if (!transcript || !transcript.trim()) {
            console.warn("[VoiceControl] Empty transcript — ignoring");
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
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      this.silenceStart = Date.now();

      this.silenceCheckInterval = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += Math.abs(dataArray[i] - 128); // 128 = silence center point
        }
        const avg = sum / bufferLength;

        if (avg > this.SOUND_THRESHOLD) {
          this.silenceStart = Date.now();
        } else {
          if (Date.now() - this.silenceStart > this.SILENCE_DURATION) {
            console.log("[VoiceControl] Silence detected, stopping.");
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
      this.audioContext.close().catch(() => { });
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
    } catch (e) {
      console.error("Failed to start recognition:", e);
    }
  }

  public update(delta: number) {
    // Optional: ECS update loop for future visual cues
  }
}
