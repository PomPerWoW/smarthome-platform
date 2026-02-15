import { VoiceControlSystem, type VoiceIdlePayload } from "../systems/VoiceControlSystem";

export type VoiceStatus = "listening" | "processing" | "idle";

export class VoicePanel {
  private container: HTMLDivElement;
  private button: HTMLButtonElement;
  private icon: HTMLElement;
  private system: VoiceControlSystem;
  private onVoiceStatus?: (status: VoiceStatus, payload?: VoiceIdlePayload) => void;

  constructor(
    system: VoiceControlSystem,
    onVoiceStatus?: (status: VoiceStatus, payload?: VoiceIdlePayload) => void,
  ) {
    this.system = system;
    this.onVoiceStatus = onVoiceStatus ?? undefined;
    this.container = document.createElement("div");
    this.button = document.createElement("button");
    this.icon = document.createElement("i");

    this.setupUI();
    this.setupListeners();
  }

  private setupUI() {
    this.container.style.position = "absolute";
    this.container.style.bottom = "20px";
    this.container.style.left = "50%";
    this.container.style.transform = "translateX(-50%)";
    this.container.style.zIndex = "99999";

    this.button.style.width = "60px";
    this.button.style.height = "60px";
    this.button.style.borderRadius = "50%";
    this.button.style.backgroundColor = "#2563eb";
    this.button.style.border = "2px solid white";
    this.button.style.cursor = "pointer";
    this.button.style.display = "flex";
    this.button.style.alignItems = "center";
    this.button.style.justifyContent = "center";
    this.button.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
    this.button.style.transition = "all 0.2s";

    // Simple SVG Mic Icon
    this.button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    `;

    this.container.appendChild(this.button);
    document.body.appendChild(this.container);
  }

  private setupListeners() {
    this.button.addEventListener("click", () => {
      this.system.toggleListening();
    });

    this.system.setStatusListener((status, payload) => {
      if (status === "listening") {
        this.button.style.backgroundColor = "#ef4444";
        this.button.style.transform = "scale(1.1)";
      } else if (status === "processing") {
        this.button.style.backgroundColor = "#f59e0b";
        this.button.style.transform = "scale(1.0)";
      } else {
        this.button.style.backgroundColor = "#2563eb";
        this.button.style.transform = "scale(1.0)";
      }
      this.onVoiceStatus?.(status, payload);
    });
  }
}
