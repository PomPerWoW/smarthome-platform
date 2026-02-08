import { BackendApiClient } from "../api/BackendApiClient";

export class VoiceControlSystem {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private onStatusChange:
    | ((status: "listening" | "processing" | "idle") => void)
    | null = null;

  constructor() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      if (this.recognition) {
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = "en-US";

        this.setupListeners();
      }
    } else {
      console.warn("Speech Recognition not supported in this environment.");
    }
  }

  public setStatusListener(
    callback: (status: "listening" | "processing" | "idle") => void,
  ) {
    this.onStatusChange = callback;
  }

  private setupListeners() {
    if (!this.recognition) return;

    this.recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      console.log("Voice Command:", transcript);

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
      if (this.isListening && this.onStatusChange) {
        // Handle unexpected stop
      }
    };
  }

  public toggleListening() {
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
