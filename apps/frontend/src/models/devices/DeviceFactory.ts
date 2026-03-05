import type { DeviceDTO } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";
import { Lightbulb } from "./Lightbulb";
import { Television } from "./Television";
import { Fan } from "./Fan";
import { AirConditioner } from "./AirConditioner";
import { GenericDevice } from "./GenericDevice";

export class DeviceFactory {
  static create(data: DeviceDTO | any): BaseDevice {
    switch (data.type) {
      case "Lightbulb":
        return new Lightbulb(data);
      case "Television":
        return new Television(data);
      case "Fan":
        return new Fan(data);
      case "AirConditioner":
        return new AirConditioner(data);
      default:
        console.warn(`Unknown device type encountered: ${data.type}`);
        return new GenericDevice(data);
    }
  }

  static update(device: BaseDevice, data: DeviceDTO | any): void {
    if (device.type !== data.type && !(device instanceof GenericDevice)) {
      throw new Error(
        `Device type mismatch: expected ${device.type}, got ${data.type}`,
      );
    }
    device.updateFromData(data);

    device.name = data.device_name;
    device.position = data.device_pos;
    device.roomName = data.room;
    device.tag = data.tag;
    device.is_on = data.is_on;
  }
}
