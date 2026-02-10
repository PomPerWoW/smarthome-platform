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
