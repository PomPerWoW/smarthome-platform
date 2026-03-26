// @ts-ignore
import { NavMesh, Polygon, Vector3 as YukaVector3 } from "yuka";
import { Box3, Vector3, Object3D, Matrix4 } from "three";

interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  floorY: number;
}

let roomBounds: RoomBounds | null = null;
let navMesh: NavMesh | null = null;

// ── Room transform (updated after room alignment) ──────────────────────────
// roomBounds is always in room-local space. These transform helpers convert
// between room-local ↔ world space so callers like user avatars (which work
// in world space) can clamp / query correctly after alignment.
let _roomPosX = 0;
let _roomPosY = 0;
let _roomPosZ = 0;
let _roomRotY = 0;
let _roomScale = 1;

export function initializeNavMesh(roomModel: any, padding: number = 0.5): NavMesh {
  roomModel.updateMatrixWorld(true);

  // Build bounds in room-local space so world transform offsets/rotations
  // do not double-apply when converting between local/world coordinates.
  // Use per-mesh geometry bounds (not global AABB corners) for better accuracy.
  const inverseWorld = new Matrix4().copy(roomModel.matrixWorld).invert();
  const localBox = new Box3().makeEmpty();
  const meshWorldBox = new Box3();
  roomModel.traverse((child: any) => {
    if (!child?.isMesh || !child.geometry) return;
    if (!child.geometry.boundingBox) {
      child.geometry.computeBoundingBox();
    }
    meshWorldBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
    meshWorldBox.applyMatrix4(inverseWorld);
    localBox.union(meshWorldBox);
  });

  if (localBox.isEmpty()) {
    // Fallback for unusual models that don't expose mesh geometry bounds.
    localBox.setFromObject(roomModel).applyMatrix4(inverseWorld);
  }

  const min = localBox.min;
  const max = localBox.max;

  roomBounds = {
    minX: min.x + padding,
    maxX: max.x - padding,
    minZ: min.z + padding,
    maxZ: max.z - padding,
    floorY: min.y,
  };

  console.log(`🗺️ [NavMesh] Calculated room bounds:`, {
    minX: roomBounds.minX.toFixed(2),
    maxX: roomBounds.maxX.toFixed(2),
    minZ: roomBounds.minZ.toFixed(2),
    maxZ: roomBounds.maxZ.toFixed(2),
    floorY: roomBounds.floorY.toFixed(2),
  });

  const width = roomBounds.maxX - roomBounds.minX;
  const depth = roomBounds.maxZ - roomBounds.minZ;
  console.log(`🗺️ [NavMesh] Room size: ${width.toFixed(2)}m x ${depth.toFixed(2)}m`);

  navMesh = new NavMesh();

  const vertices = [
    new YukaVector3(roomBounds.minX, roomBounds.floorY, roomBounds.minZ),
    new YukaVector3(roomBounds.maxX, roomBounds.floorY, roomBounds.minZ),
    new YukaVector3(roomBounds.maxX, roomBounds.floorY, roomBounds.maxZ),
    new YukaVector3(roomBounds.minX, roomBounds.floorY, roomBounds.maxZ),
  ];

  const polygon = new Polygon().fromContour(vertices);

  navMesh.regions.push(polygon);

  console.log(`🗺️ [NavMesh] Created NavMesh with walkable area:`);
  console.log(`   X: ${roomBounds.minX.toFixed(2)} to ${roomBounds.maxX.toFixed(2)}`);
  console.log(`   Z: ${roomBounds.minZ.toFixed(2)} to ${roomBounds.maxZ.toFixed(2)}`);
  console.log(`   Floor Y: ${roomBounds.floorY.toFixed(2)}`);

  return navMesh;
}

export function getRoomBounds(): RoomBounds | null {
  return roomBounds;
}

export function getNavMesh(): NavMesh | null {
  return navMesh;
}

export function clampToWalkableArea(x: number, z: number): [number, number] {
  if (!roomBounds) {
    const defaultRange = 3;
    return [
      Math.max(-defaultRange, Math.min(defaultRange, x)),
      Math.max(-defaultRange, Math.min(defaultRange, z)),
    ];
  }

  return [
    Math.max(roomBounds.minX, Math.min(roomBounds.maxX, x)),
    Math.max(roomBounds.minZ, Math.min(roomBounds.maxZ, z)),
  ];
}

export function isPositionWalkable(x: number, z: number): boolean {
  if (!roomBounds) {
    return true;
  }

  return (
    x >= roomBounds.minX &&
    x <= roomBounds.maxX &&
    z >= roomBounds.minZ &&
    z <= roomBounds.maxZ
  );
}

export function getRandomWalkablePosition(): [number, number] {
  if (!roomBounds) {
    const range = 3;
    return [
      (Math.random() - 0.5) * 2 * range,
      (Math.random() - 0.5) * 2 * range,
    ];
  }

  const x = roomBounds.minX + Math.random() * (roomBounds.maxX - roomBounds.minX);
  const z = roomBounds.minZ + Math.random() * (roomBounds.maxZ - roomBounds.minZ);

  return [x, z];
}

export function setRoomBounds(bounds: RoomBounds): void {
  roomBounds = bounds;
  console.log(`🗺️ [NavMesh] Custom room bounds set:`, bounds);
}

// ============================================================================
// Room transform — call after room alignment to keep navmesh in sync
// ============================================================================

/**
 * Notify the navmesh module of the room model's world transform.
 * Must be called whenever the room model is repositioned / rotated
 * (e.g. after RoomAlignmentSystem finishes).
 */
export function setRoomTransform(
  posX: number,
  posY: number,
  posZ: number,
  rotationY: number,
  scale = 1,
): void {
  _roomPosX = posX;
  _roomPosY = posY;
  _roomPosZ = posZ;
  _roomRotY = rotationY;
  _roomScale = Math.abs(scale) > 1e-6 ? scale : 1;
  console.log(
    `🗺️ [NavMesh] Room transform updated: pos=(${posX.toFixed(2)}, ${posY.toFixed(2)}, ${posZ.toFixed(2)}) rotY=${((rotationY * 180) / Math.PI).toFixed(1)}° scale=${_roomScale.toFixed(3)}`,
  );
}

/** Convert a room-local XZ position to world XZ. */
export function roomLocalToWorld(lx: number, lz: number): [number, number] {
  const cos = Math.cos(_roomRotY);
  const sin = Math.sin(_roomRotY);
  const sx = lx * _roomScale;
  const sz = lz * _roomScale;
  return [
    _roomPosX + sx * cos - sz * sin,
    _roomPosZ + sx * sin + sz * cos,
  ];
}

/** Convert a world XZ position to room-local XZ. */
export function worldToRoomLocal(wx: number, wz: number): [number, number] {
  const dx = wx - _roomPosX;
  const dz = wz - _roomPosZ;
  const cos = Math.cos(-_roomRotY);
  const sin = Math.sin(-_roomRotY);
  return [
    (dx * cos - dz * sin) / _roomScale,
    (dx * sin + dz * cos) / _roomScale,
  ];
}

/**
 * Clamp a **world-space** XZ position to the walkable area.
 * Internally converts world → room-local, clamps, then converts back.
 */
export function clampToWalkableAreaWorld(
  wx: number,
  wz: number,
): [number, number] {
  const [lx, lz] = worldToRoomLocal(wx, wz);
  const [cx, cz] = clampToWalkableArea(lx, lz);
  return roomLocalToWorld(cx, cz);
}

/** Get room-local floor Y in world space. */
export function getWorldFloorY(): number {
  return (roomBounds?.floorY ?? 0) * _roomScale + _roomPosY;
}
