import { Object3D } from "@iwsdk/core";
import { DeviceType, Fan as FanData } from "../types";
import { BaseDevice } from "./BaseDevice";

export class Fan extends BaseDevice {
  readonly type = DeviceType.Fan;
  speed: number;
  swing: boolean;

  constructor(data: FanData) {
    super(data);
    this.speed = data.speed;
    this.swing = data.swing;
  }

  getProperties(): Record<string, unknown> {
    return {
      speed: this.speed,
      swing: this.swing,
    };
  }

  updateFromData(data: FanData): void {
    this.isOn = data.is_on;
    this.speed = data.speed;
    this.swing = data.swing;
    this.position = data.position;
  }

  updateVisuals(object3D: Object3D): void {
    this.applyBaseVisualState(object3D);
  }

  setSpeed(value: number): void {
    this.speed = Math.max(0, Math.min(5, value));
  }

  toggleSwing(): void {
    this.swing = !this.swing;
  }
}
