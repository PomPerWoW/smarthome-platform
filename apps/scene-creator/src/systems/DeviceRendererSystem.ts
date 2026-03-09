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

import { Vector3 as TV3, Mesh, Intersection } from "three";
import {
  deviceStore,
  getStore,
  FurnitureItem,
  isFurnitureType,
} from "../store/DeviceStore";
import { Device, DeviceType, DeviceRecord, Fan } from "../types";
import { DeviceComponent } from "../components/DeviceComponent";
import { BaseDevice, DeviceFactory } from "../entities";
import { DEVICE_ASSET_KEYS } from "../constants";
import { chart3D, ChartType } from "../components/Chart3D";
import { constrainDeviceMovement, DEVICE_RADIUS } from "../config/collision";
import { Vector3 as ThreeVector3, Raycaster, Intersection } from "three";
import { getRoomBounds, clampToWalkableArea, isPositionWalkable } from "../config/navmesh";

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

  /** Track each device's last valid world-space position for collision. */
  private lastValidWorldPos: Map<string, TV3> = new Map();

  init() {
    console.log("[DeviceRenderer] System initialized");

    this.unsubscribe = deviceStore.subscribe(
      (state) => [state.devices, state.furniture] as const,
      ([devices, furniture]) => {
        if (this.initialized) {
          // Merge furniture into device format for rendering
          const furnitureAsDevices = furniture.map(this.furnitureToDevice);
          this.syncDevicesWithScene([...devices, ...furnitureAsDevices]);
        }
      },
    );
  }

  private furnitureToDevice(f: FurnitureItem): Device {
    return {
      id: f.id,
      name: f.furniture_name,
      type: f.furniture_type as DeviceType,
      is_on: true,
      position: f.position,
      rotation_y: f.rotation_y,
      home_id: "",
      home_name: "",
      floor_id: "",
      floor_name: "",
      room_id: "",
      room_name: f.room,
    } as any;
  }

  async initializeDevices(): Promise<void> {
    const store = getStore();
    const devices = store.devices;
    const furniture = store.furniture;

    const furnitureAsDevices = furniture.map(this.furnitureToDevice);
    const allItems = [...devices, ...furnitureAsDevices];

    if (allItems.length === 0) {
      console.log("[DeviceRenderer] No devices or furniture to render");
      return;
    }

    console.log(
      `[DeviceRenderer] Initializing ${devices.length} devices + ${furniture.length} furniture...`,
    );
    console.log("[DeviceRenderer] Using preloaded models from AssetManager");

    for (const item of allItems) {
      this.createDeviceEntity(item);
    }

    this.initialized = true;
    console.log(
      `[DeviceRenderer] Initialized ${this.deviceRecords.size} entities`,
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
      let posX = data.position[0];
      let posY = data.position[1];
      let posZ = data.position[2];

      // For furniture, ensure position is within room bounds (defensive check)
      if (isFurnitureType(data.type)) {
        const roomBounds = getRoomBounds();
        if (roomBounds) {
          const MARGIN = 0.3;
          const minX = roomBounds.minX + MARGIN;
          const maxX = roomBounds.maxX - MARGIN;
          const minZ = roomBounds.minZ + MARGIN;
          const maxZ = roomBounds.maxZ - MARGIN;

          // Clamp position to room bounds
          const clampedX = Math.max(minX, Math.min(maxX, posX));
          const clampedZ = Math.max(minZ, Math.min(maxZ, posZ));

          // If position was outside bounds, log a warning and use clamped position
          if (posX !== clampedX || posZ !== clampedZ) {
            console.warn(
              `[DeviceRenderer] Furniture "${data.name}" position was outside room bounds, clamping: ` +
              `(${posX.toFixed(2)}, ${posZ.toFixed(2)}) -> (${clampedX.toFixed(2)}, ${clampedZ.toFixed(2)})`,
            );
            posX = clampedX;
            posZ = clampedZ;
          }

          // Verify position is walkable - if not, use room center
          if (!isPositionWalkable(posX, posZ)) {
            console.warn(
              `[DeviceRenderer] Furniture "${data.name}" position not walkable, using room center`,
            );
            posX = (minX + maxX) * 0.5;
            posZ = (minZ + maxZ) * 0.5;
          }
        }
      }

      model.position.set(posX, posY, posZ);
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

    const labModel = (globalThis as any).__labRoomModel as Object3D | undefined;
    if (labModel) {
      labModel.add(model);
    } else {
      this.world.scene.add(model);
    }

    const entity = this.world.createTransformEntity(model);

    // Re-ensure the device is a child of labRoomModel because createTransformEntity
    // might have reparented it to the root scene.
    if (labModel && model.parent !== labModel) {
      labModel.add(model);
    }

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
    const panelConfigs: Record<DeviceType, string | null> = {
      [DeviceType.Lightbulb]: "./ui/lightbulb-panel.json",
      [DeviceType.Television]: "./ui/television-panel.json",
      [DeviceType.Fan]: "./ui/fan-panel.json",
      [DeviceType.AirConditioner]: "./ui/ac-panel.json",
      [DeviceType.Chair]: null,
      [DeviceType.Chair2]: null,
      [DeviceType.Chair3]: null,
      [DeviceType.Chair4]: null,
      [DeviceType.Chair5]: null,
      [DeviceType.Chair6]: null,
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
      record.graphPanelEntity = this.createGraphPanel(
        deviceId,
        record.device.type,
      );
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
    console.log(
      `[DeviceRenderer] showChart called for deviceId=${deviceId}, chartType=${chartType}`,
    );
    const record = this.deviceRecords.get(deviceId);
    if (!record) {
      console.warn(
        `[DeviceRenderer] No record found for deviceId=${deviceId}. Available IDs: ${Array.from(this.deviceRecords.keys()).join(", ")}`,
      );
      return;
    }

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

    console.log(`[DeviceRenderer] Showing ${chartType} chart for ${deviceId}`);
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
        this.lastValidWorldPos.delete(id);
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

    // The position and rotation are already local to LabPlan if it's a child.
    const pos = record.entity.object3D.position;
    const rotationYDeg = (record.entity.object3D.rotation.y * 180) / Math.PI;
    console.log(
      `[DeviceRenderer] Saving local position for ${deviceId}:`,
      pos.toArray(),
      `local rotation_y: ${rotationYDeg.toFixed(1)}°`,
    );

    // Check if this is a furniture item by looking at its device type
    if (isFurnitureType(record.device.type)) {
      await getStore().updateFurniturePosition(
        deviceId,
        pos.x,
        pos.y,
        pos.z,
        rotationYDeg,
      );
    } else {
      await getStore().updateDevicePosition(
        deviceId,
        pos.x,
        pos.y,
        pos.z,
        rotationYDeg,
      );
    }
  }

  update(dt: number): void {
    const labModel = (globalThis as any).__labRoomModel as Object3D | undefined;

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

      // ── Collision constraint for grabbed / moved devices ────────────
      if (record.entity.object3D) {
        const obj = record.entity.object3D;
        const worldPos = new TV3();
        (obj as any).getWorldPosition(worldPos);

        let lastPos = this.lastValidWorldPos.get(deviceId);
        if (!lastPos) {
          // First frame — initialise and skip constraint
          lastPos = worldPos.clone();
          this.lastValidWorldPos.set(deviceId, lastPos);
        } else {
          // Check if the device actually moved (> 0.5mm)
          const movedDist = worldPos.distanceTo(lastPos);
          if (movedDist > 0.0005) {
            const constrained = constrainDeviceMovement(
              lastPos,
              worldPos,
              DEVICE_RADIUS,
            );

            // If constrained position differs from the current world pos,
            // convert it back to local space and apply.
            const constrainedDist = constrained.distanceTo(worldPos);
            if (constrainedDist > 0.001) {
              // Convert constrained world pos → local pos relative to parent
              if (obj.parent) {
                (obj.parent as any).worldToLocal(constrained);
              }
              obj.position.set(constrained.x, constrained.y, constrained.z);
              // Re-read the world position after correction
              (obj as any).getWorldPosition(worldPos);
            }

            // Update the last valid position
            lastPos.copy(worldPos);
          }
        }
      }

      if (record.panelEntity?.object3D && record.entity.object3D) {
        const yOffset = 0;
        const worldPos = new Vector3();
        record.entity.object3D.getWorldPosition(worldPos);

        // Find a safe position for the panel (collision-aware)
        const safePanelPos = this.findSafePanelPosition(worldPos, yOffset);
        record.panelEntity.object3D.position.set(
          safePanelPos.x,
          safePanelPos.y,
          safePanelPos.z,
        );

        // Make panel face the camera
        const camera = this.world.camera;
        if (camera) {
          record.panelEntity.object3D.lookAt(camera.position);
        }

        // Position graph panel relative to the control panel
        if (record.graphPanelEntity?.object3D && record.graphPanelVisible) {
          // Try to position graph panel to the right of control panel, or find safe position
          const graphPanelPos = this.findSafePanelPosition(
            safePanelPos,
            0,
            0.5, // Offset from control panel
          );
          record.graphPanelEntity.object3D.position.set(
            graphPanelPos.x,
            graphPanelPos.y,
            graphPanelPos.z,
          );

          // Make graph panel face the camera
          if (camera) {
            record.graphPanelEntity.object3D.lookAt(camera.position);
          }
        }
      }
    }
  }

  /**
   * Find a safe position for a panel that doesn't collide with room geometry.
   * Tries multiple positions around the device (right, left, front, back, etc.)
   * 
   * @param deviceWorldPos World position of the device
   * @param yOffset Vertical offset for the panel
   * @param baseOffset Base horizontal offset from device (default 0.5m)
   * @returns Safe world position for the panel
   */
  private findSafePanelPosition(
    deviceWorldPos: Vector3,
    yOffset: number,
    baseOffset: number = 0.5,
  ): Vector3 {
    const roomModel = (globalThis as any).__labRoomModel as Object3D | undefined;
    if (!roomModel) {
      // No room model - use default position
      return new Vector3(
        deviceWorldPos.x + baseOffset,
        deviceWorldPos.y + yOffset,
        deviceWorldPos.z,
      );
    }

    // Panel dimensions (approximate - panels are roughly 0.4m x 0.55m)
    const PANEL_RADIUS = 0.3; // Conservative radius for collision checking
    const PANEL_HEIGHTS = [0.1, 0.3, 0.5]; // Check at different heights

    // Try multiple positions: right, left, front, back, and variations
    const candidateOffsets = [
      // Default: right of device
      { x: baseOffset, z: 0 },
      // Left of device
      { x: -baseOffset, z: 0 },
      // Front of device
      { x: 0, z: baseOffset },
      // Back of device
      { x: 0, z: -baseOffset },
      // Diagonal positions
      { x: baseOffset * 0.7, z: baseOffset * 0.7 },
      { x: -baseOffset * 0.7, z: baseOffset * 0.7 },
      { x: baseOffset * 0.7, z: -baseOffset * 0.7 },
      { x: -baseOffset * 0.7, z: -baseOffset * 0.7 },
      // Closer positions
      { x: baseOffset * 0.5, z: 0 },
      { x: -baseOffset * 0.5, z: 0 },
      { x: 0, z: baseOffset * 0.5 },
      { x: 0, z: -baseOffset * 0.5 },
      // Further positions
      { x: baseOffset * 1.2, z: 0 },
      { x: -baseOffset * 1.2, z: 0 },
    ];

    // Get collision meshes from room model (same approach as collision system)
    const collisionMeshes: any[] = [];
    roomModel.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        collisionMeshes.push(child);
      }
    });

    // Use original raycast method (bypass any overrides, same as collision system)
    const originalRaycast = (Mesh.prototype as any).raycast;

    const raycaster = new Raycaster();
    const testDirections = [
      new ThreeVector3(1, 0, 0),   // Right
      new ThreeVector3(-1, 0, 0),  // Left
      new ThreeVector3(0, 0, 1),   // Forward
      new ThreeVector3(0, 0, -1),  // Back
      new ThreeVector3(0, 1, 0),   // Up
      new ThreeVector3(0, -1, 0),  // Down
    ];

    // Try each candidate position
    for (const offset of candidateOffsets) {
      const candidatePos = new ThreeVector3(
        deviceWorldPos.x + offset.x,
        deviceWorldPos.y + yOffset,
        deviceWorldPos.z + offset.z,
      );

      // Check if this position is safe by casting rays in multiple directions
      let isSafe = true;
      for (const height of PANEL_HEIGHTS) {
        const testOrigin = new ThreeVector3(
          candidatePos.x,
          candidatePos.y + height,
          candidatePos.z,
        );

        for (const dir of testDirections) {
          raycaster.set(testOrigin, dir);
          raycaster.far = PANEL_RADIUS;
          raycaster.near = 0;

          // Use original raycast to check collisions (same as collision system)
          const hits: Intersection[] = [];
          for (const mesh of collisionMeshes) {
            originalRaycast.call(mesh, raycaster, hits);
          }

          if (hits.length > 0) {
            hits.sort((a, b) => a.distance - b.distance);
            if (hits[0].distance < PANEL_RADIUS) {
              // Position is too close to room geometry
              isSafe = false;
              break;
            }
          }
        }

        if (!isSafe) break;
      }

      if (isSafe) {
        // Found a safe position
        return new Vector3(candidatePos.x, candidatePos.y, candidatePos.z);
      }
    }

    // If no safe position found, use default position anyway (better than nothing)
    console.warn(
      `[DeviceRenderer] Could not find collision-free position for panel, using default`,
    );
    return new Vector3(
      deviceWorldPos.x + baseOffset,
      deviceWorldPos.y + yOffset,
      deviceWorldPos.z,
    );
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
    this.lastValidWorldPos.clear();
    console.log("[DeviceRenderer] System destroyed");
  }
}
