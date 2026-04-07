/**
 * Mesh-based collision detection using the room model's geometry.
 *
 * Strategy:
 *   - Collects Mesh children from the visible room model for horizontal rays.
 *   - Optional separate floor-walk subtree (cutout mesh) for downward floor tests only.
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
import {
  Box3,
  Group,
  Mesh,
  Object3D,
  Raycaster,
  Vector3,
  Intersection,
} from "three";
import { AVATAR_VISUAL_SCALE } from "./avatarScale";

// ── Private state ──────────────────────────────────────────────────────────

/** Reference to the original Three.js Mesh.raycast before we overrode it. */
const _originalRaycast = Mesh.prototype.raycast;

/** Room root used for desk-zone recomputation; includes hidden floor-walk child. */
let _roomModel: Object3D | null = null;

/** Meshes for horizontal collision and device snapping (excludes floor-walk subtree). */
let _collisionMeshes: Mesh[] = [];
/** Meshes for downward `hasFloorBelow` only (cutout floor or full room fallback). */
let _floorWalkMeshes: Mesh[] = [];

/** Name of the invisible floor-walk GLB root parented under the room (see index.ts). */
export const FLOOR_WALK_COLLISION_ROOT_NAME = "__floorWalkCollision";

/**
 * Wraps loaded GLTF content under the room root so AR mode can hide walls/furniture
 * without moving device roots (siblings of this group).
 */
export const ROOM_INTERIOR_VISUAL_NAME = "__roomInteriorVisual";

export function wrapRoomInteriorVisual(
  roomModel: Object3D,
  floorWalkRoot: Object3D | null,
): void {
  if (roomModel.getObjectByName(ROOM_INTERIOR_VISUAL_NAME)) {
    return;
  }
  const roomInterior = new Group();
  roomInterior.name = ROOM_INTERIOR_VISUAL_NAME;
  const snapshot = [...roomModel.children];
  for (const child of snapshot) {
    if (floorWalkRoot && child === floorWalkRoot) continue;
    roomInterior.add(child);
  }
  roomModel.add(roomInterior);
}

function restoreMaterialARBackup(m: any): void {
  if (!m.userData.__arFloorBackup) return;
  const b = m.userData.__arFloorBackup;
  m.opacity = b.opacity;
  m.transparent = b.transparent;
  m.depthWrite = b.depthWrite;
  delete m.userData.__arFloorBackup;
  m.needsUpdate = true;
}

function applyFloorWalkARMaterial(floorWalkRoot: Object3D, ar: boolean): void {
  floorWalkRoot.traverse((child: any) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const m of mats) {
      if (!ar) {
        restoreMaterialARBackup(m);
        continue;
      }
      if (!child.visible) {
        restoreMaterialARBackup(m);
        continue;
      }
      if (!m.userData.__arFloorBackup) {
        m.userData.__arFloorBackup = {
          opacity: m.opacity,
          transparent: m.transparent,
          depthWrite: m.depthWrite,
        };
      }
      m.transparent = true;
      m.opacity = 0.5;
      m.depthWrite = false;
      m.needsUpdate = true;
    }
  });
}

function meshNameExcludedFromPrimaryFloor(name: string): boolean {
  const s = name.toLowerCase();
  return (
    s.includes("wall") ||
    s.includes("ceiling") ||
    s.includes("outline") ||
    s.includes("edge") ||
    s.includes("helper") ||
    s.includes("debug") ||
    s.includes("bbox") ||
    s.includes("grid") ||
    s.includes("wire") ||
    s.includes("gizmo")
  );
}

