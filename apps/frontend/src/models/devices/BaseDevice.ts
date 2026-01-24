import {
  DeviceType,
  type DeviceBaseDTO,
  type DevicePosition,
} from "@/types/device.types";

export abstract class BaseDevice {
  readonly id: string;
  name: string;
  abstract readonly type: DeviceType;
  position: DevicePosition;
  roomName: string | null;
  tag: string | null;
  is_on: boolean;

  constructor(data: DeviceBaseDTO) {
    this.id = data.id;
    this.name = data.device_name;
    this.position = data.device_pos;
    this.roomName = data.room;
    this.tag = data.tag;
    this.is_on = data.is_on;
  }

  abstract getProperties(): Record<string, unknown>;
  abstract getIcon(): string;
  abstract getDisplayLabel(): string;
  abstract updateFromData(data: unknown): void;

  toJSON(): DeviceBaseDTO & Record<string, unknown> {
    return {
      id: this.id,
      device_name: this.name,
      device_pos: this.position,
      room: this.roomName,
      tag: this.tag,
      type: this.type,
      is_on: this.is_on,
      ...this.getProperties(),
    };
  }
}
