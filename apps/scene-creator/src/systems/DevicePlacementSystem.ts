import { createSystem } from "@iwsdk/core";
import { DeviceType } from "../types";
import { getStore, isFurnitureType } from "../store/DeviceStore";
import { Vector3 } from "three";
import { getRoomBounds } from "../config/navmesh";
import { getRobotInitialSpawnWorldPosition } from "../config/robotSpawn";

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
   * Spawn at the same world-space anchor as the assistant robot, converted to
   * room-local coordinates for the device store (see robotSpawn.ts).
   */
  private async spawnDevice(type: DeviceType) {
    const labModel = (globalThis as any).__labRoomModel;
    const spawnPos = new Vector3();
    const roomBounds = getRoomBounds();
    const worldSpawn = getRobotInitialSpawnWorldPosition(new Vector3());

    if (labModel) {
      spawnPos.copy(labModel.worldToLocal(worldSpawn.clone()));
    } else if (roomBounds) {
      console.warn(
        `[DevicePlacement] No labModel; using room center instead of robot spawn anchor`,
      );
      const centerX = (roomBounds.minX + roomBounds.maxX) * 0.5;
      const centerZ = (roomBounds.minZ + roomBounds.maxZ) * 0.5;
      spawnPos.set(centerX, 0, centerZ);
    } else {
      console.warn(
        `[DevicePlacement] No labModel or roomBounds; using robot spawn world coords as-is`,
      );
      spawnPos.copy(worldSpawn);
    }

    switch (type) {
      case DeviceType.Lightbulb:
        spawnPos.y = 2.5;
        break;
      case DeviceType.AirConditioner:
        spawnPos.y = 2.2;
        break;
      case DeviceType.Television:
        spawnPos.y = 1.0;
        break;
      case DeviceType.Fan:
      case DeviceType.Chair:
      case DeviceType.Chair2:
      case DeviceType.Chair3:
      case DeviceType.Chair4:
      case DeviceType.Chair5:
      case DeviceType.Chair6:
        spawnPos.y = 0.0;
        break;
      default:
        spawnPos.y = 0.0;
    }

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
