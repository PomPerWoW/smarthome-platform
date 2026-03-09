import {
  createSystem,
  Interactable,
  Hovered,
  Pressed,
  Entity,
  DistanceGrabbable,
} from "@iwsdk/core";
import { Vector3 } from "three";

import { deviceStore, getStore } from "../store/DeviceStore";
import { DeviceComponent } from "../components/DeviceComponent";
import { DeviceRendererSystem } from "./DeviceRendererSystem";
import {
  DOUBLE_CLICK_THRESHOLD_MS,
  POSITION_CHANGE_THRESHOLD,
  CLICK_TIMEOUT_MS,
} from "../constants";

export class DeviceInteractionSystem extends createSystem({
  interactableDevices: {
    required: [DeviceComponent, Interactable],
  },
  hoveredDevices: {
    required: [DeviceComponent, Hovered],
  },
  pressedDevices: {
    required: [DeviceComponent, Pressed],
  },
  grabbableDevices: {
    required: [DeviceComponent, DistanceGrabbable],
  },
}) {
  private deviceRenderer!: DeviceRendererSystem;
  private grabbedDeviceData: Map<
    string,
    { 
      startPosition: [number, number, number];
      lastPosition: Vector3;
      lastMovedTime: number;
      isMoving: boolean;
    }
  > = new Map();
  private lastClickTime: Map<string, number> = new Map();
  private readonly MOVEMENT_THRESHOLD = 0.001; // 1mm movement threshold

  init() {
    this.deviceRenderer = this.world.getSystem(DeviceRendererSystem)!;

    console.log("[DeviceInteraction] System initialized");

    this.queries.pressedDevices.subscribe("qualify", (entity) => {
      const deviceId = this.getDeviceId(entity);
      if (deviceId) {
        this.handleDevicePress(deviceId, entity);
        // Also track potential grab start for grabbable devices
        if (entity.hasComponent(DistanceGrabbable)) {
          this.onPotentialGrabStart(deviceId, entity);
        }
      }
    });

    // Track when devices are released (grab end)
    this.queries.pressedDevices.subscribe("disqualify", (entity) => {
      const deviceId = this.getDeviceId(entity);
      if (deviceId && this.grabbedDeviceData.has(deviceId)) {
        this.onPotentialGrabEnd(deviceId, entity);
      }
    });

    this.queries.hoveredDevices.subscribe("qualify", (entity) => {
      const deviceId = this.getDeviceId(entity);
      if (deviceId) {
        this.handleHoverStart(deviceId, entity);
      }
    });

    this.queries.hoveredDevices.subscribe("disqualify", (entity) => {
      const deviceId = this.getDeviceId(entity);
      if (deviceId) {
        this.handleHoverEnd(deviceId, entity);
      }
    });
  }

  private getDeviceId(entity: Entity): string | null {
    try {
      return entity.getValue(DeviceComponent, "deviceId") || null;
    } catch {
      return null;
    }
  }

  private handleDevicePress(deviceId: string, entity: Entity): void {
    const now = Date.now();
    const lastClick = this.lastClickTime.get(deviceId) || 0;
    const store = getStore();

    if (now - lastClick < DOUBLE_CLICK_THRESHOLD_MS) {
      console.log(
        `[DeviceInteraction] Double-click on ${deviceId} - toggling power`,
      );
      store.toggleDevice(deviceId);
      this.lastClickTime.delete(deviceId);
    } else {
      console.log(`[DeviceInteraction] Click on ${deviceId} - selecting`);

      const currentSelection = deviceStore.getState().selectedDeviceId;
      if (currentSelection === deviceId) {
        store.selectDevice(null);
      } else {
        store.selectDevice(deviceId);
      }

      this.lastClickTime.set(deviceId, now);
    }
  }

  private handleHoverStart(deviceId: string, entity: Entity): void {
    const obj = entity.object3D;
    // obj?.scale.multiplyScalar(HOVER_SCALE_FACTOR);
  }

  private handleHoverEnd(deviceId: string, entity: Entity): void {
    const obj = entity.object3D;
    // obj?.scale.multiplyScalar(1 / HOVER_SCALE_FACTOR);
  }

  private onPotentialGrabStart(deviceId: string, entity: Entity): void {
    if (!entity?.object3D) return;

    const pos = entity.object3D.position;
    // Only start tracking if not already tracking
    if (!this.grabbedDeviceData.has(deviceId)) {
      this.grabbedDeviceData.set(deviceId, {
        startPosition: [pos.x, pos.y, pos.z],
        lastPosition: new Vector3(pos.x, pos.y, pos.z),
        lastMovedTime: Date.now(),
        isMoving: false,
      });
      console.log(`[DeviceInteraction] Started tracking grab for: ${deviceId}`);
    }
  }

  private async onPotentialGrabEnd(deviceId: string, entity: Entity): Promise<void> {
    const grabData = this.grabbedDeviceData.get(deviceId);
    if (!grabData || !entity?.object3D) return;

    const currentPos = entity.object3D.position;
    const movedFromStart =
      Math.abs(currentPos.x - grabData.startPosition[0]) > POSITION_CHANGE_THRESHOLD ||
      Math.abs(currentPos.y - grabData.startPosition[1]) > POSITION_CHANGE_THRESHOLD ||
      Math.abs(currentPos.z - grabData.startPosition[2]) > POSITION_CHANGE_THRESHOLD;

    if (movedFromStart) {
      console.log(
        `[DeviceInteraction] Device released, saving position: ${deviceId}`,
      );
      await this.deviceRenderer.saveDevicePosition(deviceId);
    }

    // Clean up tracking
    this.grabbedDeviceData.delete(deviceId);
  }

  isGrabbed(deviceId: string): boolean {
    return this.grabbedDeviceData.has(deviceId);
  }

  update(dt: number): void {
    const now = Date.now();
    for (const [deviceId, time] of this.lastClickTime) {
      if (now - time > CLICK_TIMEOUT_MS) {
        this.lastClickTime.delete(deviceId);
      }
    }

    // Check all grabbable devices for movement tracking (for fallback detection)
    for (const entity of this.queries.grabbableDevices.entities) {
      const deviceId = this.getDeviceId(entity);
      if (deviceId && this.grabbedDeviceData.has(deviceId)) {
        // Update movement tracking
        const grabData = this.grabbedDeviceData.get(deviceId);
        if (grabData && entity.object3D) {
          const currentPos = entity.object3D.position;
          const currentPosVec = new Vector3(currentPos.x, currentPos.y, currentPos.z);
          const movedDistance = currentPosVec.distanceTo(grabData.lastPosition);
          
          if (movedDistance > this.MOVEMENT_THRESHOLD) {
            grabData.lastPosition.copy(currentPosVec);
            grabData.lastMovedTime = Date.now();
            grabData.isMoving = true;
          }
        }
      }
    }
  }
}
