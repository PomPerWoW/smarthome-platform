import { DeviceType, type LightbulbDTO } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";

export class Lightbulb extends BaseDevice {
  readonly type = DeviceType.Lightbulb;
  brightness: number;
  colour: string;

  constructor(data: LightbulbDTO) {
    super(data);
    this.brightness = data.brightness;
    this.colour = data.colour;
  }

  getProperties(): Record<string, unknown> {
    return {
      is_on: this.is_on,
      brightness: this.brightness,
      colour: this.colour,
    };
  }

  getIcon(): string {
    return "lightbulb";
  }

  getDisplayLabel(): string {
    return "Smart Bulb";
  }

  updateFromData(data: LightbulbDTO): void {
    this.name = data.device_name;
    this.brightness = data.brightness;
    this.colour = data.colour;
    this.position = data.device_pos;
    this.tag = data.tag;
  }

  setBrightness(value: number): void {
    this.brightness = Math.max(0, Math.min(100, value));
  }

  setColour(colour: string): void {
    this.colour = colour;
  }
}
