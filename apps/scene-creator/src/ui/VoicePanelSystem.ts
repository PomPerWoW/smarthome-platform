import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Object3D,
} from "@iwsdk/core";

import { VoiceControlSystem } from "../systems/VoiceControlSystem";

export class VoicePanelSystem extends createSystem({
  voicePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/voice_panel.json")],
  },
}) {
  private voiceSystem!: VoiceControlSystem;
  private currentStatus: "listening" | "processing" | "idle" = "idle";

  // Follow logic - store reference to the panel's Object3D
  private panelObject3D: any = null;

  // Status reset timer
  private resetStatusTimeout: any = null;

  init() {
    this.voiceSystem = VoiceControlSystem.getInstance();
    this.queries.voicePanel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) return;

      // Store the Object3D reference for follow behavior
      this.panelObject3D = entity.object3D;

      const micButton = document.getElementById("mic-button") as UIKit.Container;
      const statusText = document.getElementById("voice-status") as UIKit.Text;

      if (micButton) {
        micButton.addEventListener("click", () => {
          // Haptic feedback if available (simulated)
          if (navigator.vibrate) navigator.vibrate(50);
          this.voiceSystem.toggleListening();
        });
      }

      this.voiceSystem.setTranscriptListener((text) => {
        if (statusText) {
          statusText.setProperties({ text: `"${text}"` });

          // Reset to default after 3 seconds
          if (this.resetStatusTimeout) clearTimeout(this.resetStatusTimeout);
          this.resetStatusTimeout = setTimeout(() => {
            if (this.currentStatus === "idle") {
              statusText.setProperties({ text: "Say 'Turn on...'" });
            }
          }, 3000);
        }
      });

      this.voiceSystem.setStatusListener((status) => {
        this.currentStatus = status;

        if (micButton && statusText) {
          if (status === "listening") {
            micButton.setProperties({ backgroundColor: "#ef4444" }); // Red
            statusText.setProperties({ text: "Listening..." });
            // Clear any old timeout
            if (this.resetStatusTimeout) clearTimeout(this.resetStatusTimeout);
          } else if (status === "processing") {
            micButton.setProperties({ backgroundColor: "#eab308" }); // Yellow/Orange
            statusText.setProperties({ text: "Processing..." });
          } else {
            micButton.setProperties({ backgroundColor: "#2563eb" }); // Blue
            // If we just finished (idle), don't immediately overwrite the transcript
            // The transcript listener will handle showing the result, then resetting
            if (!this.resetStatusTimeout) {
              statusText.setProperties({ text: "Say 'Turn on...'" });
            }
          }
        }
      });

      // Initial state
      if (statusText) statusText.setProperties({ text: "Say 'Turn on...'" });
    });
  }

  update(dt: number) {
    if (!this.panelObject3D) return;

    const camera = this.world.camera;
    if (!camera) return;

    // Calculate target position: 0.4m in front of camera, slightly lower
    const camDir = camera.getWorldDirection(new Object3D().position.clone().set(0, 0, 0));
    camDir.y = 0; // Flatten the forward vector
    camDir.normalize();

    const targetX = camera.position.x + camDir.x * 0.4;
    const targetY = camera.position.y - 0.15;
    const targetZ = camera.position.z + camDir.z * 0.4;

    // Lerp for smooth movement
    const dx = targetX - this.panelObject3D.position.x;
    const dy = targetY - this.panelObject3D.position.y;
    const dz = targetZ - this.panelObject3D.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 1.0) {
      // Snap if too far (e.g. teleport)
      this.panelObject3D.position.set(targetX, targetY, targetZ);
    } else {
      const t = Math.min(1, 5 * dt);
      this.panelObject3D.position.x += dx * t;
      this.panelObject3D.position.y += dy * t;
      this.panelObject3D.position.z += dz * t;
    }

    // Always face the camera
    this.panelObject3D.lookAt(camera.position);
  }
}

