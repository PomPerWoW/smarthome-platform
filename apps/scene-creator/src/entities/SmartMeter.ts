import { Object3D } from "@iwsdk/core";
import { DeviceType, SmartMeter as SmartMeterData } from "../types";
import { BaseDevice } from "./BaseDevice";

export class SmartMeter extends BaseDevice {
    readonly type = DeviceType.SmartMeter;

    constructor(data: SmartMeterData) {
        super(data);
    }

    getProperties(): Record<string, unknown> {
        return {
            is_on: this.isOn,
        };
    }

    updateFromData(data: SmartMeterData): void {
        this.isOn = data.is_on;
        this.position = data.position;
    }

    updateVisuals(object3D: Object3D): void {
        // SmartMeter visuals behavior when on/off could be added here
        // For now, it might just display statically.
    }
}
