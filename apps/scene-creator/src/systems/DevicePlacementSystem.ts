import { createSystem, AssetManager } from "@iwsdk/core";
import { DeviceType } from "../types";
import { getStore, isFurnitureType } from "../store/DeviceStore";
import { Vector3 } from "three";
import { getRoomBounds, clampToWalkableArea } from "../config/navmesh";

export class DevicePlacementSystem extends createSystem({}) {
  private placementCounter = 0;

  update(_dt: number) {
    const store = getStore();
    const placementMode = store.placementMode;

    if (placementMode) {
      store.setPlacementMode(null);
      this.spawnDevice(placementMode);
    }
  }

  /**
   * Compute a room-local spawn position that is guaranteed to be inside the
   * LabPlan model.
   *
   * Strategy:
   *  1. Project 2 m in front of the camera (world space, horizontal only).
   *  2. Convert that world-space target into room-local space via
   *     `labModel.worldToLocal()`.
   *  3. Clamp XZ to the room-local walkable area (navmesh bounds) with a
   *     small margin so devices never end up inside walls.
   *  4. Override Y with a device-specific height.
   *
   * If the camera projects way outside the room (e.g. viewing from afar) the
   * clamp naturally snaps the position to the closest point inside.
   */
  private async spawnDevice(type: DeviceType) {
    const camera = this.world.camera;
    const labModel = (globalThis as any).__labRoomModel;

    const spawnPos = new Vector3();

    if (labModel) {
      // 1. World-space target: 2 m in front of the camera (flat on XZ plane)
      const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
      forward.normalize();

      const worldTarget = new Vector3()
        .copy(camera.position)
        .addScaledVector(forward, 2.0);

      // 2. Convert to room-local space
      spawnPos.copy(labModel.worldToLocal(worldTarget.clone()));

      // 3. Clamp XZ to room walkable area (room-local bounds)
      const roomBounds = getRoomBounds();
      if (roomBounds) {
        // Apply a small inward margin so devices don't sit exactly on the wall
        const MARGIN = 0.3;
        const minX = roomBounds.minX + MARGIN;
        const maxX = roomBounds.maxX - MARGIN;
        const minZ = roomBounds.minZ + MARGIN;
        const maxZ = roomBounds.maxZ - MARGIN;

        spawnPos.x = Math.max(minX, Math.min(maxX, spawnPos.x));
        spawnPos.z = Math.max(minZ, Math.min(maxZ, spawnPos.z));
      } else {
        // Fallback: use basic clamp
        const [cx, cz] = clampToWalkableArea(spawnPos.x, spawnPos.z);
        spawnPos.x = cx;
        spawnPos.z = cz;
      }
    } else {
      // No labModel — spawn in world space in front of the camera
      const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
      forward.normalize();
      spawnPos.copy(camera.position).addScaledVector(forward, 2.0);
    }

    // 4. Device-specific Y height (room-local space, floor = 0)
    switch (type) {
      case DeviceType.Lightbulb:
        spawnPos.y = 2.5; // Ceiling lamp hangs high
        break;
      case DeviceType.AirConditioner:
        spawnPos.y = 2.2; // Wall-mounted high
        break;
      case DeviceType.Television:
        spawnPos.y = 1.0; // Eye-level on a stand
        break;
      case DeviceType.Fan:
      case DeviceType.Chair:
      case DeviceType.Chair2:
      case DeviceType.Chair3:
      case DeviceType.Chair4:
      case DeviceType.Chair5:
      case DeviceType.Chair6:
        spawnPos.y = 0.0; // Floor standing / furniture
        break;
      default:
        spawnPos.y = 0.0;
    }

    // Generate a unique name
    this.placementCounter++;
    const name = `${type} ${this.placementCounter}`;

    console.log(
      `[DevicePlacement] ✨ Spawning "${name}" at local pos ` +
        `(${spawnPos.x.toFixed(2)}, ${spawnPos.y.toFixed(2)}, ${spawnPos.z.toFixed(2)})`,
    );

    const store = getStore();
    try {
      if (isFurnitureType(type)) {
        await store.createFurniture(
          type,
          name,
          [spawnPos.x, spawnPos.y, spawnPos.z],
          0,
        );
        console.log(`[DevicePlacement] ✅ "${name}" saved as furniture`);
      } else {
        await store.createDevice(
          type,
          name,
          [spawnPos.x, spawnPos.y, spawnPos.z],
          0,
        );
        console.log(`[DevicePlacement] ✅ "${name}" saved to backend`);
      }
    } catch (err) {
      console.error(`[DevicePlacement] ❌ Failed to create "${name}":`, err);
    }
  }
}
