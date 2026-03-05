import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";

import { getStore } from "../store/DeviceStore";
import { DeviceType } from "../types";

export class PlacementPanelSystem extends createSystem({
  placementPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/placement-panel.json")],
  },
}) {
  init() {
    this.queries.placementPanel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) return;

      const store = getStore();

      // Wire up placement buttons
      const buttons: Array<{ id: string; type: DeviceType }> = [
        { id: "place-lightbulb", type: DeviceType.Lightbulb },
        { id: "place-television", type: DeviceType.Television },
        { id: "place-fan", type: DeviceType.Fan },
        { id: "place-ac", type: DeviceType.AirConditioner },
        { id: "place-chair", type: DeviceType.Chair },
        { id: "place-chair2", type: DeviceType.Chair2 },
        { id: "place-chair3", type: DeviceType.Chair3 },
        { id: "place-chair4", type: DeviceType.Chair4 },
        { id: "place-chair5", type: DeviceType.Chair5 },
        { id: "place-chair6", type: DeviceType.Chair6 },
      ];

      for (const { id, type } of buttons) {
        const btn = document.getElementById(id);
        if (btn) {
          btn.addEventListener("click", () => {
            console.log(`[PlacementPanel] Selected: ${type}`);
            store.setPlacementMode(type);

            // Hide the placement panel after selection
            if (entity.object3D) {
              entity.object3D.visible = false;
            }
          });
        }
      }

      // Close button
      const closeBtn = document.getElementById("close-placement");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          console.log("[PlacementPanel] Closed");
          if (entity.object3D) {
            entity.object3D.visible = false;
          }
        });
      }

      // Store reference for toggling
      (globalThis as any).__placementPanelEntity = entity;
    });
  }
}
