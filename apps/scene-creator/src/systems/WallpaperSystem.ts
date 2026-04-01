import { createSystem } from "@iwsdk/core";
import { Raycaster, Vector2, Vector3 } from "three";

import {
  wallpaperStore,
  getWallpaperStore,
  WallpaperCutoutRect,
} from "../store/WallpaperStore";
import {
  applyWallpaperToAll,
  clearAllWallpaper,
  applyWallpaperCutouts,
  setWallpaperOpacity,
  getWallpaperMesh,
  updateLassoConfirmOverlay,
  updateLassoPreviewOverlay,
} from "../entities/WallpaperRenderer";
import {
  decodeImageFileToWallpaperDataUrl,
  pickImageFile,
  solidColorDataUrl,
} from "../utils/wallDetection";
import { sceneNotify } from "../ui/SceneNotification";

/**
 * WallpaperSystem
 *
 * Single-step wallpaper flow:
 *   1. Caller invokes `applyWallpaperToAllWalls(imageDataUrl, name)`.
 *   2. System calls `applyWallpaperToAll()` which tries to paint the texture
 *      directly on room-model wall meshes, falling back to overlay planes.
 *   3. `WallpaperStore` is updated so the rest of the UI stays in sync.
 *   4. An optional cutout drawing mode is available for overlay-plane wallpapers.
 *
 * There is NO wall-selection step — the colour / image is applied to every
 * wall simultaneously on the single button click.
 */
export class WallpaperSystem extends createSystem({}) {
  // ── Three.js raycasting helpers ─────────────────────────────────────────
  private readonly _raycaster = new Raycaster();
  private readonly _mouse = new Vector2();

  // ── NDC coords for live preview during lasso drawing ────────────────────
  private _ndcMove: { x: number; y: number } | null = null;

  // ── Canvas pointer listeners ─────────────────────────────────────────────
  private _onPointerDown: ((e: PointerEvent) => void) | null = null;
  private _onPointerMove: ((e: PointerEvent) => void) | null = null;
  private _onPointerUp: ((e: PointerEvent) => void) | null = null;

  // ── Zustand unsubscribers ────────────────────────────────────────────────
  private _unsubscribers: Array<() => void> = [];

  // ── ID of the plane currently in cutout-drawing mode ─────────────────────
  private _activeCutoutId: string | null = null;

  // ────────────────────────────────────────────────────────────────────────
  //  Lifecycle
  // ────────────────────────────────────────────────────────────────────────

  init() {
    console.log("[WallpaperSystem] init");
    this._subscribeToStore();
  }

