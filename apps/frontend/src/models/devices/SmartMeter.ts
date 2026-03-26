import { DeviceType, type SmartMeterDTO } from "@/types/device.types";
import { BaseDevice } from "./BaseDevice";

export class SmartMeter extends BaseDevice {
    readonly type = DeviceType.SmartMeter;

    constructor(data: SmartMeterDTO) {
        super(data);
    }

    getProperties(): Record<string, unknown> {
        return {
            is_on: this.is_on,
        };
    }

    getIcon(): string {
        return "activity";
    }

    getDisplayLabel(): string {
        return "Smart Meter";
    }

    updateFromData(data: SmartMeterDTO): void {
        this.name = data.device_name;
        this.position = data.device_pos;
        this.tag = data.tag;
        this.is_on = data.is_on;
    }
}
