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
        }
      );

      // XR Button
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

        this.world.visibilityState.subscribe((visibilityState) => {
          if (visibilityState === VisibilityState.NonImmersive) {
            xrButton.setProperties({ text: "Enter AR" });
          } else {
            xrButton.setProperties({ text: "Exit to Browser" });
          }
        });
      }

      // Refresh Button
      const refreshButton = document.getElementById(
        "refresh-button"
      ) as UIKit.Text;
      if (refreshButton) {
        refreshButton.addEventListener("click", async () => {
          console.log("[Panel] Refreshing devices...");
          await store.refreshDevices();
        });
      }
    });
  }
}
