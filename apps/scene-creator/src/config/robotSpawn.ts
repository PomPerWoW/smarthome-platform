import { Vector3 } from "three";
import { getRoomBounds } from "./navmesh";

/**
 * World-space position where the assistant robot is spawned.
 * Dashboard placement (devices / furniture) uses the same anchor, converted to room-local.
 */
export function getRobotInitialSpawnWorldPosition(
  target = new Vector3(),
): Vector3 {
  const bounds = getRoomBounds();
  const floorY = bounds ? bounds.floorY : 0;
  return target.set(-2.8, floorY, 0.5);
}
