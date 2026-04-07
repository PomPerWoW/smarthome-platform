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
  FURNITURE_ROTATION_CHANGE_THRESHOLD_RAD,
  CLICK_TIMEOUT_MS,
} from "../constants";

/** How long (ms) a device must be motionless before its final position/rotation is saved. */
const IDLE_SAVE_DELAY_MS = 600;

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

  /**
   * Per-device transform snapshot used for the polling-based save path.
   * Updated every frame while the device is moving; a save is triggered
   * once the device becomes motionless for IDLE_SAVE_DELAY_MS.
   */
  private deviceSnapshot: Map<
    string,
    {
      /** Baseline position captured when the device first started moving. */
      savedPosition: [number, number, number];
      /** Baseline rotation (rad) captured when the device first started moving. */
      savedRotationY: number;
      /** Last observed position — updated each frame the device is moving. */
      lastPosition: Vector3;
      /** Last observed Y rotation — updated each frame the device is changing. */
      lastRotationY: number;
      /** Timestamp of the last observed change. */
      lastChangedTime: number;
      /** Whether a save has already been scheduled/fired for this motion. */
      savePending: boolean;
    }
  > = new Map();

  // Legacy grab-tracking map still used so the Pressed-based path also works
  // (belt-and-suspenders; the polling path is the primary save path).
  private grabbedDeviceData: Map<
    string,
    {
      startPosition: [number, number, number];
      /** Local Y rotation (radians) at grab start — used to persist rotation without a position move. */
      startRotationY: number;
      lastPosition: Vector3;
      lastMovedTime: number;
      isMoving: boolean;
    }
  > = new Map();

  private lastClickTime: Map<string, number> = new Map();
  private readonly MOVEMENT_THRESHOLD = 0.001; // 1 mm
  private readonly ROTATION_THRESHOLD_RAD = FURNITURE_ROTATION_CHANGE_THRESHOLD_RAD;

  private readonly _pollPosScratch = new Vector3();
  private readonly _legacyGrabPosScratch = new Vector3();

  init() {
    this.deviceRenderer = this.world.getSystem(DeviceRendererSystem)!;

    console.log("[DeviceInteraction] System initialized");

    this.queries.pressedDevices.subscribe("qualify", (entity) => {
      const deviceId = this.getDeviceId(entity);
      if (deviceId) {
        this.handleDevicePress(deviceId, entity);
        // Belt-and-suspenders: also start legacy grab tracking
        if (entity.hasComponent(DistanceGrabbable)) {
          this.onPotentialGrabStart(deviceId, entity);
        }
      }
    });

    // Legacy Pressed-based save path (fires when pointer is released over the entity)
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

  /** Smallest absolute delta between two Y rotations (radians), accounting for wrap. */
  private yRotationDelta(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
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

  // ── Legacy Pressed-based grab tracking (belt-and-suspenders) ──────────

  private onPotentialGrabStart(deviceId: string, entity: Entity): void {
    if (!entity?.object3D) return;

    const pos = entity.object3D.position;
    if (!this.grabbedDeviceData.has(deviceId)) {
      this.grabbedDeviceData.set(deviceId, {
        startPosition: [pos.x, pos.y, pos.z],
        startRotationY: entity.object3D.rotation.y,
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

    const deviceRotated =
      this.yRotationDelta(
        grabData.startRotationY,
        entity.object3D.rotation.y,
      ) > this.ROTATION_THRESHOLD_RAD;

    if (movedFromStart || deviceRotated) {
      console.log(
        `[DeviceInteraction] (Pressed path) Saving after release (${movedFromStart ? "position" : ""}${movedFromStart && deviceRotated ? " + " : ""}${deviceRotated ? "rotation" : ""}): ${deviceId}`,
      );
      await this.deviceRenderer.saveDevicePosition(deviceId);
    }

    this.grabbedDeviceData.delete(deviceId);
  }

  // ── Primary polling-based save path ───────────────────────────────────

  isGrabbed(deviceId: string): boolean {
    return this.grabbedDeviceData.has(deviceId);
  }

  update(dt: number): void {
    const now = Date.now();

    // Clean up stale click timers
    for (const [deviceId, time] of this.lastClickTime) {
      if (now - time > CLICK_TIMEOUT_MS) {
        this.lastClickTime.delete(deviceId);
      }
    }

    // ── Polling-based save: observe every grabbable entity each frame ──
    for (const entity of this.queries.grabbableDevices.entities) {
      const deviceId = this.getDeviceId(entity);
      if (!deviceId || !entity.object3D) continue;

      const pos = entity.object3D.position;
      const rotY = entity.object3D.rotation.y;
      const snap = this.deviceSnapshot.get(deviceId);

      if (!snap) {
        // First time we see this device — establish a baseline
        this.deviceSnapshot.set(deviceId, {
          savedPosition: [pos.x, pos.y, pos.z],
          savedRotationY: rotY,
          lastPosition: new Vector3(pos.x, pos.y, pos.z),
          lastRotationY: rotY,
          lastChangedTime: now,
          savePending: false,
        });
        continue;
      }

      this._pollPosScratch.set(pos.x, pos.y, pos.z);
      const posChanged =
        this._pollPosScratch.distanceTo(snap.lastPosition) > this.MOVEMENT_THRESHOLD;
      const rotChanged = this.yRotationDelta(rotY, snap.lastRotationY) > this.ROTATION_THRESHOLD_RAD;

      if (posChanged || rotChanged) {
        // Device is actively moving / rotating — update snapshot
        snap.lastPosition.copy(this._pollPosScratch);
        snap.lastRotationY = rotY;
        snap.lastChangedTime = now;
        snap.savePending = true; // flag that a save will be needed when motion stops
        continue;
      }

      // Device appears stationary this frame.
      if (
        snap.savePending &&
        now - snap.lastChangedTime >= IDLE_SAVE_DELAY_MS
      ) {
        // Motion stopped long enough — check if net delta vs last saved transform is significant
        const netPosMoved =
          Math.abs(pos.x - snap.savedPosition[0]) > POSITION_CHANGE_THRESHOLD ||
          Math.abs(pos.y - snap.savedPosition[1]) > POSITION_CHANGE_THRESHOLD ||
          Math.abs(pos.z - snap.savedPosition[2]) > POSITION_CHANGE_THRESHOLD;

        const netRotMoved =
          this.yRotationDelta(rotY, snap.savedRotationY) > this.ROTATION_THRESHOLD_RAD;

        if (netPosMoved || netRotMoved) {
          console.log(
            `[DeviceInteraction] (Poll path) Saving after idle (${netPosMoved ? "position" : ""}${netPosMoved && netRotMoved ? " + " : ""}${netRotMoved ? "rotation" : ""}): ${deviceId}`,
          );
          // Fire-and-forget async save
          this.deviceRenderer.saveDevicePosition(deviceId).then(() => {
            // Update saved baseline to current transform
            const s = this.deviceSnapshot.get(deviceId);
            if (s) {
              s.savedPosition = [pos.x, pos.y, pos.z];
              s.savedRotationY = rotY;
            }
          }).catch((err) => {
            console.error(`[DeviceInteraction] Save failed for ${deviceId}:`, err);
          });
        }

        // Clear pending flag regardless
        snap.savePending = false;
      }
    }

    // Legacy movement tracker (keep for backward compat)
    for (const entity of this.queries.grabbableDevices.entities) {
      const deviceId = this.getDeviceId(entity);
      if (deviceId && this.grabbedDeviceData.has(deviceId)) {
        const grabData = this.grabbedDeviceData.get(deviceId);
        if (grabData && entity.object3D) {
          const currentPos = entity.object3D.position;
          this._legacyGrabPosScratch.set(currentPos.x, currentPos.y, currentPos.z);
          const movedDistance = this._legacyGrabPosScratch.distanceTo(
            grabData.lastPosition,
          );

          if (movedDistance > this.MOVEMENT_THRESHOLD) {
            grabData.lastPosition.copy(this._legacyGrabPosScratch);
            grabData.lastMovedTime = Date.now();
            grabData.isMoving = true;
          }
        }
      }
    }
  }
}