function pickPrimaryFloorMesh(meshes: Mesh[]): Mesh {
  if (meshes.length === 1) return meshes[0];

  const notExcluded = meshes.filter((m) => !meshNameExcludedFromPrimaryFloor(m.name || ""));
  const candidates = notExcluded.length > 0 ? notExcluded : meshes;

  const hinted = candidates.filter((m) => {
    const s = (m.name || "").toLowerCase();
    return (
      s.includes("floor") ||
      s.includes("ground") ||
      s.includes("plane") ||
      s.includes("walk") ||
      s.includes("nav") ||
      s.includes("groundplane")
    );
  });
  if (hinted.length === 1) return hinted[0];

  const pool = hinted.length > 0 ? hinted : candidates;

  const box = new Box3();
  let best = pool[0];
  let bestScore = -Infinity;
  for (const m of pool) {
    m.updateMatrixWorld(true);
    box.setFromObject(m);
    const dx = box.max.x - box.min.x;
    const dz = box.max.z - box.min.z;
    const dy = box.max.y - box.min.y;
    const area = dx * dz;
    const thinBoost = dy < 0.35 ? 1.0 : 0.35 / (0.35 + dy);
    const score = area * thinBoost;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Hide line/point decorations in the floor-walk asset (often show as faded edges in AR). */
function setFloorWalkNonMeshDecorVisibility(floorWalkRoot: Object3D, ar: boolean): void {
  floorWalkRoot.traverse((child: any) => {
    const t = child.type as string;
    if (
      t !== "Line" &&
      t !== "LineSegments" &&
      t !== "LineLoop" &&
      t !== "Points"
    ) {
      return;
    }
    if (ar) {
      if (child.userData.__arFloorDecorVis === undefined) {
        child.userData.__arFloorDecorVis = child.visible;
      }
      child.visible = false;
    } else {
      if (child.userData.__arFloorDecorVis !== undefined) {
        child.visible = child.userData.__arFloorDecorVis;
        delete child.userData.__arFloorDecorVis;
      }
    }
  });
}

/** Show exactly one floor slab mesh; hide other meshes in the cutout GLB (walls, overlays, etc.). */
function setFloorWalkMeshPickVisibility(floorWalkRoot: Object3D, ar: boolean): void {
  const meshes: Mesh[] = [];
  floorWalkRoot.traverse((child: any) => {
    if (child.isMesh) meshes.push(child);
  });
  if (meshes.length === 0) return;
  if (!ar) {
    for (const m of meshes) {
      m.visible = true;
    }
    return;
  }
  const primary = pickPrimaryFloorMesh(meshes);
  for (const m of meshes) {
    m.visible = m === primary;
  }
}

function setFloorWalkARContentVisibility(floorWalkRoot: Object3D, ar: boolean): void {
  setFloorWalkNonMeshDecorVisibility(floorWalkRoot, ar);
  setFloorWalkMeshPickVisibility(floorWalkRoot, ar);
}

/** Hide devices (and any other siblings) parented under the room root so AR shows only the floor guide. */
function setRoomRootSiblingsARVisibility(
  roomModel: Object3D,
  interior: Object3D,
  floorWalk: Object3D | null,
  ar: boolean,
): void {
  for (const child of roomModel.children) {
    if (child === interior) continue;
    if (floorWalk && child === floorWalk) continue;
    child.visible = !ar;
  }
}

/**
 * AR: hide room interior and devices; under the cutout floor asset, show a single floor
 * mesh (largest thin slab / name hints) and hide lines/outlines. VR: restore defaults.
 */
export function setRoomARVisualMode(roomModel: Object3D | null, ar: boolean): void {
  if (!roomModel) return;
  const interior = roomModel.getObjectByName(
    ROOM_INTERIOR_VISUAL_NAME,
  ) as Object3D | null;
  const floorWalk = roomModel.getObjectByName(
    FLOOR_WALK_COLLISION_ROOT_NAME,
  ) as Object3D | null;

  if (interior) {
    roomModel.visible = true;
    interior.visible = !ar;
    if (floorWalk) {
      floorWalk.visible = ar;
      if (ar) {
        setFloorWalkARContentVisibility(floorWalk, true);
        applyFloorWalkARMaterial(floorWalk, true);
      } else {
        applyFloorWalkARMaterial(floorWalk, false);
        setFloorWalkARContentVisibility(floorWalk, false);
      }
    }
    setRoomRootSiblingsARVisibility(roomModel, interior, floorWalk, ar);
  } else {
    roomModel.visible = !ar;
  }
}

function isUnderFloorWalkCollision(node: Object3D): boolean {
  let p: Object3D | null = node.parent;
  while (p) {
    if (p.name === FLOOR_WALK_COLLISION_ROOT_NAME) return true;
    p = p.parent;
  }
  return false;
}

const _raycaster = new Raycaster();
const _origin = new Vector3();
const _dir = new Vector3();

// ── Table-top collision zones ──────────────────────────────────────────────

/**
 * Axis-aligned bounding box (XZ footprint) of a table top surface.
 * Used to block entities from walking through desks/tables whose
 * horizontal surfaces are invisible to horizontal raycasts.
 */
interface TableTopZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** World-space Y of the table top surface. */
  tableY: number;
}

let _tableTopZones: TableTopZone[] = [];

/** Extra margin (metres) around each table zone to prevent clipping. */
const TABLE_ZONE_MARGIN = 0.05;

/** Base navigation buffer around desks (extra per-caller margin is still applied). */
const TABLE_KEEP_OUT_MARGIN = 0;
/** Approximate table-top slab thickness (metres) used for vertical overlap checks. */
const TABLE_TOP_COLLISION_THICKNESS = 0.12;

// ── Preset height arrays for different entity types ────────────────────────

/** Robot assistant (scaled 0.2, ~30 cm tall): check near the ground. */
/** Increased height checks to catch thin table side faces at various heights */
export const ROBOT_HEIGHTS = [0.02, 0.05, 0.08, 0.12, 0.15, 0.18, 0.22, 0.25, 0.28];
/** Robot collision radius (metres). */
export const ROBOT_RADIUS = 0.15;

/** Human-sized avatars at AVATAR_VISUAL_SCALE; heights scaled from former 0.5 baseline × (scale/0.5). */
const _avatarScaleFactor = AVATAR_VISUAL_SCALE / 0.5;
export const AVATAR_HEIGHTS = [0.1, 0.4, 0.7].map((h) => h * _avatarScaleFactor);
/** Avatar collision radius (metres). */
export const AVATAR_RADIUS = 0.25 * _avatarScaleFactor;

/** Smart devices / furniture: single check at object centre. */
export const DEVICE_RADIUS = 0.08;
/** How far (metres) to push a device back from a surface on collision. */
const DEVICE_PUSH_BACK = 0.02;

// ── Initialization ─────────────────────────────────────────────────────────

/** Returns the top-level desk/table/drawer ancestor of a node, or null. */
function getFurnitureRoot(node: Object3D, roomModel: Object3D): Object3D | null {
  let result: Object3D | null = null;
  let current: Object3D | null = node;
  while (current && current !== roomModel.parent) {
    const nName = (current.name || "").toLowerCase();
    if (/desk|table|drawer/i.test(nName)) {
      result = current; // keep walking up so we get the highest matching ancestor
    }
    current = current.parent;
  }
  return result;
}

/**
 * Collect all top-level desk/table groups in the room model and return one
 * merged world-space AABB per group (i.e. one box per whole desk, not per mesh).
 */
function buildMergedDeskBoxes(roomModel: Object3D): Box3[] {
  // Map from Object3D (desk root) → merged Box3
  const deskBoxMap = new Map<Object3D, Box3>();
  const meshBox = new Box3();

  roomModel.traverse((child: any) => {
    if (!child.isMesh || !child.geometry) return;
    if (isUnderFloorWalkCollision(child as Object3D)) return;
    const root = getFurnitureRoot(child as Object3D, roomModel);
    if (!root) return;

    if (!deskBoxMap.has(root)) {
      deskBoxMap.set(root, new Box3());
    }
    child.geometry.computeBoundingBox();
    meshBox.setFromObject(child as Object3D);
    deskBoxMap.get(root)!.union(meshBox);
  });

  return Array.from(deskBoxMap.values());
}

/**
 * Initialize collision from the visible room and optional cutout floor for walk tests.
 * @param roomModel       LabPlan (or full room) root; may include a child named {@link FLOOR_WALK_COLLISION_ROOT_NAME}
 * @param floorWalkModel  If set, only these meshes are used for downward floor checks; omitted → use all room meshes for both.
 */
export function initializeCollision(
  roomModel: Object3D,
  floorWalkModel?: Object3D | null,
): void {
  _collisionMeshes = [];
  _floorWalkMeshes = [];
  _roomModel = roomModel;

  roomModel.traverse((child: any) => {
    if (!child.isMesh || !child.geometry) return;
    if (isUnderFloorWalkCollision(child as Object3D)) return;
    _collisionMeshes.push(child as Mesh);
  });

  if (floorWalkModel) {
    floorWalkModel.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        _floorWalkMeshes.push(child as Mesh);
      }
    });
  }

  if (_floorWalkMeshes.length === 0) {
    _floorWalkMeshes = _collisionMeshes.slice();
  }

  // Ensure world matrices are current for raycasting
  roomModel.updateMatrixWorld(true);

  // ── Build table-top collision zones ────────────────────────────────────
  // Merge ALL mesh components of each desk/table group into ONE unified
  // world-space AABB per desk so the robot treats the full rectangular
  // footprint as a solid block (including open underdesk air space).
  _tableTopZones = [];

  const mergedDeskBoxes = buildMergedDeskBoxes(roomModel);
  for (const box of mergedDeskBoxes) {
    _tableTopZones.push({
      minX: box.min.x - TABLE_ZONE_MARGIN,
      maxX: box.max.x + TABLE_ZONE_MARGIN,
      minZ: box.min.z - TABLE_ZONE_MARGIN,
      maxZ: box.max.z + TABLE_ZONE_MARGIN,
      tableY: box.max.y, // block entities shorter than the top of this desk
    });
  }

}

