/**
 * Room-local wandering helpers shared with robot-style patrol:
 * desk keep-out zones, smart repaths, and safe random targets.
 */
import { getRoomBounds, clampToWalkableArea } from "./navmesh";
import { isInTableKeepOutZone } from "./collision";

export const AGENT_WANDER_KEEP_OUT_EXTRA = 0.1;
export const AGENT_WANDER_REPATH_CANDIDATES = 12;

export type RoomLocalToWorldFn = (
  lx: number,
  ly: number,
  lz: number,
) => { x: number; y: number; z: number };

function isLocalPointInKeepOut(
  localX: number,
  localZ: number,
  roomLocalToWorld: RoomLocalToWorldFn,
  clearanceRadius: number,
): boolean {
  const w = roomLocalToWorld(localX, 0, localZ);
  return isInTableKeepOutZone(
    w.x,
    w.z,
    AGENT_WANDER_KEEP_OUT_EXTRA + clearanceRadius,
  );
}

function doesLocalSegmentCrossKeepOut(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  roomLocalToWorld: RoomLocalToWorldFn,
  clearanceRadius: number,
): boolean {
  const segDx = toX - fromX;
  const segDz = toZ - fromZ;
  const dist = Math.sqrt(segDx * segDx + segDz * segDz);
  if (dist < 1e-4) {
    return isLocalPointInKeepOut(toX, toZ, roomLocalToWorld, clearanceRadius);
  }

  const step = 0.12;
  const steps = Math.max(2, Math.ceil(dist / step));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = fromX + segDx * t;
    const z = fromZ + segDz * t;
    if (isLocalPointInKeepOut(x, z, roomLocalToWorld, clearanceRadius)) {
      return true;
    }
  }
  return false;
}

export function rememberBlockedMoveDirection(
  recentBlockedDirs: { x: number; z: number }[],
  dx: number,
  dz: number,
  maxEntries = 6,
): void {
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.001) return;
  recentBlockedDirs.push({ x: dx / len, z: dz / len });
  while (recentBlockedDirs.length > maxEntries) recentBlockedDirs.shift();
}

/**
 * Pick a nearby waypoint that avoids recently blocked directions (room-local XZ).
 */
export function pickSmartWanderingWaypoint(
  fromX: number,
  fromZ: number,
  roomLocalToWorld: RoomLocalToWorldFn,
  clearanceRadius: number,
  recentBlockedDirs: { x: number; z: number }[],
): { x: number; z: number } {
  const bounds = getRoomBounds();
  let bestX = fromX;
  let bestZ = fromZ;
  let bestScore = -Infinity;

  const distances = [0.6, 1.2, 2.0, 3.0];

  for (let i = 0; i < AGENT_WANDER_REPATH_CANDIDATES; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);

    for (const dist of distances) {
      const candX = fromX + dirX * dist;
      const candZ = fromZ + dirZ * dist;

      let score = 0;

      if (
        isLocalPointInKeepOut(candX, candZ, roomLocalToWorld, clearanceRadius) ||
        doesLocalSegmentCrossKeepOut(
          fromX,
          fromZ,
          candX,
          candZ,
          roomLocalToWorld,
          clearanceRadius,
        )
      ) {
        score -= 200;
      }

      for (const bd of recentBlockedDirs) {
        const dot = dirX * bd.x + dirZ * bd.z;
        score -= Math.max(0, dot) * 8;
      }

      if (bounds) {
        const margin = 0.3;
        const inside =
          candX >= bounds.minX + margin &&
          candX <= bounds.maxX - margin &&
          candZ >= bounds.minZ + margin &&
          candZ <= bounds.maxZ - margin;
        if (!inside) {
          score -= 50;
        }

        const cx = (bounds.minX + bounds.maxX) * 0.5;
        const cz = (bounds.minZ + bounds.maxZ) * 0.5;
        const distToCenter = Math.sqrt((candX - cx) ** 2 + (candZ - cz) ** 2);
        score -= distToCenter * 0.3;
      }

      score += Math.random() * 6;

      if (dist >= 1.0 && dist <= 2.5) score += 2;

      if (score > bestScore) {
        bestScore = score;
        bestX = candX;
        bestZ = candZ;
      }
    }
  }

  if (bounds) {
    bestX = Math.max(bounds.minX + 0.3, Math.min(bounds.maxX - 0.3, bestX));
    bestZ = Math.max(bounds.minZ + 0.3, Math.min(bounds.maxZ - 0.3, bestZ));
  }

  return { x: bestX, z: bestZ };
}

export function resolveSafeWanderTarget(
  fromX: number,
  fromZ: number,
  desiredX: number,
  desiredZ: number,
  roomLocalToWorld: RoomLocalToWorldFn,
  clearanceRadius: number,
  recentBlockedDirs: { x: number; z: number }[],
): { x: number; z: number } {
  let [clampedX, clampedZ] = clampToWalkableArea(desiredX, desiredZ);
  if (
    !isLocalPointInKeepOut(clampedX, clampedZ, roomLocalToWorld, clearanceRadius) &&
    !doesLocalSegmentCrossKeepOut(
      fromX,
      fromZ,
      clampedX,
      clampedZ,
      roomLocalToWorld,
      clearanceRadius,
    )
  ) {
    return { x: clampedX, z: clampedZ };
  }

  const detour = pickSmartWanderingWaypoint(
    fromX,
    fromZ,
    roomLocalToWorld,
    clearanceRadius,
    recentBlockedDirs,
  );
  [clampedX, clampedZ] = clampToWalkableArea(detour.x, detour.z);
  return { x: clampedX, z: clampedZ };
}
