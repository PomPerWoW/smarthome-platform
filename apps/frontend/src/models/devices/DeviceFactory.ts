import type { DeviceDTO } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";
import { Lightbulb } from "./Lightbulb";
import { Television } from "./Television";
import { Fan } from "./Fan";
import { AirConditioner } from "./AirConditioner";

export class DeviceFactory {
  static create(data: DeviceDTO): BaseDevice {
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
        throw new Error(`Unknown device type: ${(data as DeviceDTO).type}`);
    }
  }

  static update(device: BaseDevice, data: DeviceDTO): void {
    if (device.type !== data.type) {
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
