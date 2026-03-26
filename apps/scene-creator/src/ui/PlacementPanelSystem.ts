import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
} from "@iwsdk/core";

import { getStore } from "../store/DeviceStore";
import { DeviceType } from "../types";
import {
  applyColorWallpaper,
  pickAndApplyWallpaper,
  removeAllWallpaper,
} from "../systems/WallpaperSystem";
import { WALLPAPER_PRESETS } from "../utils/wallDetection";

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

      // ── Device / furniture buttons ─────────────────────────────────────────
      const deviceButtons: Array<{ id: string; type: DeviceType }> = [
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

      for (const { id, type } of deviceButtons) {
        const btn = document.getElementById(id);
        if (btn) {
          btn.addEventListener("click", () => {
            console.log(`[PlacementPanel] Device selected: ${type}`);
            store.setPlacementMode(type);
            if (entity.object3D) entity.object3D.visible = false;
          });
        }
      }

      // ── Wallpaper: upload custom image ─────────────────────────────────────
      const uploadBtn = document.getElementById("place-wallpaper-upload");
      if (uploadBtn) {
        uploadBtn.addEventListener("click", async () => {
          console.log("[PlacementPanel] Wallpaper: open image picker");
          if (entity.object3D) entity.object3D.visible = false;
          await pickAndApplyWallpaper();
        });
      }

      // ── Wallpaper: preset colour swatches ──────────────────────────────────
      //
      // Button ids in the panel   →   preset entry in WALLPAPER_PRESETS
      const presetButtonMap: Array<{ btnId: string; presetId: string }> = [
        { btnId: "place-wallpaper-white", presetId: "preset-white" },
        { btnId: "place-wallpaper-cream", presetId: "preset-cream" },
        { btnId: "place-wallpaper-sky", presetId: "preset-sky" },
        { btnId: "place-wallpaper-sage", presetId: "preset-sage" },
        { btnId: "place-wallpaper-blush", presetId: "preset-blush" },
        { btnId: "place-wallpaper-lavender", presetId: "preset-lavender" },
      ];

      for (const { btnId, presetId } of presetButtonMap) {
        const preset = WALLPAPER_PRESETS.find((p) => p.id === presetId);
        if (!preset) continue;

        const btn = document.getElementById(btnId);
        if (btn) {
          btn.addEventListener("click", () => {
            console.log(
              `[PlacementPanel] Wallpaper preset: ${preset.label} (${preset.color})`,
            );
            // Hide the placement panel immediately so the user can see the result
            if (entity.object3D) entity.object3D.visible = false;
            // Apply colour to all walls in one shot — no wall-selection step
            applyColorWallpaper(preset.color, preset.label);
          });
        }
      }

      // ── Wallpaper: remove / clear ──────────────────────────────────────────
      const removeBtn = document.getElementById("remove-wallpaper");
      if (removeBtn) {
        removeBtn.addEventListener("click", () => {
          console.log("[PlacementPanel] Wallpaper: remove all");
          if (entity.object3D) entity.object3D.visible = false;
          removeAllWallpaper();
        });
      }

      // ── Close button ───────────────────────────────────────────────────────
      const closeBtn = document.getElementById("close-placement");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          console.log("[PlacementPanel] Closed");
          if (entity.object3D) entity.object3D.visible = false;
        });
      }

      // Store reference for external toggling (e.g. WelcomePanelGestureSystem)
      (globalThis as any).__placementPanelEntity = entity;
    });
  }
}
