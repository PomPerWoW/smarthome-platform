import { Box3, Vector3, Object3D } from "three";

export interface WallInfo {
  id: string;
  label: string;
  wallNormal: [number, number, number];
  /** distance of wall from origin along its normal axis */
  wallPosition: number;
  width: number;
  height: number;
  /** center position in labModel-local space */
  center: [number, number, number];
}

/**
 * Compute the four cardinal walls from the room model's local bounding box.
 *
 * All coordinates are in **labModel-local space** so they can be used directly
 * as child-object positions when added to `__labRoomModel`.
 */
export function getAvailableWalls(): WallInfo[] {
  const labModel = (globalThis as any).__labRoomModel as Object3D | undefined;
  if (!labModel) {
    console.warn("[WallDetection] __labRoomModel not available yet");
    return [];
  }

  // Compute the world-space bounding box and convert corners to local space
  const worldBox = new Box3().setFromObject(labModel);

  const worldMin = worldBox.min.clone();
  const worldMax = worldBox.max.clone();

  // Convert the two extreme corners to labModel-local space.
  // This correctly handles position / rotation / scale of the room model.
  const localMin = labModel.worldToLocal(worldMin.clone());
  const localMax = labModel.worldToLocal(worldMax.clone());

  // worldToLocal can flip min/max when the model has a negative scale or rotation,
  // so always take the true component-wise min and max.
  const min = new Vector3(
    Math.min(localMin.x, localMax.x),
    Math.min(localMin.y, localMax.y),
    Math.min(localMin.z, localMax.z),
  );
  const max = new Vector3(
    Math.max(localMin.x, localMax.x),
    Math.max(localMin.y, localMax.y),
    Math.max(localMin.z, localMax.z),
  );

  const wallHeight = max.y - min.y;
  const wallCenterY = (min.y + max.y) / 2;

  // Small offset so the wallpaper plane sits just in front of the wall geometry
  // and avoids z-fighting.
  const WALL_OFFSET = 0.015;

  const walls: WallInfo[] = [
    // ── North wall  (faces -Z, sits at min.z) ───────────────────────────────
    {
      id: "north",
      label: "North Wall",
      wallNormal: [0, 0, -1],
      wallPosition: min.z,
      width: max.x - min.x,
      height: wallHeight,
      center: [
        (min.x + max.x) / 2,
        wallCenterY,
        min.z + WALL_OFFSET,
      ],
    },

    // ── South wall  (faces +Z, sits at max.z) ───────────────────────────────
    {
      id: "south",
      label: "South Wall",
      wallNormal: [0, 0, 1],
      wallPosition: max.z,
      width: max.x - min.x,
      height: wallHeight,
      center: [
        (min.x + max.x) / 2,
        wallCenterY,
        max.z - WALL_OFFSET,
      ],
    },

    // ── East wall   (faces +X, sits at max.x) ───────────────────────────────
    {
      id: "east",
      label: "East Wall",
      wallNormal: [1, 0, 0],
      wallPosition: max.x,
      width: max.z - min.z,
      height: wallHeight,
      center: [
        max.x - WALL_OFFSET,
        wallCenterY,
        (min.z + max.z) / 2,
      ],
    },

    // ── West wall   (faces -X, sits at min.x) ───────────────────────────────
    {
      id: "west",
      label: "West Wall",
      wallNormal: [-1, 0, 0],
      wallPosition: min.x,
      width: max.z - min.z,
      height: wallHeight,
      center: [
        min.x + WALL_OFFSET,
        wallCenterY,
        (min.z + max.z) / 2,
      ],
    },
  ];

  console.log(
    `[WallDetection] Found ${walls.length} walls. ` +
      `Room local bbox: (${min.x.toFixed(2)}, ${min.y.toFixed(2)}, ${min.z.toFixed(2)}) ` +
      `→ (${max.x.toFixed(2)}, ${max.y.toFixed(2)}, ${max.z.toFixed(2)})`,
  );

  return walls;
}

/**
 * Return a single WallInfo by its id, or null if not found.
 */
export function getWallById(id: string): WallInfo | null {
  return getAvailableWalls().find((w) => w.id === id) ?? null;
}

/**
 * Open a browser file-picker and return the selected image as a data-URL,
 * or `null` if the user cancels.
 */
export function pickImageAsDataUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };

    // If the dialog is dismissed without a selection the change event never
    // fires; resolve with null after a generous timeout so the promise
    // doesn't leak.
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const timer = window.setTimeout(() => resolve(null), TIMEOUT_MS);
    input.onchange = () => {
      clearTimeout(timer);
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };

    input.click();
  });
}

/**
 * Generate a solid-colour wallpaper as a PNG data-URL using an offscreen
 * canvas.  Useful as a quick placeholder while a real image is loading.
 */
export function solidColorDataUrl(
  cssColor: string,
  width = 512,
  height = 512,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png");
}

/** Preset wallpaper swatches shown in the placement panel. */
export const WALLPAPER_PRESETS: Array<{ id: string; label: string; color: string }> = [
  { id: "preset-white",  label: "White",       color: "#f8f8f8" },
  { id: "preset-cream",  label: "Cream",       color: "#fdf6e3" },
  { id: "preset-sky",    label: "Sky Blue",    color: "#bfdbfe" },
  { id: "preset-sage",   label: "Sage Green",  color: "#bbf7d0" },
  { id: "preset-blush",  label: "Blush",       color: "#fecdd3" },
  { id: "preset-lavender", label: "Lavender",  color: "#ddd6fe" },
];
