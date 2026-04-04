import type { DeviceBaseDTO, DeviceType } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";

export class GenericDevice extends BaseDevice {
  readonly type: DeviceType;

  constructor(data: DeviceBaseDTO) {
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

  updateFromData(): void {
    // No specific properties to update for generic device
  }
}
