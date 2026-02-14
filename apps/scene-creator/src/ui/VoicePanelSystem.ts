import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";

import { VoiceControlSystem } from "../systems/VoiceControlSystem";
import { Object3D, Vector3, Quaternion } from "three";

export class VoicePanelSystem extends createSystem({
  voicePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/voice_panel.json")],
  },
}) {
  private voiceSystem: VoiceControlSystem;
  private currentStatus: "listening" | "processing" | "idle" = "idle";

  // Follow logic
  private targetPosition = new Vector3();
  private currentPosition = new Vector3();
  private tempVec = new Vector3();
  private tempQuat = new Quaternion();

  constructor(world: any) {
    super(world);
    this.voiceSystem = VoiceControlSystem.getInstance();
  }

  init() {
    this.queries.voicePanel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) return;

      const micButton = document.getElementById("mic-button") as UIKit.Container;
      const statusText = document.getElementById("voice-status") as UIKit.Text;

      if (micButton) {
        micButton.addEventListener("click", () => {
          // Haptic feedback if available (simulated)
          if (navigator.vibrate) navigator.vibrate(50);
          this.voiceSystem.toggleListening();
        });
      }

      this.voiceSystem.setStatusListener((status) => {
        this.currentStatus = status;

        if (micButton && statusText) {
          if (status === "listening") {
            micButton.setProperties({ backgroundColor: "#ef4444" }); // Red
            statusText.setProperties({ text: "Listening..." });
          } else if (status === "processing") {
            micButton.setProperties({ backgroundColor: "#eab308" }); // Yellow/Orange
            statusText.setProperties({ text: "Processing..." });
          } else {
            micButton.setProperties({ backgroundColor: "#2563eb" }); // Blue
            statusText.setProperties({ text: "Say 'Turn on...'" });
          }
        }
      });

      // Initial state
      if (statusText) statusText.setProperties({ text: "Say 'Turn on...'" });
    });
  }

  execute(delta: number) {
    this.queries.voicePanel.forEach((entity) => {
      const object3D = entity.getComponent(Object3D);
      const camera = this.world.camera;

      if (object3D && camera) {
        // Calculate target position: 0.4m in front of camera, 0.2m down
        this.targetPosition.copy(camera.position);

        // forward vector
        camera.getWorldDirection(this.tempVec);
        this.tempVec.y = 0; // Flatten the forward vector
        this.tempVec.normalize();

        // Offset
        this.targetPosition.addScaledVector(this.tempVec, 0.4);
        this.targetPosition.y -= 0.15; // Slightly lower

        // Lerp for smooth movement
        // If distance is large (teleport), snap instantly
        if (object3D.position.distanceTo(this.targetPosition) > 1.0) {
          object3D.position.copy(this.targetPosition);
        } else {
          object3D.position.lerp(this.targetPosition, 5 * delta);
        }

        // Always face the camera
        object3D.lookAt(camera.position);
      }
    });
  }
}
