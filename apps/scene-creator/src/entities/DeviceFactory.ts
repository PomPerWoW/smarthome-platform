import { Device, DeviceType } from "../types";
import { BaseDevice } from "./BaseDevice";
import { Lightbulb } from "./Lightbulb";
import { Television } from "./Television";
import { Fan } from "./Fan";
import { AirConditioner } from "./AirConditioner";
import { Chair } from "./Chair";
import { SmartMeter } from "./SmartMeter";

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
      case DeviceType.Chair:
      case DeviceType.Chair2:
      case DeviceType.Chair3:
      case DeviceType.Chair4:
      case DeviceType.Chair5:
      case DeviceType.Chair6:
        return new Chair(data as any);
      case DeviceType.SmartMeter:
        return new SmartMeter(data as any);
      default:
        // Fallback for unknown types
        console.warn(
          `Unknown device type: ${(data as Device).type}, using generic Chair`,
        );
        return new Chair(data as any);
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
