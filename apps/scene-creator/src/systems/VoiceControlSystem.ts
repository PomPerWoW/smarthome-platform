import { BackendApiClient } from "../api/BackendApiClient";

export type VoiceIdlePayload = { 
  success?: boolean; 
  cancelled?: boolean;
  action?: string;
  device?: string;
  noMatch?: boolean;
};

export class VoiceControlSystem {
  private recognition: SpeechRecognition | null = null;
  private isListening: boolean = false;
  private onStatusChange:
    | ((status: "listening" | "processing" | "idle", payload?: VoiceIdlePayload) => void)
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
    callback: (status: "listening" | "processing" | "idle", payload?: VoiceIdlePayload) => void,
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
        const response = await BackendApiClient.getInstance().sendVoiceCommand(transcript);
        console.log("Voice command executed successfully.");
        
        // Extract action and device from response for TTS
        let action: string | undefined;
        let device: string | undefined;
        let noMatch = false;
        
        if (response?.actions && response.actions.length > 0) {
          const firstAction = response.actions[0];
          if (firstAction.status === "success" && firstAction.action && firstAction.device) {
            action = firstAction.action;
            device = firstAction.device;
          } else {
            // Action failed
            if (this.onStatusChange) {
              this.onStatusChange("idle", { success: false });
            }
            this.isListening = false;
            return;
          }
        } else {
          // No actions found - out of scope or weird input
          noMatch = true;
        }
        
        if (this.onStatusChange) {
          this.onStatusChange("idle", { success: !noMatch, action, device, noMatch });
        }
      } catch (error) {
        console.error("Failed to execute voice command:", error);
        if (this.onStatusChange) this.onStatusChange("idle", { success: false });
      }
      this.isListening = false;
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
      if (this.onStatusChange) this.onStatusChange("idle", { cancelled: true });
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
