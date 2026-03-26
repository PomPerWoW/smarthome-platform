import type { DeviceBaseDTO, DeviceType } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";

export class GenericDevice extends BaseDevice {
  readonly type: DeviceType;

  constructor(data: DeviceBaseDTO | any) {
    super(data);
    this.type = data.type as DeviceType;
  }

  getProperties(): Record<string, unknown> {
    return {};
  }

  getIcon(): string {
    return "HelpCircle"; // Fallback icon
  }

  getDisplayLabel(): string {
    return this.type || "Unknown Device";
  }

  updateFromData(_data: unknown): void {
    // No specific properties to update for generic device
  }
}
