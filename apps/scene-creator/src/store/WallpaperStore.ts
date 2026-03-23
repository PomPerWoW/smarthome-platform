import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { WallInfo } from "../utils/wallDetection";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WallpaperCutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WallpaperRecord {
  id: string;
  wallId: string;
  wallInfo: WallInfo;
  imageDataUrl: string;
  name: string;
  cutouts: WallpaperCutoutRect[];
}

export type CutoutStep = "prompt" | "drawing";

export interface WallpaperCutoutState {
  wallpaperId: string;
  step: CutoutStep;
  lassoRegions: WallpaperCutoutRect[];
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface WallpaperState {
  // ── Placed wallpapers in the current scene ──────────────────────────────
  wallpapers: WallpaperRecord[];

  // ── Step 1 — image / colour selection ──────────────────────────────────
  /** true while the user is picking an image or preset colour */
  isPickingImage: boolean;

  // ── Step 2 — wall selection ─────────────────────────────────────────────
  /** true while the wall-selection panel is visible */
  isSelectingWall: boolean;
  /** walls computed from the current room model */
  availableWalls: WallInfo[];
  /** image data-URL waiting to be assigned to a wall */
  pendingImageDataUrl: string | null;
  pendingWallpaperName: string;

  // ── Step 3 — cutout drawing ─────────────────────────────────────────────
  cutoutState: WallpaperCutoutState | null;
  lassoStart: { x: number; y: number } | null;
  lassoPreview: WallpaperCutoutRect | null;
  isLassoDrawing: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────

  /** Begin the placement flow with a chosen image data-URL. */
  startPlacement: (imageDataUrl: string, name?: string) => void;

  /** Provide (or refresh) the list of walls detected in the room. */
  setAvailableWalls: (walls: WallInfo[]) => void;

  /** User chose a wall → begin cutout prompt for the newly-placed wallpaper. */
  wallSelected: (wallpaperId: string, wallId: string, wallInfo: WallInfo) => void;

  /** Cancel wall selection without placing anything. */
  cancelPlacement: () => void;

  // cutout panel events
  cutoutAnswerYes: () => void;
  cutoutAnswerNo: () => void;
  cutoutUndo: () => void;
  cutoutConfirm: () => void;

  // lasso drawing helpers (called from WallpaperSystem pointer handlers)
  setLassoStart: (pt: { x: number; y: number } | null) => void;
  setLassoPreview: (rect: WallpaperCutoutRect | null) => void;
  setIsLassoDrawing: (v: boolean) => void;
  commitLassoRegion: (rect: WallpaperCutoutRect) => void;

  // wallpaper lifecycle
  addWallpaper: (record: WallpaperRecord) => void;
  removeWallpaper: (id: string) => void;
  updateWallpaperCutouts: (id: string, cutouts: WallpaperCutoutRect[]) => void;
}

// ─── Store implementation ────────────────────────────────────────────────────

let _idCounter = 0;
export function nextWallpaperId(): string {
  return `wallpaper-${Date.now()}-${++_idCounter}`;
}

export const wallpaperStore = createStore<WallpaperState>()(
  subscribeWithSelector((set, get) => ({
    // ── initial state ──────────────────────────────────────────────────────
    wallpapers: [],
    isPickingImage: false,
    isSelectingWall: false,
    availableWalls: [],
    pendingImageDataUrl: null,
    pendingWallpaperName: "Wallpaper",
    cutoutState: null,
    lassoStart: null,
    lassoPreview: null,
    isLassoDrawing: false,

    // ── actions ────────────────────────────────────────────────────────────

    startPlacement(imageDataUrl, name = "Wallpaper") {
      set({
        pendingImageDataUrl: imageDataUrl,
        pendingWallpaperName: name,
        isPickingImage: false,
        isSelectingWall: true,
      });
    },

    setAvailableWalls(walls) {
      set({ availableWalls: walls });
    },

    wallSelected(wallpaperId, wallId, wallInfo) {
      // Record the new wallpaper (without cutouts yet)
      const pending = get().pendingImageDataUrl ?? "";
      const newRecord: WallpaperRecord = {
        id: wallpaperId,
        wallId,
        wallInfo,
        imageDataUrl: pending,
        name: get().pendingWallpaperName,
        cutouts: [],
      };

      set((s) => ({
        wallpapers: [...s.wallpapers, newRecord],
        isSelectingWall: false,
        pendingImageDataUrl: null,
        cutoutState: {
          wallpaperId,
          step: "prompt",
          lassoRegions: [],
        },
      }));
    },

    cancelPlacement() {
      set({
        isPickingImage: false,
        isSelectingWall: false,
        pendingImageDataUrl: null,
        cutoutState: null,
        lassoStart: null,
        lassoPreview: null,
        isLassoDrawing: false,
      });
    },

    // ── cutout panel ────────────────────────────────────────────────────────

    cutoutAnswerYes() {
      const cs = get().cutoutState;
      if (!cs) return;
      set({ cutoutState: { ...cs, step: "drawing" } });
    },

    cutoutAnswerNo() {
      set({
        cutoutState: null,
        lassoStart: null,
        lassoPreview: null,
        isLassoDrawing: false,
      });
    },

    cutoutUndo() {
      const cs = get().cutoutState;
      if (!cs || cs.lassoRegions.length === 0) return;
      set({
        cutoutState: {
          ...cs,
          lassoRegions: cs.lassoRegions.slice(0, -1),
        },
      });
    },

    cutoutConfirm() {
      const cs = get().cutoutState;
      if (!cs) return;

      // Persist the lasso regions onto the wallpaper record
      set((s) => ({
        wallpapers: s.wallpapers.map((wp) =>
          wp.id === cs.wallpaperId
            ? { ...wp, cutouts: cs.lassoRegions }
            : wp,
        ),
        cutoutState: null,
        lassoStart: null,
        lassoPreview: null,
        isLassoDrawing: false,
      }));
    },

    // ── lasso helpers ────────────────────────────────────────────────────────

    setLassoStart(pt) {
      set({ lassoStart: pt });
    },

    setLassoPreview(rect) {
      set({ lassoPreview: rect });
    },

    setIsLassoDrawing(v) {
      set({ isLassoDrawing: v });
    },

    commitLassoRegion(rect) {
      const cs = get().cutoutState;
      if (!cs) return;
      set({
        cutoutState: { ...cs, lassoRegions: [...cs.lassoRegions, rect] },
        lassoStart: null,
        lassoPreview: null,
        isLassoDrawing: false,
      });
    },

    // ── wallpaper lifecycle ──────────────────────────────────────────────────

    addWallpaper(record) {
      set((s) => ({ wallpapers: [...s.wallpapers, record] }));
    },

    removeWallpaper(id) {
      set((s) => ({
        wallpapers: s.wallpapers.filter((wp) => wp.id !== id),
      }));
    },

    updateWallpaperCutouts(id, cutouts) {
      set((s) => ({
        wallpapers: s.wallpapers.map((wp) =>
          wp.id === id ? { ...wp, cutouts } : wp,
        ),
      }));
    },
  })),
);

/** Convenience accessor — mirrors the pattern used in DeviceStore. */
export function getWallpaperStore(): WallpaperState {
  return wallpaperStore.getState();
}

export function subscribeToWallpaperStore<T>(
  selector: (state: WallpaperState) => T,
  listener: (selected: T, prevSelected: T) => void,
) {
  return (wallpaperStore as any).subscribe(selector, listener);
}
