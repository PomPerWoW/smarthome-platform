import {
  PlaneGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Mesh,
  TextureLoader,
  Shape,
  Path,
  ShapeGeometry,
  BufferAttribute,
  BufferGeometry,
  LineSegments,
  LineBasicMaterial,
  DoubleSide,
  SRGBColorSpace,
  ClampToEdgeWrapping,
  RepeatWrapping,
  LinearFilter,
  Vector3,
  Box3,
  Texture,
  Object3D,
  Material,
  BufferGeometry as ThreeBufferGeometry,
} from "three";

import { getAvailableWalls, WallInfo } from "../utils/wallDetection";
import { WallpaperCutoutRect } from "../store/WallpaperStore";

// ─────────────────────────────────────────────────────────────────────────────
//  Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface PlaneRecord {
  id: string;
  mesh: Mesh;
  wallWidth: number;
  wallHeight: number;
  confirmOverlay: LineSegments | null;
  previewOverlay: LineSegments | null;
}

/** One entry for every room-model mesh that had its material replaced. */
interface PaintedMeshRecord {
  mesh: Mesh;
  originalMaterial: Material | Material[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Module-level registries
// ─────────────────────────────────────────────────────────────────────────────

/** Wallpaper overlay planes (used when the mesh-paint path fails or for cutouts). */
const _planeRecords = new Map<string, PlaneRecord>();

/** Room-model meshes whose material was replaced so we can restore them later. */
let _paintedMeshes: PaintedMeshRecord[] = [];

/** Texture instances currently painted onto room meshes (if any). */
let _activePaintTextures: Texture[] = [];

// ─────────────────────────────────────────────────────────────────────────────
//  ① Primary path — paint texture directly onto room-model wall meshes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Traverse `__labRoomModel`, detect wall-like meshes, and replace their
 * material with one that carries the given texture / colour.
 *
 * Detection strategy (first match wins):
 *   • Name heuristic  — mesh name contains "wall", "wand", "mur", or "pared"
 *     (covers common English, German, French, Spanish naming conventions).
 *   • Shape heuristic — bounding box is tall (y > 1 m), thin in exactly ONE
 *     horizontal direction (< 15 % of height), and wide in the other (> 0.5 m).
 *
 * Returns the number of meshes that were painted.  0 means the caller should
 * fall back to `createPlanesOnAllWalls()`.
 */
export function applyTextureToRoomWalls(imageDataUrl: string): number {
  const labModel = getLabModel();
  if (!labModel) {
    console.warn(
      "[WallpaperRenderer] __labRoomModel not ready — cannot paint walls",
    );
    return 0;
  }

  // Always restore previous paint first so we don't stack materials
  restoreRoomWallMaterials();

  let count = 0;

  labModel.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    if (!isLikelyWallMesh(mesh)) return;
    if (!hasUsableUVs(mesh.geometry as ThreeBufferGeometry)) {
      console.warn(
        `[WallpaperRenderer] Skipping wall mesh "${mesh.name || "(unnamed)"}" due to missing/degenerate UVs`,
      );
      return;
    }
    const bbox = new Box3().setFromObject(mesh);
    const size = new Vector3();
    bbox.getSize(size);
    const wallWidth = Math.max(size.x, size.z);
    const wallHeight = size.y;
    const texture = loadTexture(imageDataUrl, {
      targetWidth: wallWidth,
      targetHeight: wallHeight,
      fitMode: "cover",
    });
    _activePaintTextures.push(texture);

    // Clone the material so we never modify a shared instance
    const originalMaterial = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();

    _paintedMeshes.push({ mesh, originalMaterial: mesh.material });

    const newMat = new MeshBasicMaterial({
      map: texture,
      side: DoubleSide,
      toneMapped: false,
    });

    mesh.material = newMat;
    count++;
  });

  console.log(
    `[WallpaperRenderer] Painted texture on ${count} wall mesh(es) in room model`,
  );
  return count;
}

/**
 * Restore every room-model mesh that was previously painted back to its
 * original material and free the associated texture from GPU memory.
 */
export function restoreRoomWallMaterials(): void {
  for (const { mesh, originalMaterial } of _paintedMeshes) {
    // Dispose the replacement material(s) we created
    disposeMaterial(mesh.material);
    mesh.material = originalMaterial as Material;
  }
  _paintedMeshes = [];

  for (const texture of _activePaintTextures) {
    texture.dispose();
  }
  _activePaintTextures = [];

  console.log("[WallpaperRenderer] Restored original wall materials");
}

