import { ApiService } from "./ApiService";
import { speakGreeting, speakSeeYouAgain } from "./VoiceTextToSpeech";
import { toast } from "sonner"; // Assuming sonner is used for notifications based on pkg.json

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
  private stopRequested: boolean = false;

  constructor() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      if (this.recognition) {
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = "en-US";
      }
    } else {
      console.warn("Speech Recognition not supported in this browser.");
    }
  }

  startListening(
    onResult: (text: string) => void,
    onEnd: () => void,
    onStatusChange?: (
      status: "listening" | "processing" | "idle",
      payload?: { success?: boolean; cancelled?: boolean },
    ) => void,
  ): void {
    if (!this.recognition) {
      toast.error("Voice control not supported in this browser.");
      return;
    }

    if (this.isListening) return;

    this.isListening = true;
    this.stopRequested = false;
    speakGreeting();
    onStatusChange?.("listening");

    this.recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
      onStatusChange?.("processing");

      try {
        await this.sendVoiceCommand(transcript);
        toast.success(`Executed: "${transcript}"`);
        onStatusChange?.("idle", { success: true });
      } catch (error) {
        console.error(error);
        toast.error("Failed to process command.");
        onStatusChange?.("idle", { success: false });
      }
    };

    this.recognition.onerror = (event: any) => {
      // Note: calling recognition.stop() commonly triggers an "aborted" error.
      // Treat that as a user-cancel so the UI/robot flow stays consistent.
      const err = String(event?.error ?? "");
      if (this.stopRequested || err === "aborted") {
        this.stopRequested = false;
        this.isListening = false;
        onStatusChange?.("idle", { cancelled: true });
        onEnd();
        return;
      }

      console.error("Speech error", event);
      toast.error("Error hearing voice command.");
      this.isListening = false;
      onStatusChange?.("idle", { success: false });
      onEnd();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.stopRequested) {
        this.stopRequested = false;
        onStatusChange?.("idle", { cancelled: true });
      }
      onEnd();
    };

    this.recognition.start();
  }

  stopListening(): void {
    if (this.recognition && this.isListening) {
      this.stopRequested = true;
      this.recognition.stop();
      this.isListening = false;
      speakSeeYouAgain();
    }
  }

  private async sendVoiceCommand(command: string) {
    // Assuming the base URL is set in ApiService's axios instance
    // Calling the endpoint we created: POST /api/homes/voice/command/
    return ApiService.getInstance().post("/api/homes/voice/command/", {
      command,
    });
  }
}

export const voiceService = new VoiceService();
