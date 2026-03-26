import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
} from "@iwsdk/core";

import { wallpaperStore, getWallpaperStore } from "../store/WallpaperStore";
import { confirmWallSelection } from "../systems/WallpaperSystem";
import { WallInfo } from "../utils/wallDetection";

/**
 * WallSelectionPanelSystem
 *
 * Manages the floating wall-selection panel that appears after the user has
 * picked a wallpaper image / colour.  It:
 *
 *  • Subscribes to `WallpaperStore.isSelectingWall` and shows / hides the
 *    panel accordingly.
 *  • Refreshes the four wall buttons (north / south / east / west) with
 *    the current room dimensions every time the panel opens.
 *  • Calls `confirmWallSelection(wallId)` when the user taps a button.
 *  • Hides the panel and calls `cancelPlacement()` when the user taps Cancel.
 */
export class WallSelectionPanelSystem extends createSystem({
  wallPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/wall-selection-panel.json")],
  },
}) {
  /** Panel entity reference stored on first qualify. */
  private _panelEntity: any = null;
  private _uiDoc: UIKitDocument | null = null;

  /** Zustand unsubscribe handle. */
  private _unsubscribe: (() => void) | null = null;

  // ─── Wall button ids that match element ids in the .uikitml panel ─────────
  private static readonly WALL_IDS = [
    "north",
    "south",
    "east",
    "west",
  ] as const;

  // ────────────────────────────────────────────────────────────────────────────
  //  ECS lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  init() {
    // Subscribe to isSelectingWall changes so we can show / hide the panel
    // even before the ECS entity qualifies (panel may not exist yet on first
    // tick).
    this._unsubscribe = (wallpaperStore as any).subscribe(
      (state: any) => state.isSelectingWall,
      (isSelecting: boolean) => {
        this._syncVisibility(isSelecting);
        if (isSelecting) {
          this._refreshWallButtons();
        }
      },
    );

    this.queries.wallPanel.subscribe("qualify", (entity) => {
      this._panelEntity = entity;

      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      this._uiDoc = doc;

      this._wireButtons(doc);

      // Sync with current store state in case placement already started
      const state = getWallpaperStore();
      this._syncVisibility(state.isSelectingWall);
      if (state.isSelectingWall) this._refreshWallButtons();
    });

    this.queries.wallPanel.subscribe("disqualify", () => {
      this._panelEntity = null;
      this._uiDoc = null;
    });
  }

  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Button wiring
  // ────────────────────────────────────────────────────────────────────────────

  private _wireButtons(doc: UIKitDocument) {
    // Wall selection buttons
    for (const wallId of WallSelectionPanelSystem.WALL_IDS) {
      const btn = doc.getElementById(`wall-${wallId}`);
      if (btn) {
        btn.addEventListener("click", () => {
          console.log(`[WallSelectionPanel] Wall selected: ${wallId}`);
          confirmWallSelection(wallId);
          this._hide();
        });
      }
    }

    // Cancel button
    const cancelBtn = doc.getElementById("wall-cancel");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        console.log("[WallSelectionPanel] Cancelled");
        wallpaperStore.getState().cancelPlacement();
        this._hide();
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Dynamic wall button labels
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Update each wall button's label to show the wall name and its dimensions
   * (e.g. "North Wall  4.20m × 2.78m") so the user can make an informed
   * choice.  Buttons for walls that have negligible dimensions are hidden.
   */
  private _refreshWallButtons() {
    const doc = this._uiDoc;
    if (!doc) return;

    const walls = getWallpaperStore().availableWalls;
    const wallMap = new Map<string, WallInfo>(walls.map((w) => [w.id, w]));

    for (const wallId of WallSelectionPanelSystem.WALL_IDS) {
      const btn = doc.getElementById(`wall-${wallId}`);
      if (!btn) continue;

      const info = wallMap.get(wallId);
      if (!info || info.width < 0.1 || info.height < 0.1) {
        // Hide button if wall is too small or not detected
        (btn as any).style = { ...(btn as any).style, display: "none" };
        continue;
      }

      // Update button text
      const labelEl = doc.getElementById(`wall-${wallId}-label`);
      if (labelEl) {
        (labelEl as any).textContent =
          `${info.label}  ${info.width.toFixed(2)}m × ${info.height.toFixed(2)}m`;
      }

      // Make sure it's visible
      (btn as any).style = { ...(btn as any).style, display: "flex" };
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  //  Visibility helpers
  // ────────────────────────────────────────────────────────────────────────────

  private _syncVisibility(visible: boolean) {
    if (visible) {
      this._show();
    } else {
      this._hide();
    }
  }

  private _show() {
    const entity = this._panelEntity;
    if (entity?.object3D) {
      entity.object3D.visible = true;
    }
    // Also try the global reference set in index.ts
    const globalRef = (globalThis as any).__wallSelectionPanelEntity;
    if (globalRef?.object3D) {
      globalRef.object3D.visible = true;
    }
  }

  private _hide() {
    const entity = this._panelEntity;
    if (entity?.object3D) {
      entity.object3D.visible = false;
    }
    const globalRef = (globalThis as any).__wallSelectionPanelEntity;
    if (globalRef?.object3D) {
      globalRef.object3D.visible = false;
    }
  }
}
