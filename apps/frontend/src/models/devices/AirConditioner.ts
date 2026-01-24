import { DeviceType, type AirConditionerDTO } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";

export class AirConditioner extends BaseDevice {
  readonly type = DeviceType.AirConditioner;
  temperature: number;

  constructor(data: AirConditionerDTO) {
    super(data);
    this.temperature = data.temperature;
  }

  getProperties(): Record<string, unknown> {
    return {
      is_on: this.is_on,
      temperature: this.temperature,
    };
  }

  getIcon(): string {
    return "snowflake";
  }

  getDisplayLabel(): string {
    return "Air Conditioner";
  }

  updateFromData(data: AirConditionerDTO): void {
    this.name = data.device_name;
    this.temperature = data.temperature;
    this.position = data.device_pos;
    this.tag = data.tag;
  }

  setTemperature(value: number): void {
    this.temperature = Math.max(16, Math.min(30, value));
  }
}
