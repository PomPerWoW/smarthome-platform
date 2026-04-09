import { Mesh, MeshStandardMaterial, Object3D } from "three";
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

    // Override the base visual state to prevent the "off" state from making it semi-transparent
    protected applyBaseVisualState(object3D: Object3D): void {
        object3D.traverse((child: any) => {
            if (child instanceof Mesh) {
                const material = child.material;
                if (material instanceof MeshStandardMaterial) {
                    // Force the smart meter to always be opaque, regardless of on/off
                    material.opacity = 1.0;
                    material.transparent = false;
                    material.depthWrite = true;

                    if (!this.isOn) {
                        material.emissiveIntensity = 0;
                    }
                }
            }
        });
    }

    updateVisuals(object3D: Object3D): void {
        // NOTE: Do NOT modify object3D.position here — it breaks the entity's
        // Interactable/DistanceGrabbable raycasting bounds. Height offset is
        // baked into the default spawn position in deviceMapper.ts instead.
        this.applyBaseVisualState(object3D);
    }
}