/**
 * Force-update collision mesh world matrices.
 * Call whenever the room model's transform changes (room alignment, manual panel).
 */
/**
 * Meshes used for horizontal room collision (same set as movement sliding).
 * Panel placement uses this instead of traversing the room every frame.
 */
export function getRoomCollisionMeshes(): Mesh[] {
  return _collisionMeshes;
}

export function updateCollisionTransform(): void {
  if (_roomModel) {
    _roomModel.updateMatrixWorld(true);

    // Recompute table-top zones because they are stored in world space
    // and the room model may have moved (room alignment, manual panel, etc.)
    _tableTopZones = [];
    const mergedBoxes = buildMergedDeskBoxes(_roomModel);
    for (const box of mergedBoxes) {
      _tableTopZones.push({
        minX: box.min.x - TABLE_ZONE_MARGIN,
        maxX: box.max.x + TABLE_ZONE_MARGIN,
        minZ: box.min.z - TABLE_ZONE_MARGIN,
        maxZ: box.max.z + TABLE_ZONE_MARGIN,
        tableY: box.max.y,
      });
    }
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

function raycastAgainstMeshes(
  meshes: Mesh[],
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
): Intersection | null {
  if (meshes.length === 0) return null;
  _raycaster.set(origin, direction);
  _raycaster.far = maxDistance;
  _raycaster.near = 0;

  const hits: Intersection[] = [];
  for (const mesh of meshes) {
    _originalRaycast.call(mesh, _raycaster, hits);
  }

  if (hits.length === 0) return null;
  hits.sort((a, b) => a.distance - b.distance);
  return hits[0];
}

/**
 * Cast a single ray against horizontal collision meshes using the **original**
 * `Mesh.prototype.raycast` (bypasses the instance-level no-op override).
 */
function raycastRoom(
  origin: Vector3,
  direction: Vector3,
  maxDistance: number,
): Intersection | null {
  return raycastAgainstMeshes(_collisionMeshes, origin, direction, maxDistance);
}

const _downDir = new Vector3(0, -1, 0);

/**
 * Checks if there is a floor mesh beneath the given position.
 * Casts a ray downwards from a point slightly above the highest given height.
 */
function hasFloorBelow(pos: Vector3, baseY: number, maxH: number): boolean {
  if (_floorWalkMeshes.length === 0) return true;
  _origin.set(pos.x, baseY + maxH, pos.z);
  // Look for a hit within maxH + 0.5 (allowing a slight downward slope/step)
  const hit = raycastAgainstMeshes(
    _floorWalkMeshes,
    _origin,
    _downDir,
    maxH + 0.5,
  );
  
  if (hit && hit.face && hit.face.normal) {
      const normalWorld = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      // Ensure the hit surface is roughly pointing upwards (like a floor)
      if (normalWorld.y > 0.5) return true;
  } else if (hit) {
      // If no normal information, a hit is still better than nothing
      return true;
  }
  return false;
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
  if (_collisionMeshes.length === 0 && _tableTopZones.length === 0)
    return to.clone();

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

  // ── 0) Table-top zone check ─────────────────────────────────────────────
  // If the entity is short enough to be under a table top, check whether
  // the destination XZ falls inside any table-top footprint. If so, treat the
  // AABB as a solid wall and compute a surface normal for wall-sliding.
  if (_tableTopZones.length > 0) {
    const entityBottomY = from.y + heights[0];
    const entityTopY = from.y + heights[heights.length - 1];

    for (const zone of _tableTopZones) {
      // Only block with desk zones when the entity's vertical span intersects
      // the actual tabletop slab. This prevents "invisible box in air" behavior
      // where short actors are blocked under open desk space.
      const tableBottomY = zone.tableY - TABLE_TOP_COLLISION_THICKNESS;
      const intersectsTableTopSlab =
        entityTopY >= tableBottomY && entityBottomY <= zone.tableY;
      if (!intersectsTableTopSlab) continue;

      // Check if the destination point (expanded by entity radius) overlaps this table zone
      const inZoneX = to.x + radius > zone.minX && to.x - radius < zone.maxX;
      const inZoneZ = to.z + radius > zone.minZ && to.z - radius < zone.maxZ;

      if (inZoneX && inZoneZ) {
        // Also check that we are walking INTO the zone (not already safely inside it)
        const fromInX = from.x + radius > zone.minX && from.x - radius < zone.maxX;
        const fromInZ = from.z + radius > zone.minZ && from.z - radius < zone.maxZ;

        if (!(fromInX && fromInZ)) {
          blocked = true;

          // Compute the AABB normal to allow wall-sliding instead of stopping dead
          // We find which edge of the extended AABB the `from` position is closest to
          const distToMinX = Math.abs(from.x - (zone.minX - radius));
          const distToMaxX = Math.abs(from.x - (zone.maxX + radius));
          const distToMinZ = Math.abs(from.z - (zone.minZ - radius));
          const distToMaxZ = Math.abs(from.z - (zone.maxZ + radius));

          const minDist = Math.min(distToMinX, distToMaxX, distToMinZ, distToMaxZ);

          if (minDist === distToMinX) {
            hitNormal = new Vector3(-1, 0, 0); // Hit left side
          } else if (minDist === distToMaxX) {
            hitNormal = new Vector3(1, 0, 0);  // Hit right side
          } else if (minDist === distToMinZ) {
            hitNormal = new Vector3(0, 0, -1); // Hit front side
          } else {
            hitNormal = new Vector3(0, 0, 1);  // Hit back side
          }
          break; // Found our blocking zone, exit loop
        }
      }
    }
  }

  // If the AABB desk check already blocked us, we skip the raycasts
  // otherwise we proceed with checking the actual mesh geometry
  if (!blocked) {
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
} // End of if (!blocked) block for general raycasting

  const maxH = heights[heights.length - 1];

  if (!blocked) {
    const result = to.clone();
    if (hasFloorBelow(result, from.y, maxH)) {
      return result;
    }
    // No floor found at destination! Stay at current XZ (blocked by void)
    return new Vector3(from.x, to.y, from.z);
  }

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
          const slideResult = new Vector3(from.x + slide.x, to.y, from.z + slide.z);
          if (hasFloorBelow(slideResult, from.y, maxH)) {
            return slideResult;
          }
        }
      }
    }
  }

  // Fully blocked — stay at current XZ, keep intended Y
  return new Vector3(from.x, to.y, from.z);
}

/**
 * Check whether a world-space XZ lies in an expanded desk/table keep-out zone.
 */
export function isInTableKeepOutZone(
  x: number,
  z: number,
  extraMargin = 0,
): boolean {
  if (_tableTopZones.length === 0) return false;
  const margin = TABLE_KEEP_OUT_MARGIN + Math.max(0, extraMargin);
  for (const zone of _tableTopZones) {
    if (
      x >= zone.minX - margin &&
      x <= zone.maxX + margin &&
      z >= zone.minZ - margin &&
      z <= zone.maxZ + margin
    ) {
      return true;
    }
  }
  return false;
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
