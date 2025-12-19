import {
  createSystem,
  Interactable,
  Hovered,
  Pressed,
  Entity,
} from "@iwsdk/core";

import { deviceStore, getStore } from "../store/DeviceStore";
import { DeviceComponent } from "../components/DeviceComponent";
import { DeviceRendererSystem } from "./DeviceRendererSystem";
import {
  DOUBLE_CLICK_THRESHOLD_MS,
  HOVER_SCALE_FACTOR,
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
}) {
  private deviceRenderer!: DeviceRendererSystem;
  private grabbedDevices: Map<
    string,
    { startPosition: [number, number, number] }
  > = new Map();
  private lastClickTime: Map<string, number> = new Map();

  init() {
    this.deviceRenderer = this.world.getSystem(DeviceRendererSystem)!;

    console.log("[DeviceInteraction] System initialized");

    this.queries.pressedDevices.subscribe("qualify", (entity) => {
      const deviceId = this.getDeviceId(entity);
      if (deviceId) {
        this.handleDevicePress(deviceId, entity);
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
    obj?.scale.multiplyScalar(HOVER_SCALE_FACTOR);
  }

  private handleHoverEnd(deviceId: string, entity: Entity): void {
    const obj = entity.object3D;
    obj?.scale.multiplyScalar(1 / HOVER_SCALE_FACTOR);
  }

  onGrabStart(deviceId: string, entity: Entity): void {
    if (!entity?.object3D) return;

    const pos = entity.object3D.position;
    this.grabbedDevices.set(deviceId, {
      startPosition: [pos.x, pos.y, pos.z],
    });
    console.log(`[DeviceInteraction] Grab started: ${deviceId}`);
  }

  async onGrabEnd(deviceId: string, entity: Entity): Promise<void> {
    const grabData = this.grabbedDevices.get(deviceId);
    if (!grabData || !entity?.object3D) return;

    const pos = entity.object3D.position;
    const moved =
      Math.abs(pos.x - grabData.startPosition[0]) > POSITION_CHANGE_THRESHOLD ||
      Math.abs(pos.y - grabData.startPosition[1]) > POSITION_CHANGE_THRESHOLD ||
      Math.abs(pos.z - grabData.startPosition[2]) > POSITION_CHANGE_THRESHOLD;

    if (moved) {
      console.log(
        `[DeviceInteraction] Grab ended, saving position: ${deviceId}`,
      );
      await this.deviceRenderer.saveDevicePosition(deviceId);
    }

    this.grabbedDevices.delete(deviceId);
  }

  isGrabbed(deviceId: string): boolean {
    return this.grabbedDevices.has(deviceId);
  }

  update(dt: number): void {
    const now = Date.now();
    for (const [deviceId, time] of this.lastClickTime) {
      if (now - time > CLICK_TIMEOUT_MS) {
        this.lastClickTime.delete(deviceId);
      }
    }
  }
}
