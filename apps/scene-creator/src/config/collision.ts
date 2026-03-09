/**
 * Mesh-based collision detection using the room model's geometry.
 *
 * Strategy:
 *   - Collects all Mesh children from the loaded room model (LabPlan, etc.).
 *   - When an entity wants to move, casts horizontal rays from the current
 *     position toward the destination at several heights.
 *   - If a ray hits room geometry within (moveDist + radius), the movement
 *     is projected along the wall surface (sliding). If that also collides,
 *     movement is fully blocked.
 *
 * Uses `Mesh.prototype.raycast.call()` to bypass the no-op override applied
 * for the interactive grab system. This way collision works without
 * interfering with device grab interactions.
 */
import { Mesh, Object3D, Raycaster, Vector3, Intersection } from "three";

// ── Private state ──────────────────────────────────────────────────────────

/** Reference to the original Three.js Mesh.raycast before we overrode it. */
const _originalRaycast = Mesh.prototype.raycast;

let _collisionMeshes: Mesh[] = [];
let _roomModel: Object3D | null = null;

const _raycaster = new Raycaster();
const _origin = new Vector3();
const _dir = new Vector3();

// ── Preset height arrays for different entity types ────────────────────────

/** Robot assistant (scaled 0.2, ~30 cm tall): check near the ground. */
/** Increased height checks to catch thin table side faces at various heights */
export const ROBOT_HEIGHTS = [0.02, 0.05, 0.08, 0.12, 0.15, 0.18, 0.22, 0.25, 0.28];
/** Robot collision radius (metres). */
export const ROBOT_RADIUS = 0.15;

/** Human-sized avatars (scaled 0.5, ~85 cm tall). */
export const AVATAR_HEIGHTS = [0.1, 0.4, 0.7];
/** Avatar collision radius (metres). */
export const AVATAR_RADIUS = 0.25;

/** Smart devices / furniture: single check at object centre. */
export const DEVICE_RADIUS = 0.08;
/** How far (metres) to push a device back from a surface on collision. */
const DEVICE_PUSH_BACK = 0.02;

// ── Initialization ─────────────────────────────────────────────────────────

/**
 * Initialize collision detection from the room model's mesh geometry.
 * Should be called **after** the model is loaded and added to the scene.
 */
export function initializeCollision(roomModel: Object3D): void {
  _collisionMeshes = [];
  _roomModel = roomModel;

  roomModel.traverse((child: any) => {
    if (child.isMesh && child.geometry) {
      _collisionMeshes.push(child as Mesh);
    }
  });

  // Ensure world matrices are current for raycasting
  roomModel.updateMatrixWorld(true);

  console.log(
    `[Collision] ✅ Initialized with ${_collisionMeshes.length} meshes from room model`,
  );
}

/**
 * Force-update collision mesh world matrices.
 * Call whenever the room model's transform changes (room alignment, manual panel).
 */
