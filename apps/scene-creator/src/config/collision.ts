import { Raycaster, Vector3, Object3D, Mesh, Box3, DoubleSide, Material } from "three";

// ============================================================================
// COLLISION MANAGER — Raycaster-based collision against lab model meshes
// ============================================================================

const AVATAR_COLLISION_RADIUS = 0.6;
const DEVICE_COLLISION_RADIUS = 0.2;

/**
 * Names to EXCLUDE from collision.
 */
const EXCLUDED_NAMES: string[] = [];

let collisionMeshes: Mesh[] = [];
let initialized = false;

/** Room vertical bounds for Y-axis clamping */
let _floorY = 0;
let _ceilingY = 3;

/** Cached original material.side values — restored after each raycasting batch */
let originalSides: number[] = [];

const _raycaster = new Raycaster();
const _direction = new Vector3();
const _origin = new Vector3();

/**
 * Horizontal ray height offsets relative to the entity's Y position.
 * Cast at many heights to catch furniture of all sizes, especially thin table tops.
 */
const RAY_HEIGHTS = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.9, 1.1, 1.3];

// Throttled debug logging
let _lastDebugLogTime = 0;
const DEBUG_LOG_INTERVAL = 3000;

// ── Material side helpers ───────────────────────────────────────────────────

function enableDoubleSideForRaycast(): void {
  for (let i = 0; i < collisionMeshes.length; i++) {
    const mat = collisionMeshes[i].material as Material;
    mat.side = DoubleSide;
  }
}

function restoreOriginalSides(): void {
  for (let i = 0; i < collisionMeshes.length; i++) {
    const mat = collisionMeshes[i].material as Material;
    mat.side = originalSides[i] as typeof mat.side;
  }
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Extract collision meshes from the loaded room model.
 * Call once after the room GLTF is added to the scene.
 */
export function initializeCollision(roomModel: any): void {
  collisionMeshes = [];
  originalSides = [];

  // Get room vertical bounds from the model's bounding box
  const bbox = new Box3().setFromObject(roomModel);
  _floorY = bbox.min.y;
  _ceilingY = bbox.max.y;

  roomModel.traverse((child: Object3D) => {
    if (!(child as Mesh).isMesh) return;

    let excluded = false;
    let current: Object3D | null = child;
    while (current) {
      if (EXCLUDED_NAMES.length > 0 && EXCLUDED_NAMES.some((ex) => current!.name.includes(ex))) {
        excluded = true;
        break;
      }
      current = current.parent;
    }

    if (!excluded) {
      const mesh = child as Mesh;
      collisionMeshes.push(mesh);
      originalSides.push((mesh.material as Material).side);
    }
  });

  initialized = true;

  const uniqueGeos = new Set(collisionMeshes.map((m) => m.geometry.uuid));
  console.log(
    `🧱 [Collision] Initialized with ${collisionMeshes.length} collision meshes ` +
    `(${uniqueGeos.size} unique geometries, floor=${_floorY.toFixed(2)}, ceiling=${_ceilingY.toFixed(2)})`
  );
}

/**
 * Check whether moving from currentPos to nextPos would collide with any mesh.
 * 
 * Casts horizontal rays at multiple heights to detect vertical surfaces
 * (walls, pillars, desk edges, cabinet sides). Materials are temporarily
 * set to DoubleSide during raycasting to catch faces regardless of normal
 * direction, then restored immediately.
 */
export function checkCollision(
  currentPos: Vector3,
  nextPos: Vector3,
  radius: number
): boolean {
  if (!initialized || collisionMeshes.length === 0) return false;

  _direction.subVectors(nextPos, currentPos);
  _direction.y = 0;
  const distance = _direction.length();
  if (distance < 0.0001) return false;
  _direction.normalize();

  // Temporarily make all materials double-sided for raycasting.
  // Restored in finally block so rendering is never affected.
  enableDoubleSideForRaycast();

  try {
    for (const yOffset of RAY_HEIGHTS) {
      _origin.set(currentPos.x, currentPos.y + yOffset, currentPos.z);
      _raycaster.set(_origin, _direction);
      _raycaster.far = distance + radius;
      _raycaster.near = 0;

      const hits = _raycaster.intersectObjects(collisionMeshes, false);
      if (hits.length > 0 && hits[0].distance < distance + radius) {
        _throttledLog(
          `🧱 [Collision] Hit at height=${yOffset.toFixed(2)} ` +
          `dist=${hits[0].distance.toFixed(2)} mesh=${hits[0].object.name || "?"}`
        );
        return true;
      }
    }

    return false;
  } finally {
    restoreOriginalSides();
  }
}

/**
 * Constrain XZ movement: returns the allowed position.
 * If the full move collides, tries sliding along each axis independently.
 * Falls back to currentPos if both axes are blocked.
 */
export function constrainMovement(
  currentX: number,
  currentZ: number,
  nextX: number,
  nextZ: number,
  y: number,
  radius: number
): { x: number; z: number } {
  if (!initialized || collisionMeshes.length === 0) {
    return { x: nextX, z: nextZ };
  }

  const currentPos = new Vector3(currentX, y, currentZ);
  const nextPos = new Vector3(nextX, y, nextZ);

  // 1. Try full movement
  if (!checkCollision(currentPos, nextPos, radius)) {
    return { x: nextX, z: nextZ };
  }

  // 2. Try sliding along X axis only
  const slideX = new Vector3(nextX, y, currentZ);
  const canSlideX = !checkCollision(currentPos, slideX, radius);

  // 3. Try sliding along Z axis only
  const slideZ = new Vector3(currentX, y, nextZ);
  const canSlideZ = !checkCollision(currentPos, slideZ, radius);

  if (canSlideX && canSlideZ) {
    const dx = Math.abs(nextX - currentX);
    const dz = Math.abs(nextZ - currentZ);
    return dx >= dz ? { x: nextX, z: currentZ } : { x: currentX, z: nextZ };
  }
  if (canSlideX) return { x: nextX, z: currentZ };
  if (canSlideZ) return { x: currentX, z: nextZ };

  // 4. Fully blocked
  return { x: currentX, z: currentZ };
}

function _throttledLog(msg: string): void {
  const now = Date.now();
  if (now - _lastDebugLogTime > DEBUG_LOG_INTERVAL) {
    console.log(msg);
    _lastDebugLogTime = now;
  }
}

/**
 * Clamp a device's Y position to stay between the floor and ceiling.
 * Adds a small offset so the device sits ON the surface, not inside it.
 */
export function clampDeviceY(y: number, deviceHeight: number = 0.1): number {
  const minY = _floorY + deviceHeight;
  const maxY = _ceilingY - deviceHeight;
  return Math.max(minY, Math.min(maxY, y));
}

/** Convenience radius constants for callers */
export { AVATAR_COLLISION_RADIUS, DEVICE_COLLISION_RADIUS };
