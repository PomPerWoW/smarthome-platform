/**
 * Built-in NPC loops when no room script is uploaded (or API has no row for that avatar).
 * Spawn offsets [x, z] must match `createNPCAvatar` position `[x, y, z]` in index.ts (room-center-relative).
 */

import type { AvatarBehaviorAction } from "./avatarBehaviorScript";
import { getRoomBounds } from "../config/navmesh";

export const DEFAULT_NPC_IDS = ["npc1", "npc2", "npc3"] as const;

/** Room-local XZ offsets added to room floor center — keep in sync with index.ts NPC spawns. */
const NPC_SPAWN_OFFSET_XZ: Record<string, [number, number]> = {
  npc1: [3.0, -3.0],
  npc2: [4.0, 4.5],
  npc3: [-3.5, 2.5],
};

function clampToBounds(
  x: number,
  z: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): [number, number] {
  return [
    Math.max(minX, Math.min(maxX, x)),
    Math.max(minZ, Math.min(maxZ, z)),
  ];
}

/**
 * Returns a short patrol + emote loop in room-local coordinates, or null if npcId is unknown.
 */
export function buildDefaultNpcBehaviorScript(npcId: string): AvatarBehaviorAction[] | null {
  const off = NPC_SPAWN_OFFSET_XZ[npcId];
  if (!off) return null;

  const bounds = getRoomBounds();
  let minX: number;
  let maxX: number;
  let minZ: number;
  let maxZ: number;
  let sx: number;
  let sz: number;

  if (bounds) {
    minX = bounds.minX;
    maxX = bounds.maxX;
    minZ = bounds.minZ;
    maxZ = bounds.maxZ;
    const cx = (bounds.minX + bounds.maxX) * 0.5;
    const cz = (bounds.minZ + bounds.maxZ) * 0.5;
    sx = cx + off[0];
    sz = cz + off[1];
  } else {
    const pad = 2.5;
    minX = -pad;
    maxX = pad;
    minZ = -pad;
    maxZ = pad;
    sx = off[0];
    sz = off[1];
  }

  const home = clampToBounds(sx, sz, minX, maxX, minZ, maxZ);
  const step = 0.85;
  let t1 = clampToBounds(sx + step * 0.85, sz + step * 0.45, minX, maxX, minZ, maxZ);
  if (Math.hypot(t1[0] - home[0], t1[1] - home[1]) < 0.2) {
    t1 = clampToBounds(sx - step * 0.75, sz + step * 0.55, minX, maxX, minZ, maxZ);
  }

  return [
    { type: "walk", target: t1, speed: 0.35 },
    { type: "walk", target: home, speed: 0.35 },
    { type: "idle", duration: 2 },
    { type: "wave" },
    { type: "sit", duration: 4 },
    { type: "idle", duration: 2 },
  ];
}
