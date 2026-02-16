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

  startListening(onResult: (text: string) => void, onEnd: () => void): void {
    if (!this.recognition) {
      toast.error("Voice control not supported in this browser.");
      return;
    }

    if (this.isListening) return;

    this.isListening = true;
    speakGreeting();

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

  stopListening(): void {
    if (this.recognition && this.isListening) {
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
