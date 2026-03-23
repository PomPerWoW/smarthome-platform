import {
  PlaneGeometry,
  MeshBasicMaterial,
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
  LinearFilter,
  Vector3,
  Texture,
  Object3D,
} from "three";

import { WallInfo } from "../utils/wallDetection";
import { WallpaperCutoutRect } from "../store/WallpaperStore";

// ─── Internal record kept per wallpaper ──────────────────────────────────────

interface WallpaperRecord {
  id: string;
  mesh: Mesh;
  wallWidth: number;
  wallHeight: number;
  /** Green confirmed-region overlay (child of mesh) */
  confirmOverlay: LineSegments | null;
  /** Yellow in-progress drag preview overlay (child of mesh) */
  previewOverlay: LineSegments | null;
}

// ─── Module-level registry (one per wallpaper id) ────────────────────────────

const _records = new Map<string, WallpaperRecord>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a wallpaper plane mesh, orient it to face the given wall, and add it
 * as a child of `__labRoomModel`.  Positions are already in labModel-local
 * space (computed by `wallDetection.ts`).
 *
 * @returns The created `Mesh`, already added to the scene graph.
 */
export function createWallpaperMesh(
  id: string,
  wallInfo: WallInfo,
  imageDataUrl: string,
): Mesh {
  const { width, height, center, wallNormal } = wallInfo;

  // ── geometry ─────────────────────────────────────────────────────────────
  const geometry = new PlaneGeometry(width, height);

  // ── texture ───────────────────────────────────────────────────────────────
  const texture = loadTexture(imageDataUrl);

  // ── material ──────────────────────────────────────────────────────────────
  const material = new MeshBasicMaterial({
    map: texture,
    side: DoubleSide,
    toneMapped: false,
    transparent: false,
    opacity: 1,
  });

  // ── mesh ──────────────────────────────────────────────────────────────────
  const mesh = new Mesh(geometry, material);
  mesh.position.set(center[0], center[1], center[2]);
  mesh.name = `wallpaper-${id}`;

  // Rotate the plane so its normal aligns with the wall normal
  orientToNormal(mesh, wallNormal);

  // ── add to scene ──────────────────────────────────────────────────────────
  const labModel = getLabModel();
  if (labModel) {
    labModel.add(mesh);
  } else {
    console.warn("[WallpaperRenderer] __labRoomModel not available; adding to window.scene");
    (globalThis as any).__scene?.add(mesh);
  }

  // ── register ──────────────────────────────────────────────────────────────
  _records.set(id, {
    id,
    mesh,
    wallWidth: width,
    wallHeight: height,
    confirmOverlay: null,
    previewOverlay: null,
  });

  console.log(
    `[WallpaperRenderer] Created wallpaper "${id}" ` +
      `(${width.toFixed(2)}m × ${height.toFixed(2)}m) ` +
      `at (${center[0].toFixed(2)}, ${center[1].toFixed(2)}, ${center[2].toFixed(2)})`,
  );

  return mesh;
}

/**
 * Punch holes in an existing wallpaper plane by rebuilding its geometry as a
 * `THREE.ShapeGeometry` with `THREE.Path` holes.  UVs are recomputed so the
 * texture still covers the solid areas correctly.
 */
export function applyWallpaperCutouts(
  id: string,
  holes: WallpaperCutoutRect[],
): void {
  const record = _records.get(id);
  if (!record) {
    console.warn(`[WallpaperRenderer] applyWallpaperCutouts: unknown id "${id}"`);
    return;
  }

  const { mesh, wallWidth: w, wallHeight: h } = record;
  const hw = w / 2;
  const hh = h / 2;

  // Outer rectangle (the full wallpaper)
  const shape = new Shape();
  shape.moveTo(-hw, -hh);
  shape.lineTo(hw, -hh);
  shape.lineTo(hw, hh);
  shape.lineTo(-hw, hh);
  shape.closePath();

  // Each cutout becomes a hole
  for (const hole of holes) {
    const path = new Path();
    const x1 = hole.x;
    const y1 = hole.y;
    const x2 = hole.x + hole.width;
    const y2 = hole.y + hole.height;
    path.moveTo(x1, y1);
    path.lineTo(x1, y2);
    path.lineTo(x2, y2);
    path.lineTo(x2, y1);
    path.closePath();
    shape.holes.push(path);
  }

  const geom = new ShapeGeometry(shape);
  remapUVs(geom, w, h);

  // Swap geometry, dispose old one
  mesh.geometry.dispose();
  mesh.geometry = geom;

  console.log(
    `[WallpaperRenderer] Applied ${holes.length} cutout(s) to wallpaper "${id}"`,
  );
}

/**
 * Set the material opacity of a wallpaper mesh.  Useful to make it
 * semi-transparent while the user is drawing cutout regions.
 */
export function setWallpaperOpacity(id: string, opacity: number): void {
  const record = _records.get(id);
  if (!record) return;
  const mat = record.mesh.material as MeshBasicMaterial;
  mat.transparent = opacity < 1;
  mat.opacity = opacity;
  mat.needsUpdate = true;
}

