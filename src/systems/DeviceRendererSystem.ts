import {
  createSystem,
  Entity,
  Interactable,
  OneHandGrabbable,
  Object3D,
  Mesh,
  MeshStandardMaterial,
  Color,
  Box3,
  Vector3,
  AssetManager,
  DistanceGrabbable,
  MovementMode,
} from "@iwsdk/core";

import { deviceStore, getStore } from "../store/DeviceStore";
import { Device, DeviceType } from "../types";
import { DeviceComponent } from "../components/DeviceComponent";
import { stringifyDeviceProperties, getDeviceProperties } from "../utils";
import { DEVICE_SCALES, DEFAULT_SPAWN_POSITIONS } from "../constants";

const DEVICE_ASSET_KEYS: Record<DeviceType, string> = {
  [DeviceType.Lightbulb]: "lightbulb",
  [DeviceType.Television]: "television",
  [DeviceType.Fan]: "fan",
  [DeviceType.AirConditioner]: "air_conditioner",
};

export class DeviceRendererSystem extends createSystem({
  devices: {
    required: [DeviceComponent],
  },
}) {
  private deviceEntities: Map<string, Entity> = new Map();
  private modelCache: Map<DeviceType, Object3D> = new Map();
  private initialized = false;
  private spawnIndex = 0;
  private unsubscribe?: () => void;

  init() {
    console.log("[DeviceRenderer] System initialized");

    this.unsubscribe = deviceStore.subscribe(
      (state) => state.devices,
      (devices) => {
        if (this.initialized) {
          this.syncDevicesWithScene(devices);
        }
      },
    );
  }

  async initializeDevices(): Promise<void> {
    const devices = getStore().devices;

    if (devices.length === 0) {
      console.log("[DeviceRenderer] No devices to render");
      return;
    }

    console.log(`[DeviceRenderer] Initializing ${devices.length} devices...`);
    console.log("[DeviceRenderer] Using preloaded models from AssetManager");

    for (const device of devices) {
      this.createDeviceEntity(device);
    }

    this.initialized = true;
    console.log(
      `[DeviceRenderer] Initialized ${this.deviceEntities.size} device entities`,
    );
  }

  private getModelFromAssetManager(type: DeviceType): Object3D | null {
    if (this.modelCache.has(type)) {
      return this.modelCache.get(type)!;
    }

    const assetKey = DEVICE_ASSET_KEYS[type];
    console.log(
      `[DeviceRenderer] Getting model from AssetManager: ${assetKey}`,
    );

    try {
      const gltf = AssetManager.getGLTF(assetKey);
      if (!gltf) {
        console.warn(`[DeviceRenderer] Model not yet loaded for ${type}`);
        return null;
      }

      const model = gltf.scene.clone();

      const box = new Box3().setFromObject(model);
      const center = box.getCenter(new Vector3());
      model.position.sub(center);

      this.modelCache.set(type, model);
      console.log(`[DeviceRenderer] Cached model for ${type}`);
      return model;
    } catch (error) {
      console.error(`[DeviceRenderer] Failed to get model for ${type}:`, error);
      return null;
    }
  }

  private createDeviceEntity(device: Device): Entity | null {
    const cachedModel = this.getModelFromAssetManager(device.type);
    if (!cachedModel) {
      console.warn(`[DeviceRenderer] No model available for ${device.type}`);
      return null;
    }

    const model = cachedModel.clone();
    const scale = DEVICE_SCALES[device.type];
    model.scale.setScalar(scale);

    if (device.position && device.position[0] !== null) {
      model.position.set(
        device.position[0],
        device.position[1],
        device.position[2],
      );
    } else {
      const defaultPos = DEFAULT_SPAWN_POSITIONS[device.type];
      const offset = this.spawnIndex * 0.3;
      model.position.set(
        defaultPos[0] + offset,
        defaultPos[1],
        defaultPos[2] - (this.spawnIndex % 3) * 0.2,
      );
      this.spawnIndex++;
    }

    this.world.scene.add(model);

    const entity = this.world.createTransformEntity(model);

    entity.addComponent(DeviceComponent, {
      deviceId: device.id,
      deviceType: device.type,
      isOn: device.is_on,
      properties: stringifyDeviceProperties(getDeviceProperties(device)),
    });

    entity.addComponent(Interactable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });

    this.updateDeviceVisuals(model, device);
    this.deviceEntities.set(device.id, entity);

    console.log(
      `[DeviceRenderer] Created entity for ${device.name} (${device.type})`,
    );
    return entity;
  }

  private updateDeviceVisuals(object3D: Object3D, device: Device): void {
    object3D.traverse((child) => {
      if (child instanceof Mesh) {
        const material = child.material;

        if (material instanceof MeshStandardMaterial) {
          if (!device.is_on) {
            material.emissiveIntensity = 0;
            material.opacity = 0.5;
            material.transparent = true;
          } else {
            material.opacity = 1;
            material.transparent = false;

            // Only apply emissive color to the "bulb" material of lightbulb models
            if (
              device.type === DeviceType.Lightbulb &&
              material.name === "bulb"
            ) {
              const colour = device.colour || "#ffffff";
              const brightness = device.brightness || 0;

              material.emissive = new Color(colour);
              material.emissiveIntensity = (brightness / 100) * 0.5;
            }
          }
        }
      }
    });
  }

  private syncDevicesWithScene(devices: Device[]): void {
    const currentIds = new Set(devices.map((d) => d.id));

    for (const [id, entity] of this.deviceEntities) {
      if (!currentIds.has(id)) {
        console.log(`[DeviceRenderer] Removing deleted device: ${id}`);
        const obj = entity.object3D;
        if (obj?.parent) {
          obj.parent.remove(obj);
        }
        entity.destroy();
        this.deviceEntities.delete(id);
      }
    }

    for (const device of devices) {
      const existing = this.deviceEntities.get(device.id);
      if (existing) {
        this.updateDeviceEntity(existing, device);
      } else {
        this.createDeviceEntity(device);
      }
    }
  }

  private updateDeviceEntity(entity: Entity, device: Device): void {
    entity.setValue(DeviceComponent, "isOn", device.is_on);
    entity.setValue(
      DeviceComponent,
      "properties",
      stringifyDeviceProperties(getDeviceProperties(device)),
    );

    if (entity.object3D) {
      this.updateDeviceVisuals(entity.object3D, device);
    }
  }

  getEntityForDevice(deviceId: string): Entity | undefined {
    return this.deviceEntities.get(deviceId);
  }

  getDeviceIdFromEntity(entity: Entity): string | null {
    try {
      return entity.getValue(DeviceComponent, "deviceId") || null;
    } catch {
      return null;
    }
  }

  async saveDevicePosition(deviceId: string): Promise<void> {
    const entity = this.deviceEntities.get(deviceId);
    if (!entity?.object3D) return;

    const pos = entity.object3D.position;
    console.log(
      `[DeviceRenderer] Saving position for ${deviceId}:`,
      pos.toArray(),
    );

    await getStore().updateDevicePosition(deviceId, pos.x, pos.y, pos.z);
  }

  focusOnDevice(deviceId: string): void {
    const entity = this.deviceEntities.get(deviceId);
    if (!entity?.object3D) return;

    const pos = entity.object3D.position;
    console.log(`[DeviceRenderer] Focus on device at:`, pos.toArray());
  }

  update(dt: number): void {}

  destroy(): void {
    this.unsubscribe?.();
    for (const [id, entity] of this.deviceEntities) {
      const obj = entity.object3D;
      if (obj?.parent) {
        obj.parent.remove(obj);
      }
    }
    this.deviceEntities.clear();
    this.modelCache.clear();
    console.log("[DeviceRenderer] System destroyed");
  }
}
