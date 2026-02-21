import { BackendApiClient } from "../api/BackendApiClient";

export class VoiceControlSystem {
  private static instance: VoiceControlSystem;

  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private useFallback: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private onStatusChange:
    | ((status: "listening" | "processing" | "idle") => void)
    | null = null;

  // New: Transcript callback
  private onTranscript: ((text: string) => void) | null = null;

  // Silence detection
  private audioContext: any = null;
  private analyser: any = null;
  private silenceCheckInterval: any = null;
  private safetyTimeout: any = null;
  private silenceStart: number = 0;
  private readonly SILENCE_DURATION = 1000;
  private readonly MAX_RECORDING_DURATION = 8000;
  private readonly SOUND_THRESHOLD = 10;

  private constructor() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      console.log("[VoiceControl] Using native SpeechRecognition");
      this.recognition = new SpeechRecognition();
      if (this.recognition) {
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = "en-US";
        this.setupListeners();
      }
    } else {
      console.log(
        "[VoiceControl] Forcing MediaRecorder fallback (Unsupported)",
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

  public setStatusListener(
    callback: (status: "listening" | "processing" | "idle") => void,
  ) {
    this.onStatusChange = callback;
  }

  public setTranscriptListener(callback: (text: string) => void) {
    this.onTranscript = callback;
  }

  private setupListeners() {
    if (!this.recognition) return;

    this.recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log("Voice Command:", transcript);

      // Notify transcript
      if (this.onTranscript) this.onTranscript(transcript);

      if (this.onStatusChange) this.onStatusChange("processing");

      try {
        await BackendApiClient.getInstance().sendVoiceCommand(transcript);
        console.log("Voice command executed successfully.");
      } catch (error) {
        console.error("Failed to execute voice command:", error);
      } finally {
        if (this.onStatusChange) this.onStatusChange("idle");
        this.isListening = false;
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error:", event);
      if (this.onStatusChange) this.onStatusChange("idle");
      this.isListening = false;
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        this.isListening = false;
        if (this.onStatusChange) this.onStatusChange("idle");
      }
    };
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
          if (this.onStatusChange) this.onStatusChange("idle");
          this.isListening = false;
          return;
        }

        if (this.onStatusChange) this.onStatusChange("processing");

        try {
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

          if (command_result) {
            console.log("[VoiceControl] Command Executed:", command_result);
          } else if (!transcript || !transcript.trim()) {
            console.warn("[VoiceControl] Empty transcript — ignoring");
          }
        } catch (error) {
          console.error("[VoiceControl] Fallback voice command failed:", error);
        } finally {
          if (this.onStatusChange) this.onStatusChange("idle");
          this.isListening = false;
        }
      };

      this.mediaRecorder.onerror = (event: Event) => {
        console.error("[VoiceControl] MediaRecorder error:", event);
        stream.getTracks().forEach((t) => t.stop());
        this.stopSilenceDetection();
        if (this.onStatusChange) this.onStatusChange("idle");
        this.isListening = false;
      };

      this.mediaRecorder.start();
      this.isListening = true;
      if (this.onStatusChange) this.onStatusChange("listening");

      // Set explicit safety timeout (8s max)
      this.safetyTimeout = setTimeout(() => {
        console.log("[VoiceControl] Safety timeout reached (8s), stopping.");
        this.stopFallbackRecording();
      }, this.MAX_RECORDING_DURATION);

      // Start silence detection
      this.setupSilenceDetection(stream);
    } catch (err) {
      console.error("[VoiceControl] Failed to start MediaRecorder:", err);
      if (this.onStatusChange) this.onStatusChange("idle");
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

  public toggleListening() {
    if (this.useFallback) {
      if (this.isListening) {
        this.stopFallbackRecording();
      } else {
        this.startFallbackRecording();
      }
      return;
    }

    // SpeechRecognition path
    if (!this.recognition) return;

    if (this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      if (this.onStatusChange) this.onStatusChange("idle");
    } else {
      try {
        this.recognition.start();
        this.isListening = true;
        if (this.onStatusChange) this.onStatusChange("listening");
      } catch (e) {
        console.error("Failed to start recognition:", e);
      }
    }
  }

  public update(delta: number) {
    // Optional: ECS update loop for future visual cues
  }
}