/**
 * Retrieve the raw `Mesh` for a wallpaper (used for raycasting during lasso
 * drawing).
 */
export function getWallpaperMesh(id: string): Mesh | null {
  return _records.get(id)?.mesh ?? null;
}

/** True if a wallpaper record exists for the given id. */
export function wallpaperExists(id: string): boolean {
  return _records.has(id);
}

/** All registered wallpaper ids. */
export function getAllWallpaperIds(): string[] {
  return Array.from(_records.keys());
}

/**
 * Remove a wallpaper from the scene and free its GPU resources.
 */
export function removeWallpaperMesh(id: string): void {
  const record = _records.get(id);
  if (!record) return;

  const { mesh, confirmOverlay, previewOverlay } = record;

  // Remove overlays first
  if (confirmOverlay) mesh.remove(confirmOverlay);
  if (previewOverlay) mesh.remove(previewOverlay);
  disposeLineSegments(confirmOverlay);
  disposeLineSegments(previewOverlay);

  // Remove mesh from parent
  mesh.parent?.remove(mesh);

  // Free GPU memory
  mesh.geometry.dispose();
  const mat = mesh.material as MeshBasicMaterial;
  if (mat.map) mat.map.dispose();
  mat.dispose();

  _records.delete(id);

  console.log(`[WallpaperRenderer] Removed wallpaper "${id}"`);
}

// ─── Lasso overlay API ────────────────────────────────────────────────────────

/**
 * Update the green "confirmed regions" line-segment overlay that is a child
 * of the wallpaper mesh.  Pass an empty array to clear all confirmed lines.
 */
export function updateLassoConfirmOverlay(
  id: string,
  regions: WallpaperCutoutRect[],
): void {
  const record = _records.get(id);
  if (!record) return;

  // Remove old overlay
  if (record.confirmOverlay) {
    record.mesh.remove(record.confirmOverlay);
    disposeLineSegments(record.confirmOverlay);
    record.confirmOverlay = null;
  }

  if (regions.length === 0) return;

  const vertices: number[] = [];
  for (const rect of regions) {
    pushRectLines(vertices, rect, 0.005);
  }

  record.confirmOverlay = buildLineSegments(
    vertices,
    0x22c55e, // Tailwind green-500
  );
  record.mesh.add(record.confirmOverlay);
}

/**
 * Update (or clear) the yellow in-progress drag-preview rectangle that is a
 * child of the wallpaper mesh.  Pass `null` to hide the preview.
 */
export function updateLassoPreviewOverlay(
  id: string,
  rect: WallpaperCutoutRect | null,
): void {
  const record = _records.get(id);
  if (!record) return;

  // Remove old preview
  if (record.previewOverlay) {
    record.mesh.remove(record.previewOverlay);
    disposeLineSegments(record.previewOverlay);
    record.previewOverlay = null;
  }

  if (!rect || rect.width < 0.001 || rect.height < 0.001) return;

  const vertices: number[] = [];
  pushRectLines(vertices, rect, 0.006);

  record.previewOverlay = buildLineSegments(
    vertices,
    0xf59e0b, // Tailwind amber-500
  );
  record.mesh.add(record.previewOverlay);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLabModel(): Object3D | null {
  return (globalThis as any).__labRoomModel ?? null;
}

function loadTexture(dataUrl: string): Texture {
  const url = dataUrl.startsWith("data:")
    ? dataUrl
    : `data:image/png;base64,${dataUrl}`;
  const loader = new TextureLoader();
  const texture = loader.load(url);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Rotate `plane` so its +Z face aligns with `wallNormal`.
 * A PlaneGeometry's default face normal is [0, 0, 1].
 */
function orientToNormal(
  plane: Mesh,
  wallNormal: [number, number, number],
): void {
  const target = new Vector3(wallNormal[0], wallNormal[1], wallNormal[2]).normalize();
  const defaultNormal = new Vector3(0, 0, 1);

  if (target.dot(defaultNormal) < -0.999) {
    // Exactly anti-parallel — flip 180° around Y
    plane.rotation.set(0, Math.PI, 0);
  } else {
    plane.quaternion.setFromUnitVectors(defaultNormal, target);
  }
}

/**
 * Recompute UV coordinates for a `ShapeGeometry` so that the image fills the
 * wallpaper rectangle [−w/2, w/2] × [−h/2, h/2].
 */
function remapUVs(
  geometry: ShapeGeometry,
  w: number,
  h: number,
): void {
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
 * Push 8 vertices (4 edges × 2 endpoints) for a rectangle outline into the
 * `out` array.  `z` is the local-space depth offset (keeps lines in front of
 * the wallpaper plane).
 */
function pushRectLines(
  out: number[],
  rect: WallpaperCutoutRect,
  z: number,
): void {
  const { x, y, width, height } = rect;
  const x1 = x;
  const y1 = y;
  const x2 = x + width;
  const y2 = y + height;
  // Bottom
  out.push(x1, y1, z, x2, y1, z);
  // Right
  out.push(x2, y1, z, x2, y2, z);
  // Top
  out.push(x2, y2, z, x1, y2, z);
  // Left
  out.push(x1, y2, z, x1, y1, z);
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
