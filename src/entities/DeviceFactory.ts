import { Device, DeviceType } from "../types";
import { BaseDevice } from "./BaseDevice";
import { Lightbulb } from "./Lightbulb";
import { Television } from "./Television";
import { Fan } from "./Fan";
import { AirConditioner } from "./AirConditioner";

export class DeviceFactory {
  static create(data: Device): BaseDevice {
    switch (data.type) {
      case DeviceType.Lightbulb:
        return new Lightbulb(data);
      case DeviceType.Television:
        return new Television(data);
      case DeviceType.Fan:
        return new Fan(data);
      case DeviceType.AirConditioner:
        return new AirConditioner(data);
      default:
        const _exhaustive: never = data;
        throw new Error(`Unknown device type: ${(_exhaustive as Device).type}`);
    }
  }

  static update(device: BaseDevice, data: Device): void {
    if (device.type !== data.type) {
      throw new Error(
        `Device type mismatch: expected ${device.type}, got ${data.type}`,
      );
    }
    device.updateFromData(data);
  }
}
