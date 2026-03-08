// @ts-ignore
import { NavMesh, Polygon, Vector3 as YukaVector3 } from "yuka";
import { Box3, Vector3, Object3D } from "three";

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

export function initializeNavMesh(roomModel: any, padding: number = 0.5): NavMesh {
  const bbox = new Box3().setFromObject(roomModel);
  const min = bbox.min;
  const max = bbox.max;

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
): void {
  _roomPosX = posX;
  _roomPosY = posY;
  _roomPosZ = posZ;
  _roomRotY = rotationY;
  console.log(
    `🗺️ [NavMesh] Room transform updated: pos=(${posX.toFixed(2)}, ${posY.toFixed(2)}, ${posZ.toFixed(2)}) rotY=${((rotationY * 180) / Math.PI).toFixed(1)}°`,
  );
}

/** Convert a room-local XZ position to world XZ. */
export function roomLocalToWorld(lx: number, lz: number): [number, number] {
  const cos = Math.cos(_roomRotY);
  const sin = Math.sin(_roomRotY);
  return [
    _roomPosX + lx * cos - lz * sin,
    _roomPosZ + lx * sin + lz * cos,
  ];
}

/** Convert a world XZ position to room-local XZ. */
export function worldToRoomLocal(wx: number, wz: number): [number, number] {
  const dx = wx - _roomPosX;
  const dz = wz - _roomPosZ;
  const cos = Math.cos(-_roomRotY);
  const sin = Math.sin(-_roomRotY);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
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
  return (roomBounds?.floorY ?? 0) + _roomPosY;
}
