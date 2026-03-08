import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  VisibilityState,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";

import { deviceStore, getStore } from "../store/DeviceStore";
import { getAuth } from "../api/auth";

export class PanelSystem extends createSystem({
  welcomePanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/welcome.json")],
  },
}) {
  init() {
    this.queries.welcomePanel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) {
        return;
      }

      const store = getStore();
      const auth = getAuth();
      const user = auth.getUser();

      // Update user email
      const userEmail = document.getElementById("user-email") as UIKit.Text;
      if (userEmail && user) {
        userEmail.setProperties({ text: user.email });
      }

      // Update device stats
      const deviceStats = document.getElementById("device-stats") as UIKit.Text;
      if (deviceStats) {
        const count = store.getDeviceCount();
        const active = store.getActiveDevices().length;
        deviceStats.setProperties({
          text: `${count} devices | ${active} active`,
        });
      }

      // Subscribe to device changes to update stats
      deviceStore.subscribe(
        (state) => state.devices,
        () => {
          if (deviceStats) {
            const count = store.getDeviceCount();
            const active = store.getActiveDevices().length;
            deviceStats.setProperties({
              text: `${count} devices | ${active} active`,
            });
          }
        },
      );

      // ── AR / VR Mode Toggle ────────────────────────────────────────
      let isARMode = false; // Default: VR mode (room model visible)
      (globalThis as any).__sceneMode = "vr";

      const vrModeBtn = document.getElementById("vr-mode-btn");
      const arModeBtn = document.getElementById("ar-mode-btn");

      const applyMode = (ar: boolean) => {
        isARMode = ar;
        (globalThis as any).__sceneMode = ar ? "ar" : "vr";

        // Toggle room model visibility
        const roomModel = (globalThis as any).__labRoomModel;
        if (roomModel) {
          roomModel.visible = !ar;
        }

        // Update mode button styling via backgroundColor
        if (vrModeBtn) {
          vrModeBtn.setProperties({
            backgroundColor: ar ? "#27272a" : "#7c3aed",
          });
        }
        if (arModeBtn) {
          arModeBtn.setProperties({
            backgroundColor: ar ? "#7c3aed" : "#27272a",
          });
        }

        // Update XR button text when not in XR
        const xrBtn = document.getElementById("xr-button") as UIKit.Text;
        if (
          xrBtn &&
          this.world.visibilityState.value === VisibilityState.NonImmersive
        ) {
          xrBtn.setProperties({
            text: ar ? "Enter AR" : "Enter VR",
          });
        }

        console.log(`[Panel] Mode switched to: ${ar ? "AR" : "VR"}`);
      };

      if (vrModeBtn) {
        vrModeBtn.addEventListener("click", () => applyMode(false));
      }
      if (arModeBtn) {
        arModeBtn.addEventListener("click", () => applyMode(true));
      }

      // ── XR Button ────────────────────────────────────────────────────
      const xrButton = document.getElementById("xr-button") as UIKit.Text;
      if (xrButton) {
        xrButton.addEventListener("click", () => {
          if (
            this.world.visibilityState.value === VisibilityState.NonImmersive
          ) {
            this.world.launchXR();
          } else {
            this.world.exitXR();
          }
        });

        // Set initial text based on default mode (VR)
        xrButton.setProperties({
          text: isARMode ? "Enter AR" : "Enter VR",
        });

        this.world.visibilityState.subscribe((visibilityState) => {
          if (visibilityState === VisibilityState.NonImmersive) {
            xrButton.setProperties({
              text: isARMode ? "Enter AR" : "Enter VR",
            });
          } else {
            xrButton.setProperties({ text: "Exit to Browser" });
          }
        });
      }

      // Refresh Button
      const refreshButton = document.getElementById(
        "refresh-button",
      ) as UIKit.Text;
      if (refreshButton) {
        refreshButton.addEventListener("click", async () => {
          console.log("[Panel] Refreshing devices...");
          await store.refreshDevices();
        });
      }

      // Devices Button → toggle placement panel
      const devicesButton = document.getElementById(
        "devices-button",
      ) as UIKit.Text;
      if (devicesButton) {
        devicesButton.addEventListener("click", () => {
          console.log("[Panel] Toggling placement panel");
          const placementEntity = (globalThis as any).__placementPanelEntity;
          if (placementEntity?.object3D) {
            placementEntity.object3D.visible =
              !placementEntity.object3D.visible;
          }
        });
      }

      // Align Room Button → toggle alignment panel
      const alignButton = document.getElementById(
        "align-room-button",
      ) as UIKit.Text;
      if (alignButton) {
        alignButton.addEventListener("click", () => {
          console.log("[Panel] Toggling room alignment panel");
          const alignEntity = (globalThis as any).__alignmentPanelEntity;
          if (alignEntity?.object3D) {
            alignEntity.object3D.visible = !alignEntity.object3D.visible;
          }
        });
      }
    });
  }
}
