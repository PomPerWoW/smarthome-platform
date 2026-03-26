import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WallpaperCutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CutoutStep = "prompt" | "drawing";

export interface WallpaperCutoutState {
  /** ID of the plane mesh the cutout is being drawn on */
  wallpaperId: string;
  step: CutoutStep;
  lassoRegions: WallpaperCutoutRect[];
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface WallpaperState {
  // ── Current wallpaper ───────────────────────────────────────────────────
  /** The data-URL of the wallpaper currently applied to all walls, or null */
  activeImageDataUrl: string | null;
  /** Human-readable name shown in notifications */
  activeWallpaperName: string;
  /**
   * How the wallpaper was applied:
   *   "mesh"  — texture painted directly on room-model wall meshes
   *   "plane" — overlay planes placed in front of each wall
   *   null    — nothing applied yet
   */
  appliedAs: "mesh" | "plane" | null;
  /** IDs of the overlay planes currently in the scene (empty for mesh mode) */
  planeIds: string[];

  // ── Optional cutout state (only relevant for "plane" mode) ──────────────
  cutoutState: WallpaperCutoutState | null;
  lassoStart: { x: number; y: number } | null;
  lassoPreview: WallpaperCutoutRect | null;
  isLassoDrawing: boolean;

  // ── Actions ─────────────────────────────────────────────────────────────

  /**
   * Record that a wallpaper has been applied.  Called by `WallpaperSystem`
   * after the Three.js work is done.
   */
  setApplied: (
    imageDataUrl: string,
    name: string,
    appliedAs: "mesh" | "plane",
    planeIds?: string[],
  ) => void;

  /** Record that all wallpaper has been removed / cleared. */
  setCleared: () => void;

  // ── Cutout actions (only used in "plane" mode) ───────────────────────────

  /** Start the cutout prompt for a specific plane id. */
  beginCutout: (wallpaperId: string) => void;
  cutoutAnswerYes: () => void;
  cutoutAnswerNo: () => void;
  cutoutUndo: () => void;
  cutoutConfirm: () => void;

  // ── Lasso drawing helpers ────────────────────────────────────────────────
  setLassoStart: (pt: { x: number; y: number } | null) => void;
  setLassoPreview: (rect: WallpaperCutoutRect | null) => void;
  setIsLassoDrawing: (v: boolean) => void;
  commitLassoRegion: (rect: WallpaperCutoutRect) => void;
}

// ─── Store implementation ────────────────────────────────────────────────────

export const wallpaperStore = createStore<WallpaperState>()(
  subscribeWithSelector((set, get) => ({
    // ── initial state ──────────────────────────────────────────────────────
    activeImageDataUrl: null,
    activeWallpaperName: "",
    appliedAs: null,
    planeIds: [],
    cutoutState: null,
    lassoStart: null,
    lassoPreview: null,
    isLassoDrawing: false,

    // ── actions ────────────────────────────────────────────────────────────

    setApplied(imageDataUrl, name, appliedAs, planeIds = []) {
      set({
        activeImageDataUrl: imageDataUrl,
        activeWallpaperName: name,
        appliedAs,
        planeIds,
        // Clear any leftover cutout state from a previous session
        cutoutState: null,
        lassoStart: null,
        lassoPreview: null,
        isLassoDrawing: false,
      });
    },

    setCleared() {
      set({
        activeImageDataUrl: null,
        activeWallpaperName: "",
        appliedAs: null,
        planeIds: [],
        cutoutState: null,
        lassoStart: null,
        lassoPreview: null,
        isLassoDrawing: false,
      });
    },

    // ── cutout ─────────────────────────────────────────────────────────────

    beginCutout(wallpaperId) {
      set({
        cutoutState: { wallpaperId, step: "prompt", lassoRegions: [] },
      });
    },

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
        cutoutState: { ...cs, lassoRegions: cs.lassoRegions.slice(0, -1) },
      });
    },

    cutoutConfirm() {
      set({
        cutoutState: null,
        lassoStart: null,
        lassoPreview: null,
        isLassoDrawing: false,
      });
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
  })),
);

/** Convenience accessor — mirrors the pattern used in DeviceStore. */
export function getWallpaperStore(): WallpaperState {
  return wallpaperStore.getState();
}
