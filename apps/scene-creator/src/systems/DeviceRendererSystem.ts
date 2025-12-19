import {
  createSystem,
  Entity,
  Interactable,
  Object3D,
  Box3,
  Vector3,
  AssetManager,
  DistanceGrabbable,
  MovementMode,
} from "@iwsdk/core";

import { deviceStore, getStore } from "../store/DeviceStore";
import { Device, DeviceType, DeviceRecord } from "../types";
import { DeviceComponent } from "../components/DeviceComponent";
import { BaseDevice, DeviceFactory } from "../entities";
import { DEVICE_ASSET_KEYS } from "../constants";

export class DeviceRendererSystem extends createSystem({
  devices: {
    required: [DeviceComponent],
  },
}) {
  private deviceRecords: Map<string, DeviceRecord> = new Map();
  private modelCache: Map<DeviceType, Object3D> = new Map();
  private initialized = false;
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
      `[DeviceRenderer] Initialized ${this.deviceRecords.size} device entities`,
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

  private createDeviceEntity(data: Device): DeviceRecord | null {
    const device = DeviceFactory.create(data);

    const cachedModel = this.getModelFromAssetManager(data.type);
    if (!cachedModel) {
      console.error(`[DeviceRenderer] No model available for ${data.type}`);
      return null;
    }

    const model = cachedModel.clone();
    model.scale.setScalar(device.getScale());
    model.position.set(data.position[0], data.position[1], data.position[2]);

    this.world.scene.add(model);

    const entity = this.world.createTransformEntity(model);

    entity.addComponent(DeviceComponent, {
      deviceId: data.id,
      deviceType: data.type,
      isOn: data.is_on,
      properties: JSON.stringify(device.getProperties()),
    });

    entity.addComponent(Interactable);
    entity.addComponent(DistanceGrabbable, {
      movementMode: MovementMode.MoveFromTarget,
    });

    device.updateVisuals(model);

    const record: DeviceRecord = { entity, device };
    this.deviceRecords.set(data.id, record);

    console.log(
      `[DeviceRenderer] Created entity for ${data.name} (${data.type})`,
    );
    return record;
  }

  private syncDevicesWithScene(devices: Device[]): void {
    const currentIds = new Set(devices.map((d) => d.id));

    // Remove deleted devices
    for (const [id, record] of this.deviceRecords) {
      if (!currentIds.has(id)) {
        console.log(`[DeviceRenderer] Removing deleted device: ${id}`);
        const obj = record.entity.object3D;
        if (obj?.parent) {
          obj.parent.remove(obj);
        }
        record.entity.destroy();
        this.deviceRecords.delete(id);
      }
    }

    // Update or create devices
    for (const data of devices) {
      const existing = this.deviceRecords.get(data.id);
      if (existing) {
        this.updateDeviceEntity(existing, data);
      } else {
        this.createDeviceEntity(data);
      }
    }
  }

  private updateDeviceEntity(record: DeviceRecord, data: Device): void {
    DeviceFactory.update(record.device, data);

    record.entity.setValue(DeviceComponent, "isOn", data.is_on);
    record.entity.setValue(
      DeviceComponent,
      "properties",
      JSON.stringify(record.device.getProperties()),
    );

    if (record.entity.object3D) {
      record.device.updateVisuals(record.entity.object3D);
    }
  }

  getDevice(deviceId: string): BaseDevice | undefined {
    return this.deviceRecords.get(deviceId)?.device;
  }

  getEntity(deviceId: string): Entity | undefined {
    return this.deviceRecords.get(deviceId)?.entity;
  }

  getRecord(deviceId: string): DeviceRecord | undefined {
    return this.deviceRecords.get(deviceId);
  }

  getDeviceIdFromEntity(entity: Entity): string | null {
    try {
      return entity.getValue(DeviceComponent, "deviceId") || null;
    } catch {
      return null;
    }
  }

  async saveDevicePosition(deviceId: string): Promise<void> {
    const record = this.deviceRecords.get(deviceId);
    if (!record?.entity.object3D) return;

    const pos = record.entity.object3D.position;
    console.log(
      `[DeviceRenderer] Saving position for ${deviceId}:`,
      pos.toArray(),
    );

    await getStore().updateDevicePosition(deviceId, pos.x, pos.y, pos.z);
  }

  update(dt: number): void {}

  destroy(): void {
    this.unsubscribe?.();
    for (const [id, record] of this.deviceRecords) {
      const obj = record.entity.object3D;
      if (obj?.parent) {
        obj.parent.remove(obj);
      }
    }
    this.deviceRecords.clear();
    this.modelCache.clear();
    console.log("[DeviceRenderer] System destroyed");
  }
}