export function updateCollisionTransform(): void {
  if (_roomModel) {
    _roomModel.updateMatrixWorld(true);
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Cast a single ray against all room meshes using the **original**
 * `Mesh.prototype.raycast` (bypasses the instance-level no-op override).
 * Returns the closest hit or `null`.
 */
function raycastRoom(
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
): Intersection | null {
  _raycaster.set(origin, direction);
  _raycaster.far = maxDistance;
  _raycaster.near = 0;

  const hits: Intersection[] = [];
  for (const mesh of _collisionMeshes) {
    _originalRaycast.call(mesh, _raycaster, hits);
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => a.distance - b.distance);
  return hits[0];
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Constrain an entity's horizontal movement against room geometry.
 *
 * All positions are in **world space** (the raycaster internally accounts
 * for the room model's transform via each mesh's `matrixWorld`).
 *
 * 1. Casts horizontal rays from `from` toward `to` at each given height.
 * 2. If any ray hits geometry within `(moveDist + radius)`, the movement
 *    is projected onto the wall surface (wall-sliding).
 * 3. If the slide direction also collides, movement is fully blocked.
 *
 * @param from    Current world-space position of the entity
 * @param to      Intended world-space position after movement
 * @param radius  Collision radius of the entity (metres)
 * @param heights Heights above `from.y` at which to cast rays
 * @returns       The constrained world-space destination
 */
export function constrainMovement(
  from: Vector3,
  to: Vector3,
  radius: number,
  heights: number[] = AVATAR_HEIGHTS,
): Vector3 {
  if (_collisionMeshes.length === 0) return to.clone();

  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const hDist = Math.sqrt(dx * dx + dz * dz);
  if (hDist < 0.0005) return to.clone();

  _dir.set(dx / hDist, 0, dz / hDist);

  // ── 1) Optimized collision check ──────────────────────────────────────
  // Check forward movement with efficient strategies to catch thin vertical surfaces
  let blocked = false;
  let hitNormal: Vector3 | null = null;
  let closestHitDist = Infinity;

  // Strategy 1: Forward raycast at key heights (primary check)
  // Sample heights more efficiently - check bottom, middle, and top regions
  const keyHeights = heights.length > 6 
    ? [heights[0], heights[Math.floor(heights.length / 3)], heights[Math.floor(heights.length * 2 / 3)], heights[heights.length - 1]]
    : heights;
  
  for (const h of keyHeights) {
    _origin.set(from.x, from.y + h, from.z);
    const hit = raycastRoom(_origin, _dir, hDist + radius);
    if (hit && hit.distance < hDist + radius) {
      blocked = true;
      closestHitDist = hit.distance;
      if (hit.face) {
        hitNormal = hit.face.normal
          .clone()
          .transformDirection(hit.object.matrixWorld)
          .setY(0);
        if (hitNormal.lengthSq() > 0.0001) hitNormal.normalize();
        else hitNormal = null;
      }
      break; // Early exit - found collision
    }
  }

  // Strategy 2: Limited angle probes to catch thin surfaces at slight angles
  // Only check if forward check didn't find anything and movement is significant
  if (!blocked && hDist > 0.001) {
    // Use only 2 key angles (30 degrees) instead of 3, and only check at 2 key heights
    const angleDeg = 30;
    const angleRad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    
    // Left and right directions
    const leftDir = new Vector3(
      _dir.x * cosA - _dir.z * sinA,
      0,
      _dir.x * sinA + _dir.z * cosA
    );
    const rightDir = new Vector3(
      _dir.x * cosA + _dir.z * sinA,
      0,
      -_dir.x * sinA + _dir.z * cosA
    );
    
    // Only check at 2 key heights (bottom and middle)
    const probeHeights = keyHeights.slice(0, 2);
    
    for (const h of probeHeights) {
      _origin.set(from.x, from.y + h, from.z);
      
      // Check left angle
      const leftHit = raycastRoom(_origin, leftDir, hDist + radius);
      if (leftHit && leftHit.distance < hDist + radius) {
        blocked = true;
        closestHitDist = leftHit.distance;
        if (leftHit.face) {
          hitNormal = leftHit.face.normal
            .clone()
            .transformDirection(leftHit.object.matrixWorld)
            .setY(0);
          if (hitNormal.lengthSq() > 0.0001) hitNormal.normalize();
          else hitNormal = null;
        }
        break; // Early exit
      }
      
      // Check right angle
      const rightHit = raycastRoom(_origin, rightDir, hDist + radius);
      if (rightHit && rightHit.distance < hDist + radius) {
        blocked = true;
        closestHitDist = rightHit.distance;
        if (rightHit.face) {
          hitNormal = rightHit.face.normal
            .clone()
            .transformDirection(rightHit.object.matrixWorld)
            .setY(0);
          if (hitNormal.lengthSq() > 0.0001) hitNormal.normalize();
          else hitNormal = null;
        }
        break; // Early exit
      }
    }
  }

  // Strategy 3: Perpendicular side probes - only if still not blocked
  // Check sides at limited heights to catch thin edges
  if (!blocked && hDist > 0.001) {
    const perpLeft = new Vector3(-_dir.z, 0, _dir.x);
    const perpRight = new Vector3(_dir.z, 0, -_dir.x);
    
    // Only check at 2-3 key heights for side probes
    const sideProbeHeights = keyHeights.slice(0, Math.min(3, keyHeights.length));
    
    for (const h of sideProbeHeights) {
      _origin.set(from.x, from.y + h, from.z);
      
      // Probe left side
      const leftHit = raycastRoom(_origin, perpLeft, radius * 1.1);
      if (leftHit && leftHit.distance < radius * 1.1) {
        blocked = true;
        closestHitDist = leftHit.distance;
        if (leftHit.face) {
          hitNormal = leftHit.face.normal
            .clone()
            .transformDirection(leftHit.object.matrixWorld)
            .setY(0);
          if (hitNormal.lengthSq() > 0.0001) hitNormal.normalize();
          else hitNormal = null;
        }
        break; // Early exit
      }
      
      // Probe right side
      const rightHit = raycastRoom(_origin, perpRight, radius * 1.1);
      if (rightHit && rightHit.distance < radius * 1.1) {
        blocked = true;
        closestHitDist = rightHit.distance;
        if (rightHit.face) {
          hitNormal = rightHit.face.normal
            .clone()
            .transformDirection(rightHit.object.matrixWorld)
            .setY(0);
          if (hitNormal.lengthSq() > 0.0001) hitNormal.normalize();
          else hitNormal = null;
        }
        break; // Early exit
      }
    }
  }

  if (!blocked) return to.clone();

  // ── 2) Wall slide ─────────────────────────────────────────────────────
  if (hitNormal) {
    const movement = new Vector3(dx, 0, dz);
    const dot = movement.dot(hitNormal);

    if (dot < 0) {
      // Remove the component of movement that goes *into* the wall
      const slide = movement.clone().sub(hitNormal.clone().multiplyScalar(dot));
      const slideDist = slide.length();

      if (slideDist > 0.001) {
        const slideDir = slide.clone().normalize();
        let slideBlocked = false;

        for (const h of heights) {
          _origin.set(from.x, from.y + h, from.z);
          const slideHit = raycastRoom(_origin, slideDir, slideDist + radius);
          if (slideHit && slideHit.distance < slideDist + radius) {
            slideBlocked = true;
            break;
          }
        }

        if (!slideBlocked) {
          return new Vector3(from.x + slide.x, to.y, from.z + slide.z);
        }
      }
    }
  }

  // Fully blocked — stay at current XZ, keep intended Y
  return new Vector3(from.x, to.y, from.z);
}

// ── 3D Device collision ────────────────────────────────────────────────────

// Six principal directions for device collision probing
const _probeDirections: Vector3[] = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
];

/**
 * Constrain a device / furniture that has been moved (e.g. via grab).
 *
 * Works in **world space**:
 *  1. Casts a ray from `from` → `to`. If anything is in the way,
 *     the device is placed at the hit point minus `radius` along the ray.
 *  2. At the (possibly adjusted) `to`, probes outward in 6 directions.
 *     If the device centre is inside geometry (ray exits very close),
 *     it is pushed back out along that axis.
 *
 * @returns The constrained world-space position
 */
export function constrainDeviceMovement(
  from: Vector3,
  to: Vector3,
  radius: number = DEVICE_RADIUS,
): Vector3 {
  if (_collisionMeshes.length === 0) return to.clone();

  const result = to.clone();

  // ── Step 1: Ray from old position to new position ──────────────────────
  const moveDir = new Vector3().subVectors(to, from);
  const moveDist = moveDir.length();

  if (moveDist > 0.001) {
    moveDir.normalize();
    const hit = raycastRoom(from, moveDir, moveDist + radius);
    if (hit && hit.distance < moveDist + radius) {
      // Place device right before the hit, with offset
      const safeDistance = Math.max(0, hit.distance - radius - DEVICE_PUSH_BACK);
      result.copy(from).addScaledVector(moveDir, safeDistance);
    }
  }

  // ── Step 2: Probe outward from result to push out of geometry ──────────
  for (const dir of _probeDirections) {
    // Cast ray from inside the device outward
    _origin.copy(result);
    const hit = raycastRoom(_origin, dir, radius);
    if (hit && hit.distance < radius) {
      // Device centre is closer than `radius` to a surface in this direction
      // Push it back along the opposite direction
      const pushDist = radius - hit.distance + DEVICE_PUSH_BACK;
      result.addScaledVector(dir, -pushDist);
    }
  }

  return result;
}
