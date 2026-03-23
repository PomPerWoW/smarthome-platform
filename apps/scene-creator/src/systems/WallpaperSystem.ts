import { createSystem } from "@iwsdk/core";
import { Raycaster, Vector2, Vector3 } from "three";

import {
  wallpaperStore,
  getWallpaperStore,
  nextWallpaperId,
  WallpaperCutoutRect,
} from "../store/WallpaperStore";
import { getAvailableWalls, getWallById } from "../utils/wallDetection";
import {
  createWallpaperMesh,
  applyWallpaperCutouts,
  setWallpaperOpacity,
  getWallpaperMesh,
  removeWallpaperMesh,
  updateLassoConfirmOverlay,
  updateLassoPreviewOverlay,
} from "../entities/WallpaperRenderer";

/**
 * WallpaperSystem
 *
 * Orchestrates the full wallpaper-placement lifecycle inside the @iwsdk/core
 * ECS world.  It has no entity queries of its own — it operates entirely
 * through the `WallpaperStore` (Zustand) reactive state and raw DOM/Three.js
 * APIs.
 *
 * Responsibilities
 * ────────────────
 *  • Detect available walls when placement begins.
 *  • React to `wallSelected` → create & orient the Three.js plane mesh.
 *  • React to `cutoutAnswerYes` → make wallpaper semi-transparent.
 *  • React to `cutoutConfirm` → apply `ShapeGeometry` cutouts and restore
 *    full opacity.
 *  • React to lasso state changes → keep the green confirm / yellow preview
 *    line-segment overlays in sync.
 *  • Listen to pointer events on the WebGL canvas during lasso drawing and
 *    raycast against the active wallpaper mesh to get plane-local 2-D coords.
 *  • Clean up subscriptions and event listeners on `destroy()`.
 */
export class WallpaperSystem extends createSystem({}) {
  // ── Three.js raycasting helpers ─────────────────────────────────────────
  private readonly _raycaster = new Raycaster();
  private readonly _mouse = new Vector2();

  // ── Pointer tracking during lasso drawing ───────────────────────────────
  /** NDC coords updated on every pointermove while in lasso mode */
  private _ndcMove: { x: number; y: number } | null = null;

  // ── Canvas event handlers (kept for removal) ────────────────────────────
  private _onPointerDown: ((e: PointerEvent) => void) | null = null;
  private _onPointerMove: ((e: PointerEvent) => void) | null = null;
  private _onPointerUp: ((e: PointerEvent) => void) | null = null;

  // ── Zustand unsubscribe callbacks ───────────────────────────────────────
  private _unsubscribers: Array<() => void> = [];

  // ── Track which wallpaper is currently in cutout-drawing mode ───────────
  private _activeCutoutId: string | null = null;

  // ────────────────────────────────────────────────────────────────────────
  //  Lifecycle
  // ────────────────────────────────────────────────────────────────────────

  init() {
    console.log("[WallpaperSystem] init");
    this._subscribeToStore();
  }