// ─────────────────────────────────────────────────────────────────────────────
//  ② Fallback / overlay path — textured planes in front of every wall
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create one `PlaneGeometry` mesh per detected wall, cover it with the given
 * texture, orient it to face the wall, and add it as a child of
 * `__labRoomModel`.
 *
 * All four cardinal walls are covered simultaneously — no wall-selection step
 * is required by the caller.
 *
 * Returns the list of generated wallpaper ids (one per wall).
 */
export function createPlanesOnAllWalls(
  imageDataUrl: string,
  idPrefix: string = "wallpaper",
): string[] {
  const walls = getAvailableWalls();
  if (walls.length === 0) {
    console.warn("[WallpaperRenderer] No walls detected — nothing to cover");
    return [];
  }

  const ids: string[] = [];

  for (const wall of walls) {
    const id = `${idPrefix}-${wall.id}-${Date.now()}`;
    createWallpaperMesh(id, wall, imageDataUrl);
    ids.push(id);
  }

  console.log(
    `[WallpaperRenderer] Created ${ids.length} wallpaper plane(s) ` +
    `covering walls: ${walls.map((w) => w.id).join(", ")}`,
  );

  return ids;
}

/**
 * Remove all planes that were created by `createPlanesOnAllWalls()` and free
 * their GPU resources.
 */
export function removeAllWallpaperPlanes(): void {
  for (const id of Array.from(_planeRecords.keys())) {
    removeWallpaperMesh(id);
  }
  console.log("[WallpaperRenderer] All wallpaper planes removed");
}

// ─────────────────────────────────────────────────────────────────────────────
//  ③ Combined entry-point — try mesh-paint, fall back to planes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply a wallpaper (colour or image) to all walls in the current room.
 *
 * Attempt order:
 *   1. Paint the texture directly onto detected wall meshes in `__labRoomModel`
 *      (zero z-fighting, looks part of the geometry).
 *   2. If no wall meshes were detected, create floating `PlaneGeometry` planes
 *      covering all four cardinal walls (reliable fallback for any model).
 *
 * @param imageDataUrl  A `data:image/...;base64,...` string or any URL the
 *                      `TextureLoader` can resolve.
 * @param idPrefix      Optional prefix for plane ids (ignored when mesh-paint
 *                      succeeds).
 *
 * @returns `"mesh"` when the mesh-paint path was used, `"plane"` when the
 *          plane fallback was used, `"none"` when both paths produced nothing.
 */
export function applyWallpaperToAll(
  imageDataUrl: string,
  idPrefix: string = "wallpaper",
  options?: {
    /**
     * Force plane-overlay rendering instead of painting room wall meshes.
     * Useful for uploaded images when source mesh UVs are unreliable.
     */
    preferPlane?: boolean;
  },
): "mesh" | "plane" | "none" {
  // Always clear any previous planes before applying new wallpaper
  removeAllWallpaperPlanes();

  if (options?.preferPlane) {
    restoreRoomWallMaterials();
    const forcedPlaneIds = createPlanesOnAllWalls(imageDataUrl, idPrefix);
    return forcedPlaneIds.length > 0 ? "plane" : "none";
  }

  const painted = applyTextureToRoomWalls(imageDataUrl);
  if (painted > 0) {
    return "mesh";
  }

  // Mesh-paint found nothing usable — fall back to planes
  const ids = createPlanesOnAllWalls(imageDataUrl, idPrefix);
  if (ids.length > 0) {
    return "plane";
  }

  console.warn(
    "[WallpaperRenderer] applyWallpaperToAll: both paths produced nothing — " +
    "room model may not be loaded yet",
  );
  return "none";
}

/**
 * Remove all wallpaper (both painted mesh materials and overlay planes) and
 * restore the room to its original look.
 */
export function clearAllWallpaper(): void {
  restoreRoomWallMaterials();
  removeAllWallpaperPlanes();
  console.log("[WallpaperRenderer] All wallpaper cleared");
}

// ─────────────────────────────────────────────────────────────────────────────
//  Single-plane helpers (used internally + by the cutout system)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a single textured plane on the given wall and register it so the
 * cutout / overlay APIs can reference it by `id`.
 *
 * @returns The created `Mesh`, already parented to `__labRoomModel`.
 */
