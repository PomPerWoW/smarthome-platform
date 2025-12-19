import { Object3D } from "@iwsdk/core";
import { DeviceType, Television as TelevisionData } from "../types";
import { BaseDevice } from "./BaseDevice";

export class Television extends BaseDevice {
  readonly type = DeviceType.Television;
  volume: number;
  channel: number;

  constructor(data: TelevisionData) {
    super(data);
    this.volume = data.volume;
    this.channel = data.channel;
  }

  getProperties(): Record<string, unknown> {
    return {
      volume: this.volume,
      channel: this.channel,
    };
  }

  updateFromData(data: TelevisionData): void {
    this.isOn = data.is_on;
    this.volume = data.volume;
    this.channel = data.channel;
    this.position = data.position;
  }

  updateVisuals(object3D: Object3D): void {
    this.applyBaseVisualState(object3D);
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(100, value));
  }

  setChannel(channel: number): void {
    this.channel = Math.max(1, channel);
  }
}
