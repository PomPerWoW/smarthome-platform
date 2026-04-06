import { BackendApiClient } from "../api/BackendApiClient";
import { speakGreeting, speakSeeYouAgain } from "../utils/VoiceTextToSpeech";

export type VoiceIdlePayload = {
  success?: boolean;
  cancelled?: boolean;
  action?: string;
  device?: string;
  deviceId?: string;
  commandText?: string;
  executeAfterMovement?: boolean;
  noMatch?: boolean;
  /** Backend request failed (e.g. HTTP 500) — refresh UI and robot patrol. */
  serverError?: boolean;
  instructionTopic?: string;
  instructionText?: string; // Dynamic instruction text from backend (e.g., for device_info)
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


  private notifyStatus(
    status: "listening" | "processing" | "idle",
    payload?: VoiceIdlePayload,
  ): void {
    this.onStatusListeners.forEach((cb) => cb(status, payload));
  }

  // New: Transcript callback
  private onTranscript: ((text: string) => void) | null = null;

  // Silence detection
  private audioContext: any = null;
  private analyser: any = null;
  private silenceCheckInterval: any = null;
  private safetyTimeout: any = null;
  /** Quiet period after last sound before auto-stop (Quest mic + word pauses need more headroom). */
  private readonly SILENCE_DURATION = 1700;
  private readonly MAX_RECORDING_DURATION = 20000; // 20s max recording (increased for longer commands)
  /** Time-domain deviation from 128; keep low for quiet speech but not so low that noise flicker resets silence. */
  private readonly SOUND_THRESHOLD = 4;
  /** Frequency-domain energy bar; lower = treat more mic output as “still speaking”. */
  private readonly FREQ_SOUND_THRESHOLD = 6;
  // Retry logic for native SpeechRecognition
  private retryCount = 0;
  private readonly MAX_RETRIES = 2;

  // Transcript handling
  private readonly NO_ACTIVITY_TIMEOUT = 2000; // 2s with no results at all → stop listening
  private readonly INTERIM_ONLY_TIMEOUT = 2500; // 2.5s with only interim results, no final → force process
  private readonly MIN_TRANSCRIPT_LENGTH = 2; // Minimum characters to consider valid
  private noActivityTimer: any = null;
  private interimOnlyTimer: any = null;
  private nativeSafetyTimeout: any = null;
  private readonly NATIVE_MAX_LISTEN_MS = 15000; // 15s max for native recognition session

  private constructor() {
    const isQuest = /Quest|Oculus/i.test(navigator.userAgent);
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && !isQuest) {
      this.recognition = new SpeechRecognition();
      if (this.recognition) {
        // continuous=false: Chrome auto-finalizes and stops after one utterance,
        // preventing the cumulative event.results list that causes duplicate
        // transcript accumulation, and stopping the timer-reset hang caused
        // by continuous ambient-noise events.
        this.recognition.continuous = false;
        this.recognition.interimResults = true; // Still show partial results for UI feedback
        this.recognition.lang = "en-US";
        (this.recognition as any).maxAlternatives = 1;
        this.setupListeners();
      }
    } else {
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

  public setTranscriptListener(callback: (text: string) => void) {
    this.onTranscript = callback;
  }

  private clearNoActivityTimer() {
    if (this.noActivityTimer) {
      clearTimeout(this.noActivityTimer);
      this.noActivityTimer = null;
    }
  }

  private clearInterimOnlyTimer() {
    if (this.interimOnlyTimer) {
      clearTimeout(this.interimOnlyTimer);
      this.interimOnlyTimer = null;
    }
  }

  private clearNativeSafetyTimeout() {
    if (this.nativeSafetyTimeout) {
      clearTimeout(this.nativeSafetyTimeout);
      this.nativeSafetyTimeout = null;
    }
  }

  private startNativeSafetyTimeout() {
    this.clearNativeSafetyTimeout();
    this.nativeSafetyTimeout = setTimeout(() => {
      if (this.isListening && this.recognition) {
        this.recognition.stop();
      }
    }, this.NATIVE_MAX_LISTEN_MS);
  }

  /** Start (or restart) a timer that stops recognition if no results arrive at all. */
  private resetNoActivityTimer() {
    this.clearNoActivityTimer();
    this.noActivityTimer = setTimeout(() => {
      if (this.isListening && this.recognition) {
        this.recognition.stop();
      }
    }, this.NO_ACTIVITY_TIMEOUT);
  }

  private setupListeners() {
    if (!this.recognition) return;

    let accumulatedFinalTranscript = "";
    let lastInterimTranscript = "";
    let hasReceivedFinal = false;
    /** Max interim length this recognition session — noise flicker changes text without growing length; timers must not reset on that. */
    let maxInterimLenThisSession = 0;

    this.recognition.onstart = () => {
      maxInterimLenThisSession = 0;
    };

    this.recognition.onresult = async (event: any) => {
      // Guard: ignore stale events that arrive after we've already stopped
      if (!this.isListening) return;

      let interim = "";
      let gotNewFinalChunk = false;

      // With continuous=false, event.results only contains results for the
      // current utterance — no cumulative history from previous sessions.
      // Only scan new results starting from the last known index.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];

        if (result.isFinal) {
          const bestTranscript = result[0]?.transcript?.trim() || "";
          if (bestTranscript) {
            accumulatedFinalTranscript +=
              (accumulatedFinalTranscript ? " " : "") + bestTranscript;
            hasReceivedFinal = true;
            gotNewFinalChunk = true;
            this.clearInterimOnlyTimer();
          }
        } else {
          interim += result[0]?.transcript || "";
        }
      }

      const interimTrimmed = interim.trim();
      const interimLen = interimTrimmed.length;
      const interimGrowing = interimLen > maxInterimLenThisSession;
      if (interimLen > maxInterimLenThisSession) {
        maxInterimLenThisSession = interimLen;
      }

      // Ambient noise often produces new interim strings without growing length;
      // that must not refresh timers (otherwise recognition never idles).
      if (interimGrowing || gotNewFinalChunk) {
        this.resetNoActivityTimer();
      }

      // Show interim results for user feedback
      if (interim) {
        if (this.onTranscript) this.onTranscript(interim + "...");
      }

      // Final result received — process immediately (continuous=false means
      // Chrome auto-stops after this, so no more events will come).
      if (hasReceivedFinal && accumulatedFinalTranscript.trim().length >= this.MIN_TRANSCRIPT_LENGTH) {
        this.clearNoActivityTimer();
        this.clearInterimOnlyTimer();
        this.clearNativeSafetyTimeout();

        if (this.onTranscript) this.onTranscript(accumulatedFinalTranscript.trim());

        this.isListening = false;
        this.retryCount = 0;

        const transcriptToProcess = accumulatedFinalTranscript.trim();
        accumulatedFinalTranscript = "";
        lastInterimTranscript = "";
        hasReceivedFinal = false;

        await this.processTranscript(transcriptToProcess);
        return;
      }

      // No final yet — only interim results (e.g. browser is slow to finalize).
      // Reset the interim-only timer only when the transcript grows (user adding words).
      // Changing text at the same length (noise / ASR wavering) must not extend listening.
      if (interim && !hasReceivedFinal) {
        const shouldArmInterimTimer =
          interimGrowing || !this.interimOnlyTimer;
        if (shouldArmInterimTimer) {
          this.clearInterimOnlyTimer();
          this.interimOnlyTimer = setTimeout(async () => {
            this.interimOnlyTimer = null;
            if (!this.isListening) return;

            const transcriptToProcess =
              accumulatedFinalTranscript.trim() || lastInterimTranscript.trim();

            this.clearNoActivityTimer();
            this.clearNativeSafetyTimeout();

            if (transcriptToProcess.length >= this.MIN_TRANSCRIPT_LENGTH) {
              this.recognition?.stop();
              this.isListening = false;
              this.retryCount = 0;

              accumulatedFinalTranscript = "";
              lastInterimTranscript = "";
              hasReceivedFinal = false;

              await this.processTranscript(transcriptToProcess);
            } else {
              this.recognition?.stop();
              this.isListening = false;
              speakSeeYouAgain();
              this.notifyStatus("idle", { cancelled: true });

              accumulatedFinalTranscript = "";
              lastInterimTranscript = "";
              hasReceivedFinal = false;
            }
          }, this.INTERIM_ONLY_TIMEOUT);
        }
        lastInterimTranscript = interim;
      }
    };

    this.recognition.onerror = (event: any) => {
      this.clearNativeSafetyTimeout();
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
                speakSeeYouAgain();
                this.notifyStatus("idle", { cancelled: true });
              }
            }
          }, 300);
          return;
        }
        console.warn("[VoiceControl] No speech after retries.");
      } else if (event.error === "network") {
        console.error(
          "[VoiceControl] Network error — switching to MediaRecorder fallback.",
        );
        this.useFallback = true;
      } else if (event.error !== "aborted") {
        console.error(
          `[VoiceControl] Speech Recognition Error (${event.error}):`,
          event,
        );
      }

      this.retryCount = 0;
      this.clearInterimOnlyTimer();
      speakSeeYouAgain();
      this.notifyStatus("idle", { cancelled: true });
      this.isListening = false;
    };

    this.recognition.onend = () => {
      this.clearNoActivityTimer();
      this.clearInterimOnlyTimer();
      this.clearNativeSafetyTimeout();

      // With continuous=false this fires after every session end.
      // Only act if we haven't already processed a result in onresult.
      if (this.isListening) {
        const fallback = accumulatedFinalTranscript.trim() || lastInterimTranscript.trim();
        if (fallback.length >= this.MIN_TRANSCRIPT_LENGTH) {
          this.isListening = false;
          this.retryCount = 0;
          accumulatedFinalTranscript = "";
          lastInterimTranscript = "";
          hasReceivedFinal = false;
          this.processTranscript(fallback);
        } else {
          this.isListening = false;
          this.retryCount = 0;
          accumulatedFinalTranscript = "";
          lastInterimTranscript = "";
          hasReceivedFinal = false;
          speakSeeYouAgain();
          this.notifyStatus("idle", { cancelled: true });
        }
        return;
      }

      // Already processed in onresult — just clean up state
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

    this.notifyStatus("processing");

    try {
      const response =
        await BackendApiClient.getInstance().sendVoiceCommand(
          trimmedTranscript,
          true,
        );
      console.log("[VoiceControl] Backend response:", response);

      // Instruction / how-to: 3D robot handles TTS (walk to user, then speak); just notify
      if (response?.instruction_topic) {
        this.notifyStatus("idle", {
          success: true,
          instructionTopic: response.instruction_topic,
          instructionText: response.instruction_text, // Pass dynamic text if available
        });
        return;
      }

      let action: string | undefined;
      let device: string | undefined;
      let noMatch = false;

      if (response?.actions && response.actions.length > 0) {
        // Parse-only phase: extract the first actionable intent and let robot execute after movement.
        const parsedAction = response.actions.find((a: any) => a.action && a.device);
        if (parsedAction) {
          action = parsedAction.action;
          device = parsedAction.device;
          const deviceId = parsedAction.device_id;
          console.log("[VoiceControl] Parsed command intent:", {
            action,
            device,
            deviceId,
          });
          this.notifyStatus("idle", {
            success: true,
            action,
            device,
            deviceId,
            commandText: trimmedTranscript,
            executeAfterMovement: false,
            noMatch: false,
          });
          return;
        }
        console.warn("[VoiceControl] No actionable item found in response");
        this.notifyStatus("idle", { success: false, noMatch: true });
        return;
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
      speakSeeYouAgain();
      this.notifyStatus("idle", {
        success: false,
        noMatch: true,
        serverError: true,
      });
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
        if (this.fallbackStopTimeout) {
          clearTimeout(this.fallbackStopTimeout);
          this.fallbackStopTimeout = null;
        }

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
          speakSeeYouAgain();
          this.notifyStatus("idle", { cancelled: true });
          this.isListening = false;
          return;
        }

        this.notifyStatus("processing");

        try {
          const { transcript } =
            await BackendApiClient.getInstance().sendVoiceAudio(
              audioBlob,
              false,
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
            speakSeeYouAgain();
            this.notifyStatus("idle", { cancelled: true });
          } else {
            // Reuse the same transcript processing path as native SpeechRecognition.
            await this.processTranscript(transcript.trim());
          }
        } catch (error) {
          console.error("[VoiceControl] Fallback voice command failed:", error);
          speakSeeYouAgain();
          this.notifyStatus("idle", { success: false, noMatch: true, serverError: true });
        } finally {
          if (this.stopRequestedByUser) {
            this.notifyStatus("idle", { cancelled: true });
          }
          this.stopRequestedByUser = false;
          this.isListening = false;
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        if (this.fallbackStopTimeout) {
          clearTimeout(this.fallbackStopTimeout);
          this.fallbackStopTimeout = null;
        }
        console.error("[VoiceControl] MediaRecorder error:", event);
        stream.getTracks().forEach((t) => t.stop());
        this.stopSilenceDetection();
        speakSeeYouAgain();
        this.notifyStatus("idle", { cancelled: true });
        this.isListening = false;
      };

      this.mediaRecorder.start();
      this.isListening = true;
      this.notifyStatus("listening");

      // Set explicit safety timeout
      this.safetyTimeout = setTimeout(() => {
        this.stopFallbackRecording();
      }, this.MAX_RECORDING_DURATION);

      // Start silence detection
      this.setupSilenceDetection(stream);
    } catch (err) {
      console.error("[VoiceControl] Failed to start MediaRecorder:", err);
      speakSeeYouAgain();
      this.notifyStatus("idle", { cancelled: true });
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
      this.analyser.smoothingTimeConstant = 0.45; // Slightly smoother — fewer false “silence” ticks on Quest
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const frequencyData = new Uint8Array(bufferLength);

      let consecutiveSilenceChecks = 0;
      let heardSpeechThisTake = false;
      const CHECK_MS = 100;
      const REQUIRED_SILENCE_CHECKS = Math.ceil(
        this.SILENCE_DURATION / CHECK_MS,
      );

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

        const speechLikely =
          avgAmplitude > this.SOUND_THRESHOLD ||
          avgFrequency > this.FREQ_SOUND_THRESHOLD;
        // After the user has spoken, freq-only flicker (AC/fans) often stays above
        // threshold and prevents silence from accumulating — use time-domain for resets.
        const loudEnoughToResetSilence =
          avgAmplitude >
          this.SOUND_THRESHOLD * (heardSpeechThisTake ? 1.45 : 1);

        if (!heardSpeechThisTake) {
          if (speechLikely) {
            heardSpeechThisTake = true;
          }
        } else if (loudEnoughToResetSilence) {
          consecutiveSilenceChecks = 0;
        } else {
          consecutiveSilenceChecks++;
          if (consecutiveSilenceChecks >= REQUIRED_SILENCE_CHECKS) {
            this.stopFallbackRecording();
          }
        }
      }, CHECK_MS);
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

  private fallbackStopTimeout: any = null;

  private stopFallbackRecording() {
    this.stopSilenceDetection();
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.error("[VoiceControl] Error stopping MediaRecorder:", e);
      }

      // Fallback in case onstop doesn't fire
      if (this.fallbackStopTimeout) clearTimeout(this.fallbackStopTimeout);
      this.fallbackStopTimeout = setTimeout(() => {
        if (this.isListening) {
          console.warn("[VoiceControl] MediaRecorder onstop didn't fire, forcing cleanup");
          this.isListening = false;
          if (!this.stopRequestedByUser) {
            speakSeeYouAgain();
          }
          this.stopRequestedByUser = false;
          this.notifyStatus("idle", { cancelled: true });
        }
      }, 1000);
    } else if (this.isListening) {
      this.isListening = false;
      if (!this.stopRequestedByUser) {
        speakSeeYouAgain();
      }
      this.stopRequestedByUser = false;
      this.notifyStatus("idle", { cancelled: true });
    }
  }

  // ---- Public API ----

  public forceStopListening() {
    if (this.isListening) {
      this.stopRequestedByUser = true;
      speakSeeYouAgain();
      if (this.useFallback) {
        this.stopFallbackRecording();
      } else if (this.recognition) {
        this.clearNoActivityTimer();
        this.clearInterimOnlyTimer();
        this.clearNativeSafetyTimeout();
        this.recognition.stop();
        this.isListening = false;
        this.notifyStatus("idle", { cancelled: true });
      }
    } else {
      // Even if not currently listening, we might be about to start (e.g. pending timeouts)
      // Just say goodbye and ensure we are idle.
      speakSeeYouAgain();
      this.notifyStatus("idle", { cancelled: true });
    }
  }

  public async toggleListening() {
    if (this.isListening) {
      // User toggled off: say goodbye (like 2D dashboard) then stop
      speakSeeYouAgain();
      if (this.useFallback) {
        this.stopRequestedByUser = true;
        this.stopFallbackRecording();
      } else if (this.recognition) {
        this.clearNoActivityTimer();
        this.clearInterimOnlyTimer();
        this.clearNativeSafetyTimeout();
        this.recognition.stop();
        this.isListening = false;
        this.notifyStatus("idle", { cancelled: true });
      }
      return;
    }

    this.isListening = true;
    this.notifyStatus("listening");

    // Await greeting so the mic doesn't capture the robot's voice
    await speakGreeting();

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
      this.startNativeSafetyTimeout();
    } catch (e) {
      console.error("Failed to start recognition:", e);
    }
  }

  public update(delta: number) {
    // Optional: ECS update loop for future visual cues
  }
}
