import { createSystem, AssetManager } from "@iwsdk/core";
import { DeviceType } from "../types";
import { getStore } from "../store/DeviceStore";
import { Vector3 } from "three";

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

  private async spawnDevice(type: DeviceType) {
    const camera = this.world.camera;
    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();

    const spawnPos = new Vector3()
      .copy(camera.position)
      .addScaledVector(forward, 2.0);

    const labModel = (globalThis as any).__labRoomModel;
    if (labModel) {
      labModel.worldToLocal(spawnPos);
    }

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
        spawnPos.y = 0.0; // Floor standing
        break;
      case DeviceType.Chair:
      case DeviceType.Chair2:
      case DeviceType.Chair3:
      case DeviceType.Chair4:
      case DeviceType.Chair5:
      case DeviceType.Chair6:
        spawnPos.y = 0.0; // Floor
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
      await store.createDevice(
        type,
        name,
        [spawnPos.x, spawnPos.y, spawnPos.z],
        0, // Default rotation — user can grab & rotate
      );
      console.log(`[DevicePlacement] ✅ "${name}" saved to backend`);
    } catch (err) {
      console.error(`[DevicePlacement] ❌ Failed to create "${name}":`, err);
    }
  }
}
