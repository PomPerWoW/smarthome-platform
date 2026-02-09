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
  PanelUI,
  AnimationMixer,
  AnimationClip,
  LoopRepeat,
} from "@iwsdk/core";

import { deviceStore, getStore } from "../store/DeviceStore";
import { Device, DeviceType, DeviceRecord, Fan } from "../types";
import { DeviceComponent } from "../components/DeviceComponent";
import { BaseDevice, DeviceFactory } from "../entities";
import { DEVICE_ASSET_KEYS } from "../constants";
import { chart3D, ChartType } from "../components/Chart3D";

export class DeviceRendererSystem extends createSystem({
  devices: {
    required: [DeviceComponent],
  },
}) {
  private deviceRecords: Map<string, DeviceRecord> = new Map();
  private modelCache: Map<DeviceType, Object3D> = new Map();
  private animationCache: Map<DeviceType, AnimationClip[]> = new Map();
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

  private getModelFromAssetManager(
    type: DeviceType,
  ): { model: Object3D; animations: AnimationClip[] } | null {
    const assetKey = DEVICE_ASSET_KEYS[type];

    // Check if we have cached model
    if (this.modelCache.has(type)) {
      return {
        model: this.modelCache.get(type)!,
        animations: this.animationCache.get(type) || [],
      };
    }

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

      // Cache both model and animations
      this.modelCache.set(type, model);

      // Clone animations if they exist
      const animations = gltf.animations || [];
      this.animationCache.set(type, animations);

      if (animations.length > 0) {
        console.log(
          `[DeviceRenderer] Cached ${animations.length} animation(s) for ${type}`,
        );
      }

      console.log(`[DeviceRenderer] Cached model for ${type}`);
      return { model, animations };
    } catch (error) {
      console.error(`[DeviceRenderer] Failed to get model for ${type}:`, error);
      return null;
    }
  }

  private createDeviceEntity(data: Device): DeviceRecord | null {
    const device = DeviceFactory.create(data);

    const result = this.getModelFromAssetManager(data.type);
    if (!result) {
      console.error(`[DeviceRenderer] No model available for ${data.type}`);
      return null;
    }

    const model = result.model.clone();
    model.scale.setScalar(device.getScale());

    if (Array.isArray(data.position) && data.position.length >= 3) {
      model.position.set(data.position[0], data.position[1], data.position[2]);
    } else {
      console.warn(
        `[DeviceRenderer] Invalid or missing position for device ${data.id}, defaulting to 0,0,0`,
        data.position,
      );
      model.position.set(0, 0, 0);
    }

    // Apply saved rotation (Y-axis only, in degrees)
    if (data.rotation_y !== undefined && data.rotation_y !== 0) {
      model.rotation.y = (data.rotation_y * Math.PI) / 180;
      console.log(
        `[DeviceRenderer] Applied rotation_y=${data.rotation_y}° to ${data.name}`,
      );
    }

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

    if (result.animations.length > 0) {
      const mixer = new AnimationMixer(model);
      record.mixer = mixer;
      record.actions = [];

      for (const clip of result.animations) {
        const action = mixer.clipAction(clip);
        action.setLoop(LoopRepeat, Infinity);
        record.actions.push(action);
      }

      // Auto-play animations based on device state
      if (this.shouldPlayAnimation(data)) {
        this.playAnimations(record, data);
      }

      console.log(
        `[DeviceRenderer] Setup ${result.animations.length} animation(s) for ${data.name}`,
      );
    }

    record.panelEntity = this.createDevicePanel(data.id, data.type);

    this.deviceRecords.set(data.id, record);

    console.log(
      `[DeviceRenderer] Created entity for ${data.name} (${data.type})`,
    );
    return record;
  }

  private playAnimations(record: DeviceRecord, data?: Device): void {
    if (record.actions) {
      const timeScale = this.getAnimationTimeScale(data);
      for (const action of record.actions) {
        action.setEffectiveTimeScale(timeScale);
        action.play();
      }
    }
  }

  private stopAnimations(record: DeviceRecord): void {
    if (record.actions) {
      for (const action of record.actions) {
        action.stop();
      }
    }
  }

  /**
   * Calculates animation time scale based on device properties
   * For fans: Speed 1 = 0.5x, Speed 2 = 1.0x, Speed 3 = 1.5x
   */
  private getAnimationTimeScale(data?: Device): number {
    if (!data || data.type !== DeviceType.Fan) {
      return 1.0;
    }

    const fan = data as Fan;
    // Map fan speed (1-3) to time scale (0.5-1.5)
    // Speed 1 = 0.5x, Speed 2 = 1.0x, Speed 3 = 1.5x
    const speed = Math.max(1, Math.min(3, fan.speed || 1));
    return 0.5 + (speed - 1) * 0.5;
  }

  /**
   * Updates animation speed for a device record
   */
  private updateAnimationSpeed(record: DeviceRecord, data: Device): void {
    if (record.actions) {
      const timeScale = this.getAnimationTimeScale(data);
      for (const action of record.actions) {
        action.setEffectiveTimeScale(timeScale);
      }
    }
  }

  /**
   * Determines if animation should play based on device type and state
   * For fans: requires both is_on AND swing to be true
   * For other devices: just requires is_on
   */
  private shouldPlayAnimation(data: Device): boolean {
    if (!data.is_on) return false;

    if (data.type === DeviceType.Fan) {
      return (data as Fan).swing === true;
    }

    return true;
  }

  private getPanelConfig(deviceType: DeviceType): string | null {
    const panelConfigs: Record<DeviceType, string> = {
      [DeviceType.Lightbulb]: "./ui/lightbulb-panel.json",
      [DeviceType.Television]: "./ui/television-panel.json",
      [DeviceType.Fan]: "./ui/fan-panel.json",
      [DeviceType.AirConditioner]: "./ui/ac-panel.json",
    };
    return panelConfigs[deviceType] ?? null;
  }

  private createDevicePanel(
    deviceId: string,
    deviceType: DeviceType,
  ): Entity | undefined {
    const config = this.getPanelConfig(deviceType);
    if (!config) {
      console.warn(
        `[DeviceRenderer] No panel config for device type: ${deviceType}`,
      );
      return undefined;
    }

    const panelEntity = this.world
      .createTransformEntity()
      .addComponent(PanelUI, {
        config,
        maxHeight: 0.5,
        maxWidth: 0.4,
      })
      .addComponent(Interactable)
      .addComponent(DeviceComponent, {
        deviceId,
        deviceType,
      });

    console.log(
      `[DeviceRenderer] Created ${deviceType} panel for device ${deviceId}`,
    );
    return panelEntity;
  }

  private createGraphPanel(deviceId: string, deviceType: DeviceType): Entity {
    const graphPanelEntity = this.world
      .createTransformEntity()
      .addComponent(PanelUI, {
        config: "./ui/graph-panel.json",
        maxHeight: 0.35,
        maxWidth: 0.3,
      })
      .addComponent(Interactable)
      .addComponent(DeviceComponent, {
        deviceId,
        deviceType,
      });

    // Start hidden
    if (graphPanelEntity.object3D) {
      graphPanelEntity.object3D.visible = false;
    }

    console.log(`[DeviceRenderer] Created graph panel for device ${deviceId}`);
    return graphPanelEntity;
  }

  /**
   * Toggle the visibility of the graph panel for a device
   */
  toggleGraphPanel(deviceId: string): void {
    const record = this.deviceRecords.get(deviceId);
    if (!record) return;

    // Create graph panel lazily if it doesn't exist
    if (!record.graphPanelEntity) {
      record.graphPanelEntity = this.createGraphPanel(deviceId, record.device.type);
      record.graphPanelVisible = false;
    }

    // Toggle visibility
    record.graphPanelVisible = !record.graphPanelVisible;
    if (record.graphPanelEntity.object3D) {
      record.graphPanelEntity.object3D.visible = record.graphPanelVisible;
    }

    console.log(
      `[DeviceRenderer] Graph panel ${record.graphPanelVisible ? "shown" : "hidden"} for ${deviceId}`,
    );
  }

  /**
   * Hide the graph panel for a device
   */
  hideGraphPanel(deviceId: string): void {
    const record = this.deviceRecords.get(deviceId);
    if (!record?.graphPanelEntity) return;

    record.graphPanelVisible = false;
    if (record.graphPanelEntity.object3D) {
      record.graphPanelEntity.object3D.visible = false;
    }
  }

  /**
   * Show a 3D chart for a device
   */
  showChart(deviceId: string, chartType: ChartType): void {
    const record = this.deviceRecords.get(deviceId);
    if (!record) return;

    // If same chart type is already showing, hide it (toggle)
    if (record.activeChartType === chartType && record.chartEntity) {
      this.hideChart(deviceId);
      return;
    }

    // Hide existing chart if different type
    if (record.chartEntity) {
      this.destroyChartEntity(record);
    }

    // Create new chart
    const chartObject = chart3D.createChart(chartType, record.device.type);
    this.world.scene.add(chartObject);

    // Create entity for the chart
    const chartEntity = this.world
      .createTransformEntity(chartObject)
      .addComponent(Interactable)
      .addComponent(DistanceGrabbable, {
        movementMode: MovementMode.RotateAtSource,
      });

    record.chartEntity = chartEntity;
    record.activeChartType = chartType;

    // Position the chart initially
    if (record.entity.object3D && chartEntity.object3D) {
      const devicePos = record.entity.object3D.position;
      chartEntity.object3D.position.set(
        devicePos.x + 1.5,
        devicePos.y,
        devicePos.z,
      );
    }

    console.log(
      `[DeviceRenderer] Showing ${chartType} chart for ${deviceId}`,
    );
  }

  /**
   * Hide the chart for a device
   */
  hideChart(deviceId: string): void {
    const record = this.deviceRecords.get(deviceId);
    if (!record?.chartEntity) return;

    this.destroyChartEntity(record);
    console.log(`[DeviceRenderer] Hidden chart for ${deviceId}`);
  }

  /**
   * Destroy chart entity and clean up
   */
  private destroyChartEntity(record: DeviceRecord): void {
    if (record.chartEntity) {
      const obj = record.chartEntity.object3D;
      if (obj?.parent) {
        obj.parent.remove(obj);
      }
      record.chartEntity.destroy();
      record.chartEntity = undefined;
      record.activeChartType = undefined;
    }
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
    const wasOn = record.device.isOn;
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

    // Control animations based on device state
    const shouldPlay = this.shouldPlayAnimation(data);
    const wasPlaying =
      record.actions?.some((action) => action.isRunning()) ?? false;

    if (shouldPlay !== wasPlaying) {
      if (shouldPlay) {
        console.log(`[DeviceRenderer] Playing animations for ${data.name}`);
        this.playAnimations(record, data);
      } else {
        console.log(`[DeviceRenderer] Stopping animations for ${data.name}`);
        this.stopAnimations(record);
      }
    } else if (shouldPlay && data.type === DeviceType.Fan) {
      // Update animation speed if fan speed changed while running
      this.updateAnimationSpeed(record, data);
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

  /**
   * Manually control animation playback for a device
   */
  setDeviceAnimationState(deviceId: string, isPlaying: boolean): void {
    const record = this.deviceRecords.get(deviceId);
    if (record) {
      if (isPlaying) {
        this.playAnimations(record);
      } else {
        this.stopAnimations(record);
      }
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

  update(dt: number): void {
    // Update panel positions to follow their devices and update animation mixers
    for (const [deviceId, record] of this.deviceRecords) {
      if (record.mixer) {
        record.mixer.update(dt);
      }

      // Rotation constraint: keep devices upright (X and Z rotation = 0)
      // This allows Y-axis rotation (facing direction) while preventing tilting
      if (record.entity.object3D) {
        const rot = record.entity.object3D.rotation;
        if (rot.x !== 0 || rot.z !== 0) {
          rot.x = 0;
          rot.z = 0;
        }
      }

      if (record.panelEntity?.object3D && record.entity.object3D) {
        const devicePos = record.entity.object3D.position;
        const yOffset = 0;
        // Position panel to the right of device
        record.panelEntity.object3D.position.set(
          devicePos.x + 0.5,
          devicePos.y + yOffset,
          devicePos.z,
        );

        // Make panel face the camera
        const camera = this.world.camera;
        if (camera) {
          record.panelEntity.object3D.lookAt(camera.position);
        }

        // Position graph panel to the right of the control panel
        if (record.graphPanelEntity?.object3D && record.graphPanelVisible) {
          record.graphPanelEntity.object3D.position.set(
            devicePos.x + 1.0, // Further right than the control panel
            devicePos.y,
            devicePos.z,
          );

          // Make graph panel face the camera
          if (camera) {
            record.graphPanelEntity.object3D.lookAt(camera.position);
          }
        }
      }
    }
  }

  destroy(): void {
    this.unsubscribe?.();
    for (const [id, record] of this.deviceRecords) {
      // Stop animations before cleanup
      if (record.mixer) {
        record.mixer.stopAllAction();
      }
      const obj = record.entity.object3D;
      if (obj?.parent) {
        obj.parent.remove(obj);
      }
    }
    this.deviceRecords.clear();
    this.modelCache.clear();
    this.animationCache.clear();
    console.log("[DeviceRenderer] System destroyed");
  }
}