  destroy() {
    this._removeCanvasListeners();
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
    console.log("[WallpaperSystem] destroyed");
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Per-frame update — drives the in-progress lasso preview
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

    // Update store (triggers overlay re-render below via subscription)
    wallpaperStore.getState().setLassoPreview(preview);
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Store subscriptions
  // ────────────────────────────────────────────────────────────────────────

  private _subscribeToStore() {
    const s = wallpaperStore;

    // ── Placement flow: isSelectingWall ────────────────────────────────────
    this._unsubscribers.push(
      (s as any).subscribe(
        (state: any) => state.isSelectingWall,
        (isSelecting: boolean) => {
          if (isSelecting) {
            // Refresh available walls every time the panel opens
            const walls = getAvailableWalls();
            wallpaperStore.getState().setAvailableWalls(walls);
            console.log(
              `[WallpaperSystem] Wall selection opened — ${walls.length} wall(s) detected`,
            );
          }
        },
      ),
    );

    // ── Wall selected → create mesh ────────────────────────────────────────
    this._unsubscribers.push(
      (s as any).subscribe(
        (state: any) => state.wallpapers.length,
        () => {
          const state = getWallpaperStore();
          const latest = state.wallpapers[state.wallpapers.length - 1];
          if (!latest) return;

          // Only create if the mesh doesn't already exist in WallpaperRenderer
          // (this subscription fires on every add/remove)
          if (!getWallpaperMesh(latest.id)) {
            createWallpaperMesh(
              latest.id,
              latest.wallInfo,
              latest.imageDataUrl,
            );
            console.log(
              `[WallpaperSystem] Mesh created for wallpaper "${latest.id}"`,
            );
          }
        },
      ),
    );

    // ── Cutout step changes ────────────────────────────────────────────────
    this._unsubscribers.push(
      (s as any).subscribe(
        (state: any) => state.cutoutState,
        (cutoutState: any, prevCutoutState: any) => {
          if (!cutoutState) {
            // Cutout flow ended
            if (prevCutoutState) {
              const wpId = prevCutoutState.wallpaperId;
              // Restore opacity
              setWallpaperOpacity(wpId, 1);
              // Final cutout regions are persisted by cutoutConfirm action;
              // apply them to the mesh geometry now.
              const wp = getWallpaperStore().wallpapers.find(
                (w) => w.id === wpId,
              );
              if (wp && wp.cutouts.length > 0) {
                applyWallpaperCutouts(wpId, wp.cutouts);
              }
              // Clear overlays
              updateLassoConfirmOverlay(wpId, []);
              updateLassoPreviewOverlay(wpId, null);
            }
            this._stopLassoMode();
            return;
          }

          const { wallpaperId, step } = cutoutState;

          if (step === "drawing") {
            if (this._activeCutoutId !== wallpaperId) {
              this._activeCutoutId = wallpaperId;
              setWallpaperOpacity(wallpaperId, 0.5);
              this._startLassoMode(wallpaperId);
            }
          } else {
            // step === "prompt" — not yet drawing
            this._stopLassoMode();
          }
        },
      ),
    );

    // ── Sync confirm overlay when lasso regions change ─────────────────────
    this._unsubscribers.push(
      (s as any).subscribe(
        (state: any) =>
          state.cutoutState
            ? JSON.stringify(state.cutoutState.lassoRegions)
            : null,
        (_: any) => {
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

    // ── Wallpaper removed ──────────────────────────────────────────────────
    // We detect removal by comparing the previous vs current id list and
    // calling removeWallpaperMesh for any that disappeared.
    let prevIds: string[] = [];
    this._unsubscribers.push(
      (s as any).subscribe(
        (state: any) => state.wallpapers.map((w: any) => w.id).join(","),
        (_: string) => {
          const current = getWallpaperStore().wallpapers.map((w) => w.id);
          for (const id of prevIds) {
            if (!current.includes(id)) {
              removeWallpaperMesh(id);
            }
          }
          prevIds = current;
        },
      ),
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  //  Lasso drawing: canvas event listeners
  // ────────────────────────────────────────────────────────────────────────

  /** Attach pointer listeners to the renderer's WebGL canvas. */
  private _startLassoMode(wallpaperId: string) {
    this._removeCanvasListeners(); // clean up any prior listeners

    const canvas = this._getCanvas();
    if (!canvas) {
      console.warn("[WallpaperSystem] Could not find WebGL canvas for lasso");
      return;
    }

    console.log(
      `[WallpaperSystem] Starting lasso mode for wallpaper "${wallpaperId}"`,
    );

    this._onPointerMove = (e: PointerEvent) => {
      const ndc = this._toNDC(e, canvas);
      this._ndcMove = ndc;
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

      if (!state.lassoStart) {
        // First corner
        wallpaperStore.getState().setLassoStart({ x: local.x, y: local.y });
        wallpaperStore.getState().setIsLassoDrawing(true);
        wallpaperStore
          .getState()
          .setLassoPreview({ x: local.x, y: local.y, width: 0, height: 0 });
      } else {
        // Second corner → commit the region
        const start = state.lassoStart;
        const rect: WallpaperCutoutRect = {
          x: Math.min(start.x, local.x),
          y: Math.min(start.y, local.y),
          width: Math.abs(local.x - start.x),
          height: Math.abs(local.y - start.y),
        };
        const MIN_SIZE = 0.05;
        if (rect.width >= MIN_SIZE && rect.height >= MIN_SIZE) {
          wallpaperStore.getState().commitLassoRegion(rect);
        } else {
          // Too small — reset
          wallpaperStore.getState().setLassoStart(null);
          wallpaperStore.getState().setIsLassoDrawing(false);
          wallpaperStore.getState().setLassoPreview(null);
        }
      }
    };

    this._onPointerUp = (_e: PointerEvent) => {
      // Nothing needed here — lasso is two-click, not drag-release.
      // Kept as a hook for future XR controller support.
    };

    canvas.addEventListener("pointermove", this._onPointerMove);
    canvas.addEventListener("pointerdown", this._onPointerDown);
    canvas.addEventListener("pointerup", this._onPointerUp);
  }

  /** Remove all canvas listeners and reset NDC tracking. */
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

  /**
   * Convert a pointer event to NDC (Normalised Device Coordinates).
   * NDC x ∈ [−1, 1], y ∈ [−1, 1] (y is flipped vs screen space).
   */
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

  /**
   * Raycast from NDC coords against `mesh` and return the intersection point
   * in mesh-local space (the 2-D coords on the wallpaper plane).
   *
   * Returns `null` when the ray misses.
   */
  private _raycastToLocal(
    mesh: import("three").Mesh,
    ndcX: number,
    ndcY: number,
  ): { x: number; y: number } | null {
    const camera = this.world.camera;
    if (!camera) return null;

    this._mouse.set(ndcX, ndcY);
    // Cast to `any` to avoid the dual-@types/three version mismatch between
    // @iwsdk/core's internal three and the app-level three package.
    this._raycaster.setFromCamera(this._mouse, camera as any);

    mesh.updateMatrixWorld(true);
    const hits = this._raycaster.intersectObject(mesh, false);
    if (hits.length === 0) return null;

    const worldPoint = hits[0].point.clone();
    const local = new Vector3();
    local.copy(worldPoint);
    mesh.worldToLocal(local);

    return { x: local.x, y: local.y };
  }

  /**
   * Locate the renderer's WebGL canvas.
   *
   * @iwsdk/core exposes the Three.js renderer on `this.renderer`; its DOM
   * element is `this.renderer.domElement`.  As a fallback we query the DOM
   * for any `<canvas>`.
   */
  private _getCanvas(): HTMLCanvasElement | null {
    try {
      const canvas = (this as any).renderer?.domElement as
        | HTMLCanvasElement
        | undefined;
      if (canvas instanceof HTMLCanvasElement) return canvas;
    } catch (_) {
      // renderer not yet available
    }
    return document.querySelector("canvas");
  }
}

// ─── Public helpers called by panel systems ────────────────────────────────────

/**
 * Trigger the wallpaper placement flow from external code (e.g. a panel
 * system button handler).
 *
 * If `imageDataUrl` is provided it is used directly (e.g. a preset colour).
 * If omitted, a file picker is opened.
 */
export async function beginWallpaperPlacement(
  imageDataUrl?: string,
  name?: string,
): Promise<void> {
  let url = imageDataUrl;

  if (!url) {
    // Dynamic import to avoid bundling the file-picker helper unless needed
    const { pickImageAsDataUrl } = await import("../utils/wallDetection");
    const picked = await pickImageAsDataUrl();
    if (!picked) {
      console.log("[WallpaperSystem] Image picker cancelled");
      return;
    }
    url = picked;
  }

  wallpaperStore.getState().startPlacement(url, name ?? "Wallpaper");
  console.log(
    "[WallpaperSystem] Placement started — waiting for wall selection",
  );
}

/**
 * Called by `WallSelectionPanelSystem` when the user taps a wall button.
 */
export function confirmWallSelection(wallId: string): void {
  const wall = getWallById(wallId);
  if (!wall) {
    console.warn(
      `[WallpaperSystem] confirmWallSelection: unknown wall "${wallId}"`,
    );
    return;
  }

  const id = nextWallpaperId();
  wallpaperStore.getState().wallSelected(id, wallId, wall);
  console.log(
    `[WallpaperSystem] Wall "${wallId}" selected — wallpaper id="${id}"`,
  );
}