export function createWallpaperMesh(
  id: string,
  wallInfo: WallInfo,
  imageDataUrl: string,
): Mesh {
  const { width, height, center, wallNormal } = wallInfo;

  const geometry = new PlaneGeometry(width, height);
  const texture = loadTexture(imageDataUrl, {
    targetWidth: width,
    targetHeight: height,
    fitMode: "cover",
  });

  const material = new MeshBasicMaterial({
    map: texture,
    side: DoubleSide,
    toneMapped: false,
    transparent: false,
    opacity: 1,
  });

  const mesh = new Mesh(geometry, material);
  mesh.position.set(center[0], center[1], center[2]);
  mesh.name = `wallpaper-plane-${id}`;

  orientToNormal(mesh, wallNormal);

  const labModel = getLabModel();
  if (labModel) {
    labModel.add(mesh);
  } else {
    console.warn(
      "[WallpaperRenderer] __labRoomModel not available; plane added to scene root",
    );
    (globalThis as any).__scene?.add(mesh);
  }

  _planeRecords.set(id, {
    id,
    mesh,
    wallWidth: width,
    wallHeight: height,
    confirmOverlay: null,
    previewOverlay: null,
  });

  console.log(
    `[WallpaperRenderer] Plane "${id}" created ` +
    `(${width.toFixed(2)}m × ${height.toFixed(2)}m) ` +
    `at (${center[0].toFixed(2)}, ${center[1].toFixed(2)}, ${center[2].toFixed(2)})`,
  );

  return mesh;
}

/**
 * Punch rectangular holes in a plane mesh by replacing its `PlaneGeometry`
 * with a `ShapeGeometry` that has `THREE.Path` holes.  UVs are remapped so
 * the texture still covers the remaining solid areas correctly.
 */
export function applyWallpaperCutouts(
  id: string,
  holes: WallpaperCutoutRect[],
): void {
  const record = _planeRecords.get(id);
  if (!record) {
    console.warn(
      `[WallpaperRenderer] applyWallpaperCutouts: unknown id "${id}"`,
    );
    return;
  }

  const { mesh, wallWidth: w, wallHeight: h } = record;
  const hw = w / 2;
  const hh = h / 2;

  const shape = new Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  for (const hole of holes) {
    const path = new Path();
    path.moveTo(hole.x, hole.y);
    path.lineTo(hole.x, hole.y + hole.height);
    path.lineTo(hole.x + hole.width, hole.y + hole.height);
    path.lineTo(hole.x + hole.width, hole.y);
    path.closePath();
    shape.holes.push(path);
  }

  const geom = new ShapeGeometry(shape);
  remapUVs(geom, w, h);

  mesh.geometry.dispose();
  mesh.geometry = geom;

  console.log(
    `[WallpaperRenderer] Applied ${holes.length} cutout(s) to plane "${id}"`,
  );
}

/** Set the material opacity of a plane mesh (e.g. 0.5 during cutout drawing). */
export function setWallpaperOpacity(id: string, opacity: number): void {
  const record = _planeRecords.get(id);
  if (!record) return;
  const mat = record.mesh.material as MeshBasicMaterial;
  mat.transparent = opacity < 1;
  mat.opacity = opacity;
  mat.needsUpdate = true;
}

/** Retrieve the raw `Mesh` for a registered plane (used for raycasting). */
export function getWallpaperMesh(id: string): Mesh | null {
  return _planeRecords.get(id)?.mesh ?? null;
}

/** True when a plane record exists for `id`. */
export function wallpaperExists(id: string): boolean {
  return _planeRecords.has(id);
}

/** All registered plane ids. */
export function getAllWallpaperIds(): string[] {
  return Array.from(_planeRecords.keys());
}

/**
 * Remove a single plane from the scene and free its GPU resources.
 */
