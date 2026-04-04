import type {
  DeviceDTO,
  LightbulbDTO,
  TelevisionDTO,
  FanDTO,
  AirConditionerDTO,
  SmartMeterDTO,
} from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";
import { Lightbulb } from "./Lightbulb";
import { Television } from "./Television";
import { Fan } from "./Fan";
import { AirConditioner } from "./AirConditioner";
import { GenericDevice } from "./GenericDevice";
import { SmartMeter } from "./SmartMeter";

export class DeviceFactory {
  static create(data: DeviceDTO | Record<string, unknown>): BaseDevice {
    switch (data.type) {
      case "Lightbulb":
        return new Lightbulb(data as LightbulbDTO);
      case "Television":
        return new Television(data as TelevisionDTO);
      case "Fan":
        return new Fan(data as FanDTO);
      case "AirConditioner":
        return new AirConditioner(data as AirConditionerDTO);
      case "SmartMeter":
        return new SmartMeter(data as SmartMeterDTO);
      default:
        console.warn(`Unknown device type encountered: ${data.type}`);
        return new GenericDevice(data as DeviceDTO);
    }
  }

  static update(device: BaseDevice, data: DeviceDTO | Record<string, unknown>): void {
    if (device.type !== data.type && !(device instanceof GenericDevice)) {
      throw new Error(
        `Device type mismatch: expected ${device.type}, got ${data.type}`,
      );
    }
    // Call polymorphic update for device-specific properties
    device.updateFromData(data);

    // Ensure base properties are also synced
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as Record<string, any>;
    device.name = d.device_name;
    device.position = d.device_pos;
    device.roomName = d.room;
    device.tag = d.tag;
    device.is_on = d.is_on;
  }
}
