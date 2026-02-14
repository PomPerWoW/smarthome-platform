import { ApiService } from "./ApiService";
import { toast } from "sonner";

// Type definition for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export class VoiceService {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private useFallback: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];

  // Silence detection
  private audioContext: any = null;
  private analyser: any = null;
  private silenceCheckInterval: any = null;
  private safetyTimeout: any = null;
  private silenceStart: number = 0;
  private readonly SILENCE_DURATION = 1000; // Reduced to 1.0s for better responsiveness
  private readonly MAX_RECORDING_DURATION = 8000; // 8s max duration
  private readonly SOUND_THRESHOLD = 10; // Amplitude threshold

  constructor() {
    const isQuest =
      navigator.userAgent.includes("OculusBrowser") ||
      navigator.userAgent.includes("SamsungBrowser"); // Sometimes Quest spoof
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition && !isQuest) {
      console.log("[VoiceService] Using SpeechRecognition");
      this.recognition = new SpeechRecognition();
      if (this.recognition) {
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = "en-US";
      }
    } else {
      console.log(
        "[VoiceService] Forcing MediaRecorder fallback (Quest/Unsupported)",
      );
      this.useFallback = true;
    }
  }

  startListening(onResult: (text: string) => void, onEnd: () => void): void {
    if (this.isListening) return;

    if (this.useFallback) {
      this.startFallbackRecording(onResult, onEnd);
      return;
    }

    if (!this.recognition) {
      toast.error("Voice control not supported in this browser.");
      return;
    }

    this.isListening = true;

    this.recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);

      try {
        await this.sendVoiceCommand(transcript);
        toast.success(`Executed: "${transcript}"`);
      } catch (error) {
        console.error(error);
        toast.error("Failed to process command.");
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error("Speech error", event);
      toast.error("Error hearing voice command.");
      this.isListening = false;
      onEnd();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      onEnd();
    };

    this.recognition.start();
  }

  private async startFallbackRecording(
    onResult: (text: string) => void,
    onEnd: () => void,
  ): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.isListening = true;

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
        // Clear safety timeout
        if (this.safetyTimeout) {
          clearTimeout(this.safetyTimeout);
          this.safetyTimeout = null;
        }

        stream.getTracks().forEach((t) => t.stop());

        const audioBlob = new Blob(this.audioChunks, { type: mimeType });
        if (audioBlob.size === 0) {
          console.warn("[VoiceService] Empty recording — ignoring");
          this.isListening = false;
          onEnd();
          return;
        }

        try {
          // Optimized: Transcribe AND Execute
          const { transcript, command_result } = await this.sendVoiceAudio(audioBlob, true);
          console.log("[VoiceService] Transcribed:", transcript);
          onResult(transcript);

          if (command_result) {
            toast.success(`Executed: "${transcript}"`);
          } else if (!transcript || !transcript.trim()) {
            toast.error("No speech detected.");
          }
        } catch (error) {
          console.error("[VoiceService] Fallback failed:", error);
          toast.error("Failed to process voice command.");
        } finally {
          this.isListening = false;
          onEnd();
        }
      };

      this.mediaRecorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        this.stopSilenceDetection();
        toast.error("Microphone recording failed.");
        this.isListening = false;
        onEnd();
      };

      this.mediaRecorder.start();

      // Start safety timeout (8s max)
      this.safetyTimeout = setTimeout(() => {
        console.log("[VoiceService] Safety timeout reached (8s), stopping.");
        this.stopListening();
      }, this.MAX_RECORDING_DURATION);

      // Start silence detection
      this.setupSilenceDetection(stream);

    } catch (err) {
      console.error("[VoiceService] getUserMedia failed:", err);
      toast.error("Could not access microphone.");
      onEnd();
    }
  }

  private setupSilenceDetection(stream: MediaStream) {
    const AudioContextClass =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn("[VoiceService] AudioContext not available");
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
          sum += Math.abs(dataArray[i] - 128); // 128 = silence
        }
        const avg = sum / bufferLength;

        if (avg > this.SOUND_THRESHOLD) {
          this.silenceStart = Date.now();
        } else {
          if (Date.now() - this.silenceStart > this.SILENCE_DURATION) {
            console.log("[VoiceService] Silence detected, stopping.");
            this.stopListening();
          }
        }
      }, 100);
    } catch (e) {
      console.error("[VoiceService] Failed to setup silence detection:", e);
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

  stopListening(): void {
    if (this.useFallback) {
      this.stopSilenceDetection();
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      }
      return;
    }

    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  private async sendVoiceCommand(command: string) {
    return ApiService.getInstance().post("/api/homes/voice/command/", {
      command,
    });
  }

  private async sendVoiceAudio(
    blob: Blob,
    execute: boolean = false,
  ): Promise<{ transcript: string; command_result?: any }> {
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");
    formData.append("execute", execute.toString());
    return ApiService.getInstance().post<{ transcript: string; command_result?: any }>(
      "/api/homes/voice/transcribe/",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
  }
}

export const voiceService = new VoiceService();