export function removeWallpaperMesh(id: string): void {
  const record = _planeRecords.get(id);
  if (!record) return;

  const { mesh, confirmOverlay, previewOverlay } = record;

  if (confirmOverlay) mesh.remove(confirmOverlay);
  if (previewOverlay) mesh.remove(previewOverlay);
  disposeLineSegments(confirmOverlay);
  disposeLineSegments(previewOverlay);

  mesh.parent?.remove(mesh);
  mesh.geometry.dispose();
  const mat = mesh.material as MeshBasicMaterial;
  if (mat.map) mat.map.dispose();
  mat.dispose();

  _planeRecords.delete(id);
  console.log(`[WallpaperRenderer] Plane "${id}" removed`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Lasso overlay helpers (for the optional cutout-drawing step)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuild the green "confirmed regions" `LineSegments` overlay that is a
 * child of the plane mesh.  Pass an empty array to clear all lines.
 */
export function updateLassoConfirmOverlay(
  id: string,
  regions: WallpaperCutoutRect[],
): void {
  const record = _planeRecords.get(id);
  if (!record) return;

  if (record.confirmOverlay) {
    record.mesh.remove(record.confirmOverlay);
    disposeLineSegments(record.confirmOverlay);
    record.confirmOverlay = null;
  }

  if (regions.length === 0) return;

  const vertices: number[] = [];
  for (const rect of regions) pushRectLines(vertices, rect, 0.005);

  record.confirmOverlay = buildLineSegments(vertices, 0x22c55e);
  record.mesh.add(record.confirmOverlay);
}

/**
 * Update the yellow in-progress drag-preview `LineSegments` overlay.
 * Pass `null` to hide it.
 */
export function updateLassoPreviewOverlay(
  id: string,
  rect: WallpaperCutoutRect | null,
): void {
  const record = _planeRecords.get(id);
  if (!record) return;

  if (record.previewOverlay) {
    record.mesh.remove(record.previewOverlay);
    disposeLineSegments(record.previewOverlay);
    record.previewOverlay = null;
  }

  if (!rect || rect.width < 0.001 || rect.height < 0.001) return;

  const vertices: number[] = [];
  pushRectLines(vertices, rect, 0.006);

  record.previewOverlay = buildLineSegments(vertices, 0xf59e0b);
  record.mesh.add(record.previewOverlay);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Wall-mesh detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Heuristic: returns `true` when a mesh is likely a wall.
 *
 * Two independent signals — if either fires the mesh is treated as a wall:
 *
 * **Name signal** (highest confidence)
 * The mesh name (lower-cased) contains one of: "wall", "wand", "mur", "pared",
 * "paroi", "wal", "zid", "muur".  This covers the most common model-authoring
 * conventions in English, German, French, Spanish, Dutch, and Slavic languages.
 *
 * **Shape signal** (geometry-based, works on untitled meshes)
 * Bounding box in world space satisfies ALL of:
 *   • height (y)  > 1.0 m   — it is taller than a metre
 *   • min dimension (x or z) < 15 % of height   — it is thin
 *   • max dimension (x or z) > 0.5 m             — it is wide
 * Floor slabs (thin in Y, not Y) and ceilings are excluded automatically
 * because they fail the first condition.
 */
function isLikelyWallMesh(mesh: Mesh): boolean {
  // ── name-based ────────────────────────────────────────────────────────────
  const WALL_NAME_FRAGMENTS = [
    "wall",
    "wand",
    "mur",
    "pared",
    "paroi",
    "wal ",
    "zid",
    "muur",
    "wall_",
    "_wall",
    "walls",
  ];
  const nameLower = (mesh.name || "").toLowerCase();
  if (WALL_NAME_FRAGMENTS.some((f) => nameLower.includes(f))) {
    return true;
  }

  // ── shape-based ───────────────────────────────────────────────────────────
  const bbox = new Box3().setFromObject(mesh);
  const size = new Vector3();
  bbox.getSize(size);

  const height = size.y;
  if (height < 1.0) return false; // too short to be a wall

  const minH = Math.min(size.x, size.z); // thickness of the wall
  const maxH = Math.max(size.x, size.z); // span of the wall

  const isThin = minH < height * 0.15; // wall is thin relative to its height
  const isWide = maxH > 0.5; // wall spans at least 0.5 m

  return isThin && isWide;
}

/**
 * Validate geometry UVs before texture-painting room meshes.
 * If UVs are missing or collapsed to a line/point, texture sampling often
 * clamps to one edge and appears as a stretched flat color.
 */
function hasUsableUVs(geometry: BufferGeometry): boolean {
  const uv = geometry.getAttribute("uv");
  if (!uv || uv.itemSize < 2 || uv.count < 3) return false;

  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (!Number.isFinite(u) || !Number.isFinite(v)) return false;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const spanU = maxU - minU;
  const spanV = maxV - minV;
  const MIN_SPAN = 0.01;
  return spanU > MIN_SPAN && spanV > MIN_SPAN;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function getLabModel(): Object3D | null {
  return (globalThis as any).__labRoomModel ?? null;
}

/**
 * Load a texture from a data-URL or any URL recognised by `TextureLoader`.
 * Colour-space, filtering, and wrapping are configured for best visual output.
 */
function loadTexture(
  dataUrl: string,
  fit?: {
    targetWidth: number;
    targetHeight: number;
    fitMode?: "cover";
  },
): Texture {
  const url = dataUrl.startsWith("data:")
    ? dataUrl
    : `data:image/png;base64,${dataUrl}`;

  const loader = new TextureLoader();
  const texture = loader.load(url, (loadedTexture) => {
    if (fit) applyTextureFit(loadedTexture, fit.targetWidth, fit.targetHeight);
  });

  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  if (fit) applyTextureFit(texture, fit.targetWidth, fit.targetHeight);
  texture.needsUpdate = true;

  return texture;
}

/**
 * Configure UV transform so image fills the target rectangle without stretch.
 * "cover" behavior: image keeps aspect ratio and is center-cropped if needed.
 */
function applyTextureFit(
  texture: Texture,
  targetWidth: number,
  targetHeight: number,
): void {
  const image = texture.image as
    | { width?: number; height?: number }
    | undefined;
  const imageWidth = image?.width ?? 0;
  const imageHeight = image?.height ?? 0;
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return;
  }

  const imageAspect = imageWidth / imageHeight;
  const targetAspect = targetWidth / targetHeight;

  texture.center.set(0.5, 0.5);
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);

  // Keep image aspect ratio while covering full target area.
  if (imageAspect > targetAspect) {
    // Image is wider than target -> crop left/right.
    texture.repeat.x = targetAspect / imageAspect;
    texture.offset.x = (1 - texture.repeat.x) * 0.5;
  } else if (imageAspect < targetAspect) {
    // Image is taller than target -> crop top/bottom.
    texture.repeat.y = imageAspect / targetAspect;
    texture.offset.y = (1 - texture.repeat.y) * 0.5;
  }

  texture.needsUpdate = true;
}

/**
 * Rotate a plane mesh so its +Z face aligns with `wallNormal`.
 * `PlaneGeometry` default face normal is [0, 0, 1].
 */
function orientToNormal(
  plane: Mesh,
  wallNormal: [number, number, number],
): void {
  const target = new Vector3(
    wallNormal[0],
    wallNormal[1],
    wallNormal[2],
  ).normalize();
  const defaultNormal = new Vector3(0, 0, 1);

  if (target.dot(defaultNormal) < -0.999) {
    // Exactly anti-parallel — flip 180° around Y to avoid degenerate quaternion
    plane.rotation.set(0, Math.PI, 0);
  } else {
    plane.quaternion.setFromUnitVectors(defaultNormal, target);
  }
}

/**
 * Recompute UV coordinates for a `ShapeGeometry` so the texture fills the
 * rectangle [−w/2, w/2] × [−h/2, h/2].
 */
function remapUVs(geometry: ShapeGeometry, w: number, h: number): void {
  const pos = geometry.attributes.position;
  if (!pos) return;
  const count = pos.count;
  const uvArray = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    uvArray[i * 2] = pos.getX(i) / w + 0.5;
    uvArray[i * 2 + 1] = pos.getY(i) / h + 0.5;
  }
  geometry.setAttribute("uv", new BufferAttribute(uvArray, 2));
  geometry.attributes.uv.needsUpdate = true;
}

/**
 * Append 8 vertex positions (4 edges × 2 endpoints) for a rectangle outline
 * to `out`.  `z` is the local-space depth to keep lines in front of the plane.
 */
function pushRectLines(
  out: number[],
  rect: WallpaperCutoutRect,
  z: number,
): void {
  const { x, y, width, height } = rect;
  const x2 = x + width;
  const y2 = y + height;
  // bottom, right, top, left
  out.push(x, y, z, x2, y, z);
  out.push(x2, y, z, x2, y2, z);
  out.push(x2, y2, z, x, y2, z);
  out.push(x, y2, z, x, y, z);
}

function buildLineSegments(vertices: number[], color: number): LineSegments {
  const array = new Float32Array(vertices);
  const geom = new BufferGeometry();
  geom.setAttribute("position", new BufferAttribute(array, 3));
  const mat = new LineBasicMaterial({ color, linewidth: 2 });
  return new LineSegments(geom, mat);
}

function disposeLineSegments(ls: LineSegments | null): void {
  if (!ls) return;
  ls.geometry.dispose();
  (ls.material as LineBasicMaterial).dispose();
}

function disposeMaterial(mat: Material | Material[]): void {
  if (Array.isArray(mat)) {
    mat.forEach((m) => {
      if ((m as MeshBasicMaterial).map) (m as MeshBasicMaterial).map!.dispose();
      m.dispose();
    });
  } else {
    if ((mat as MeshBasicMaterial).map)
      (mat as MeshBasicMaterial).map!.dispose();
    mat.dispose();
  }
}
