import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
} from "@iwsdk/core";

import { wallpaperStore, getWallpaperStore } from "../store/WallpaperStore";

/**
 * WallpaperCutoutPanelSystem
 *
 * Manages the floating cutout panel that appears after a wallpaper is placed
 * on a wall.  The panel has two steps mirroring the reference implementation:
 *
 *  • "prompt"  — asks the user "Cut out doors or windows?"
 *                with [Yes, cut out areas] and [No, skip] buttons.
 *
 *  • "drawing" — shows instructions for drawing rectangles on the wallpaper,
 *                a live count of marked areas, and [Undo] + [Confirm] buttons.
 *
 * The system subscribes to `WallpaperStore.cutoutState` and keeps the panel
 * visibility and content in sync with the current step.
 */
export class WallpaperCutoutPanelSystem extends createSystem({
  cutoutPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/wallpaper-cutout-panel.json")],
  },
}) {
  private _panelEntity: any = null;
  private _uiDoc: UIKitDocument | null = null;

  /** Zustand unsubscribe handles. */
  private _unsubscribers: Array<() => void> = [];

  // ────────────────────────────────────────────────────────────────────────────
  //  ECS lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  init() {
    console.log("[WallpaperCutoutPanelSystem] init");

    // React to cutoutState changes before the panel entity qualifies
    this._unsubscribers.push(
      (wallpaperStore as any).subscribe(
        (state: any) => state.cutoutState,
        (cutoutState: any) => {
          if (!cutoutState) {
            this._hide();
          } else {
            this._syncStep(
              cutoutState.step,
              cutoutState.lassoRegions?.length ?? 0,
            );
            this._show();
          }
        },
      ),
    );

    // Also react to lassoRegions count changes (updates the "N areas marked" label)
    this._unsubscribers.push(
      (wallpaperStore as any).subscribe(
        (state: any) => state.cutoutState?.lassoRegions?.length ?? -1,
        (count: number) => {
          if (count < 0) return;
          this._updateRegionCount(count);
        },
      ),
    );

    // Wire up the panel once it qualifies in the ECS query
    this.queries.cutoutPanel.subscribe("qualify", (entity) => {
      this._panelEntity = entity;

      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      this._uiDoc = doc;

      this._wireButtons(doc);

      // Sync immediately with current store state
      const state = getWallpaperStore();
      if (state.cutoutState) {
        this._syncStep(
          state.cutoutState.step,
          state.cutoutState.lassoRegions.length,
        );
        this._show();
      } else {
        this._hide();
      }
    });

    this.queries.cutoutPanel.subscribe("disqualify", () => {
      this._panelEntity = null;
      this._uiDoc = null;
    });
  }

  destroy() {
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Button wiring
  // ────────────────────────────────────────────────────────────────────────────

  private _wireButtons(doc: UIKitDocument) {
    // ── Prompt step buttons ────────────────────────────────────────────────

    const yesBtn = doc.getElementById("cutout-yes") as any;
    if (yesBtn) {
      yesBtn.addEventListener("click", () => {
        console.log("[WallpaperCutoutPanel] User chose: cut out areas");
        wallpaperStore.getState().cutoutAnswerYes();
      });
    } else {
      console.warn("[WallpaperCutoutPanel] #cutout-yes not found");
    }

    const noBtn = doc.getElementById("cutout-no") as any;
    if (noBtn) {
      noBtn.addEventListener("click", () => {
        console.log("[WallpaperCutoutPanel] User chose: skip cutouts");
        wallpaperStore.getState().cutoutAnswerNo();
        this._hide();
      });
    } else {
      console.warn("[WallpaperCutoutPanel] #cutout-no not found");
    }

    // ── Drawing step buttons ───────────────────────────────────────────────

    const undoBtn = doc.getElementById("cutout-undo") as any;
    if (undoBtn) {
      undoBtn.addEventListener("click", () => {
        console.log("[WallpaperCutoutPanel] Undo last region");
        wallpaperStore.getState().cutoutUndo();
      });
    } else {
      console.warn("[WallpaperCutoutPanel] #cutout-undo not found");
    }

    const confirmBtn = doc.getElementById("cutout-confirm") as any;
    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        console.log("[WallpaperCutoutPanel] Confirm cutouts");
        wallpaperStore.getState().cutoutConfirm();
        this._hide();
      });
    } else {
      console.warn("[WallpaperCutoutPanel] #cutout-confirm not found");
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Step synchronisation
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Show the correct set of UI elements for the current cutout step.
   *
   * The panel has two logical sections identified by ids:
   *  • `#cutout-prompt-section`  — visible only in "prompt" step
   *  • `#cutout-drawing-section` — visible only in "drawing" step
   */
  private _syncStep(step: "prompt" | "drawing", regionCount: number) {
    const doc = this._uiDoc;
    if (!doc) return;

    const promptSection = doc.getElementById("cutout-prompt-section");
    const drawingSection = doc.getElementById("cutout-drawing-section");

    if (promptSection) {
      (promptSection as any).style = {
        ...(promptSection as any).style,
        display: step === "prompt" ? "flex" : "none",
      };
    }

    if (drawingSection) {
      (drawingSection as any).style = {
        ...(drawingSection as any).style,
        display: step === "drawing" ? "flex" : "none",
      };
    }

    if (step === "drawing") {
      this._updateRegionCount(regionCount);
    }

    // Update step indicator label if present
    const stepLabel = doc.getElementById("cutout-step-label");
    if (stepLabel) {
      (stepLabel as any).textContent =
        step === "prompt"
          ? "Cut out doors or windows?"
          : "Draw rectangles on the wallpaper";
    }
  }

  /**
   * Refresh the "N area(s) marked" counter shown during the drawing step.
   */
  private _updateRegionCount(count: number) {
    const doc = this._uiDoc;
    if (!doc) return;

    const countEl = doc.getElementById("cutout-region-count");
    if (countEl) {
      (countEl as any).textContent =
        `${count} area${count !== 1 ? "s" : ""} marked`;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Visibility helpers
  // ────────────────────────────────────────────────────────────────────────────

  private _show() {
    this._setVisible(true);
  }

  private _hide() {
    this._setVisible(false);
  }

  private _setVisible(visible: boolean) {
    // Entity reference from ECS query
    if (this._panelEntity?.object3D) {
      this._panelEntity.object3D.visible = visible;
    }
    // Global reference stored in index.ts
    const globalRef = (globalThis as any).__cutoutPanelEntity;
    if (globalRef?.object3D) {
      globalRef.object3D.visible = visible;
    }
  }
}