  destroy() {
    this._stopLassoMode();
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
    console.log("[WallpaperSystem] destroyed");
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Per-frame update — drives the lasso preview rectangle
  // ────────────────────────────────────────────────────────────────────────

  update(_dt: number) {
    const store = getWallpaperStore();
    if (
      !store.cutoutState ||
      store.cutoutState.step !== "drawing" ||
      !store.isLassoDrawing ||
      !store.lassoStart ||
      !this._ndcMove
    ) {
      return;
    }

    const mesh = getWallpaperMesh(store.cutoutState.wallpaperId);
    if (!mesh) return;

    const local = this._raycastToLocal(mesh, this._ndcMove.x, this._ndcMove.y);
    if (!local) return;

    const start = store.lassoStart;
    const preview: WallpaperCutoutRect = {
      x: Math.min(start.x, local.x),
      y: Math.min(start.y, local.y),
      width: Math.abs(local.x - start.x),
      height: Math.abs(local.y - start.y),
    };

    wallpaperStore.getState().setLassoPreview(preview);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Store subscriptions
  // ────────────────────────────────────────────────────────────────────────

  private _subscribeToStore() {
    const s = wallpaperStore;

    // ── Cutout step changes ────────────────────────────────────────────────
    this._unsubscribers.push(
      (s as any).subscribe(
        (state: any) => state.cutoutState,
        (cutoutState: any, prevCutoutState: any) => {
          if (!cutoutState) {
            // Cutout flow ended — apply geometry cutouts & restore opacity
            if (prevCutoutState) {
              const wpId = prevCutoutState.wallpaperId;
              setWallpaperOpacity(wpId, 1);

              // The confirmed regions were already stored in the store by
              // cutoutConfirm(); apply them to the plane geometry now.
              if (prevCutoutState.lassoRegions?.length > 0) {
                applyWallpaperCutouts(wpId, prevCutoutState.lassoRegions);
              }

              updateLassoConfirmOverlay(wpId, []);
              updateLassoPreviewOverlay(wpId, null);
            }
            this._stopLassoMode();
            return;
          }

          const { wallpaperId, step } = cutoutState;

          if (step === "drawing" && this._activeCutoutId !== wallpaperId) {
            this._activeCutoutId = wallpaperId;
            setWallpaperOpacity(wallpaperId, 0.5);
            this._startLassoMode(wallpaperId);
          } else if (step !== "drawing") {
            this._stopLassoMode();
          }
        },
      ),
    );

    // ── Sync confirmed-region overlay when lassoRegions change ────────────
    this._unsubscribers.push(
      (s as any).subscribe(
        (state: any) =>
          state.cutoutState
            ? JSON.stringify(state.cutoutState.lassoRegions)
            : null,
        () => {
          const state = getWallpaperStore();
          if (!state.cutoutState) return;
          updateLassoConfirmOverlay(
            state.cutoutState.wallpaperId,
            state.cutoutState.lassoRegions,
          );
        },
      ),
    );

    // ── Sync preview overlay when lassoPreview changes ─────────────────────
    this._unsubscribers.push(
      (s as any).subscribe(
        (state: any) => state.lassoPreview,
        (rect: WallpaperCutoutRect | null) => {
          const cs = getWallpaperStore().cutoutState;
          if (!cs) return;
          updateLassoPreviewOverlay(cs.wallpaperId, rect);
        },
      ),
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Lasso drawing — canvas event listeners
  // ────────────────────────────────────────────────────────────────────────

  private _startLassoMode(wallpaperId: string) {
    this._removeCanvasListeners();

    const canvas = this._getCanvas();
    if (!canvas) {
      console.warn("[WallpaperSystem] Canvas not found — lasso unavailable");
      return;
    }

    console.log(
      `[WallpaperSystem] Lasso mode started for plane "${wallpaperId}"`,
    );

    this._onPointerMove = (e: PointerEvent) => {
      this._ndcMove = this._toNDC(e, canvas);
    };

    this._onPointerDown = (e: PointerEvent) => {
      const state = getWallpaperStore();
      if (
        !state.cutoutState ||
        state.cutoutState.step !== "drawing" ||
        state.cutoutState.wallpaperId !== wallpaperId
      )
        return;

      const mesh = getWallpaperMesh(wallpaperId);
      if (!mesh) return;

      const ndc = this._toNDC(e, canvas);
      const local = this._raycastToLocal(mesh, ndc.x, ndc.y);
      if (!local) return;

      e.stopPropagation();

      const st = wallpaperStore.getState();
      if (!st.lassoStart) {
        // First corner — start the rectangle
        st.setLassoStart({ x: local.x, y: local.y });
        st.setIsLassoDrawing(true);
        st.setLassoPreview({ x: local.x, y: local.y, width: 0, height: 0 });
      } else {
        // Second corner — commit the rectangle
        const start = st.lassoStart;
        const rect: WallpaperCutoutRect = {
          x: Math.min(start.x, local.x),
          y: Math.min(start.y, local.y),
          width: Math.abs(local.x - start.x),
          height: Math.abs(local.y - start.y),
        };
        const MIN_SIZE = 0.05;
        if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
          st.commitLassoRegion(rect);
        } else {
          st.setLassoStart(null);
          st.setIsLassoDrawing(false);
          st.setLassoPreview(null);
        }
      }
    };

    this._onPointerUp = (_e: PointerEvent) => {
      /* reserved for future XR controller support */
    };

    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointerup", this._onPointerUp);
  }

  private _stopLassoMode() {
    this._removeCanvasListeners();
    this._activeCutoutId = null;
    this._ndcMove = null;
  }

  private _removeCanvasListeners() {
    const canvas = this._getCanvas();
    if (!canvas) return;
    if (this._onPointerMove)
      canvas.removeEventListener("pointermove", this._onPointerMove);
    if (this._onPointerDown)
      canvas.removeEventListener("pointerdown", this._onPointerDown);
    if (this._onPointerUp)
      canvas.removeEventListener("pointerup", this._onPointerUp);
    this._onPointerMove = null;
    this._onPointerDown = null;
    this._onPointerUp = null;
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Raycasting helpers
  // ────────────────────────────────────────────────────────────────────────

  private _toNDC(
    e: PointerEvent,
    canvas: HTMLCanvasElement,
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    };
  }

  private _raycastToLocal(
    mesh: import("three").Mesh,
    ndcX: number,
    ndcY: number,
  ): { x: number; y: number } | null {
    const camera = this.world.camera;
    if (!camera) return null;

    this._mouse.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._mouse, camera as any);

    mesh.updateMatrixWorld(true);
    const hits = this._raycaster.intersectObject(mesh, false);
    if (hits.length === 0) return null;

    const local = new Vector3().copy(hits[0].point);
    mesh.worldToLocal(local);
    return { x: local.x, y: local.y };
  }

  private _getCanvas(): HTMLCanvasElement | null {
    try {
      const el = (this as any).renderer?.domElement;
      if (el instanceof HTMLCanvasElement) return el;
    } catch (_) {
      // renderer not ready yet
    }
    return document.querySelector("canvas");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public entry-points called by PlacementPanelSystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a wallpaper colour or image texture to ALL walls in the room at once.
 *
 * Strategy (handled inside `WallpaperRenderer.applyWallpaperToAll`):
 *   1. Try to paint the texture directly onto detected wall meshes in the room
 *      model — seamless, no z-fighting.
 *   2. If no wall meshes are detected, create floating `PlaneGeometry` planes
 *      in front of each of the four cardinal walls.
 *
 * Shows a success / warning notification via `sceneNotify`.
 *
 * @param imageDataUrl  A `data:image/...` string or colour swatch URL.
 * @param name          Human-readable label used in the notification.
 */
export async function applyWallpaperToAllWalls(
  imageDataUrl: string,
  name: string = "Wallpaper",
  options?: {
    /** Force reliable plane-overlay rendering (used for uploaded images). */
    preferPlane?: boolean;
  },
): Promise<void> {
  const result = applyWallpaperToAll(imageDataUrl, `wp-${Date.now()}`, options);

  if (result === "none") {
    sceneNotify({
      title: "Wallpaper — room not ready",
      description: "Load a room model first, then apply the wallpaper again.",
      severity: "warning",
      icon: "🖼",
      iconBg: "rgba(245,158,11,0.15)",
      iconFg: "#f59e0b",
      duration: 4000,
    });
    return;
  }

  const modeLabel =
    result === "mesh"
      ? "applied directly to wall surfaces"
      : "applied as overlay on all walls";

  // Update the store so the cutout panel system and other listeners know
  // what's active
  wallpaperStore.getState().setApplied(
    imageDataUrl,
    name,
    result,
    result === "plane"
      ? [] // plane ids are registered inside WallpaperRenderer — store doesn't
      : // need to track them for the cutout flow; they're accessed by id
        [],
  );

  console.log(`[WallpaperSystem] "${name}" ${modeLabel} (path: ${result})`);

  sceneNotify({
    title: `Wallpaper applied`,
    description: `"${name}" ${modeLabel}.`,
    severity: "success",
    icon: "🖼",
    iconBg: "rgba(34,197,94,0.15)",
    iconFg: "#22c55e",
    duration: 3000,
  });
}

/**
 * Remove all wallpaper (both painted mesh materials and overlay planes) and
 * restore the room to its original appearance.
 */
export function removeAllWallpaper(): void {
  clearAllWallpaper();
  wallpaperStore.getState().setCleared();

  sceneNotify({
    title: "Wallpaper removed",
    description: "All walls have been restored.",
    severity: "info",
    icon: "🧹",
    iconBg: "rgba(99,102,241,0.15)",
    iconFg: "#818cf8",
    duration: 2500,
  });

  console.log("[WallpaperSystem] All wallpaper removed");
}

/**
 * Open the browser file-picker and apply the chosen image to all walls.
 * Uses the same mesh-first / plane-fallback pipeline as solid colours, after
 * decoding the file to a PNG data URL for reliable Three.js loading.
 */
export async function pickAndApplyWallpaper(): Promise<void> {
  const file = await pickImageFile();
  if (!file) {
    console.log("[WallpaperSystem] Image picker cancelled");
    return;
  }

  const dataUrl = await decodeImageFileToWallpaperDataUrl(file);
  if (!dataUrl) {
    sceneNotify({
      title: "Wallpaper — could not use image",
      description:
        "Try JPEG or PNG, or another photo. Very large files are scaled down automatically.",
      severity: "warning",
      icon: "🖼",
      iconBg: "rgba(245,158,11,0.15)",
      iconFg: "#f59e0b",
      duration: 4500,
    });
    return;
  }

  const label =
    file.name.replace(/\.[^.]+$/, "").trim() || "Custom Image";
  await applyWallpaperToAllWalls(dataUrl, label);
}

/**
 * Generate a solid-colour wallpaper and apply it to all walls immediately.
 *
 * @param cssColor  Any CSS colour string (e.g. `"#bfdbfe"` or `"cornsilk"`).
 * @param name      Human-readable label for the notification.
 */
export async function applyColorWallpaper(
  cssColor: string,
  name: string,
): Promise<void> {
  const dataUrl = solidColorDataUrl(cssColor);
  await applyWallpaperToAllWalls(dataUrl, name);
}
