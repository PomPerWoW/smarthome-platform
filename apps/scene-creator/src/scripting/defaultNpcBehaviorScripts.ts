/**
 * Built-in NPC loops when no room script is uploaded (or API has no row for that avatar).
 * Spawn offsets [x, z] must match `createNPCAvatar` position `[x, y, z]` in index.ts (room-center-relative).
 */

import type { AvatarBehaviorAction } from "./avatarBehaviorScript";
import { getRoomBounds } from "../config/navmesh";

export const DEFAULT_NPC_IDS = ["npc1", "npc3"] as const;

/** Room-local XZ offsets added to room floor center — keep in sync with index.ts NPC spawns. */
const NPC_SPAWN_OFFSET_XZ: Record<string, [number, number]> = {
  npc1: [3.0, -3.0],

  npc3: [-3.0, 2.0],
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

  return [
    { type: "walk", distance: 1.35 },
    { type: "idle", duration: 2 },
    { type: "wave" },
    { type: "sit", duration: 4 },
    { type: "idle", duration: 2 },
  ];
}
