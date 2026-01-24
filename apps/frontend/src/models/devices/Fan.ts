import { DeviceType, type FanDTO } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";

export class Fan extends BaseDevice {
  readonly type = DeviceType.Fan;
  speed: number;
  swing: boolean;

  constructor(data: FanDTO) {
    super(data);
    this.speed = data.speed;
    this.swing = data.swing;
  }

  getProperties(): Record<string, unknown> {
    return {
      is_on: this.is_on,
      speed: this.speed,
      swing: this.swing,
    };
  }

  getIcon(): string {
    return "fan";
  }

  getDisplayLabel(): string {
    return "Tower Fan";
  }

  updateFromData(data: FanDTO): void {
    this.name = data.device_name;
    this.speed = data.speed;
    this.swing = data.swing;
    this.position = data.device_pos;
    this.tag = data.tag;
  }

  setSpeed(value: number): void {
    this.speed = Math.max(0, Math.min(5, value));
  }

  toggleSwing(): void {
    this.swing = !this.swing;
  }
}
