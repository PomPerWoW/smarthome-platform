import { Object3D } from "@iwsdk/core";
import { DeviceType, DeviceBase } from "../types";
import { BaseDevice } from "./BaseDevice";

export class Chair extends BaseDevice {
  readonly type = DeviceType.Chair;

  constructor(data: DeviceBase) {
    super(data);
  }

  getProperties(): Record<string, unknown> {
    return {};
  }

  updateVisuals(object3D: Object3D): void {
    // Chairs have no on/off state visuals — always fully opaque
  }

  updateFromData(data: unknown): void {
    const d = data as DeviceBase;
    this.isOn = d.is_on;
    this.name = d.name;
    this.position = d.position;
    this.rotationY = d.rotation_y ?? 0;
  }
}
