import { DeviceType, type TelevisionDTO } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";

export class Television extends BaseDevice {
  readonly type = DeviceType.Television;
  volume: number;
  channel: number;
  isMute: boolean;

  constructor(data: TelevisionDTO) {
    super(data);
    this.volume = data.volume;
    this.channel = data.channel;
    this.isMute = data.is_mute;
  }

  getProperties(): Record<string, unknown> {
    return {
      is_on: this.is_on,
      volume: this.volume,
      channel: this.channel,
      is_mute: this.isMute,
    };
  }

  getIcon(): string {
    return "tv";
  }

  getDisplayLabel(): string {
    return "Smart TV";
  }

  updateFromData(data: TelevisionDTO): void {
    this.name = data.device_name;
    this.volume = data.volume;
    this.channel = data.channel;
    this.isMute = data.is_mute;
    this.position = data.device_pos;
    this.tag = data.tag;
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(100, value));
  }

  setChannel(channel: number): void {
    this.channel = Math.max(1, channel);
  }

  toggleMute(): void {
    this.isMute = !this.isMute;
  }
}
