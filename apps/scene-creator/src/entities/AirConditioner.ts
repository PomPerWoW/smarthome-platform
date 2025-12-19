import { Object3D } from "@iwsdk/core";
import { DeviceType, AirConditioner as AirConditionerData } from "../types";
import { BaseDevice } from "./BaseDevice";

export class AirConditioner extends BaseDevice {
  readonly type = DeviceType.AirConditioner;
  temperature: number;

  constructor(data: AirConditionerData) {
    super(data);
    this.temperature = data.temperature;
  }

  getProperties(): Record<string, unknown> {
    return {
      temperature: this.temperature,
    };
  }

  updateFromData(data: AirConditionerData): void {
    this.isOn = data.is_on;
    this.temperature = data.temperature;
    this.position = data.position;
  }

  updateVisuals(object3D: Object3D): void {
    this.applyBaseVisualState(object3D);
  }

  setTemperature(temp: number): void {
    this.temperature = Math.max(16, Math.min(30, temp));
  }
}
