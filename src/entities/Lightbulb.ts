import { Object3D, Mesh, MeshStandardMaterial, Color } from "@iwsdk/core";
import { DeviceType, Lightbulb as LightbulbData } from "../types";
import { BaseDevice } from "./BaseDevice";

export class Lightbulb extends BaseDevice {
  readonly type = DeviceType.Lightbulb;
  brightness: number;
  colour: string;

  constructor(data: LightbulbData) {
    super(data);
    this.brightness = data.brightness;
    this.colour = data.colour;
  }

  getProperties(): Record<string, unknown> {
    return {
      brightness: this.brightness,
      colour: this.colour,
    };
  }

  updateFromData(data: LightbulbData): void {
    this.isOn = data.is_on;
    this.brightness = data.brightness;
    this.colour = data.colour;
    this.position = data.position;
  }

  updateVisuals(object3D: Object3D): void {
    this.applyBaseVisualState(object3D);

    if (this.isOn) {
      object3D.traverse((child) => {
        if (child instanceof Mesh) {
          const material = child.material;
          if (
            material instanceof MeshStandardMaterial &&
            material.name === "bulb"
          ) {
            material.emissive = new Color(this.colour);
            material.emissiveIntensity = (this.brightness / 100) * 0.5;
          }
        }
      });
    }
  }

  setBrightness(value: number): void {
    this.brightness = Math.max(0, Math.min(100, value));
  }

  setColour(colour: string): void {
    this.colour = colour;
  }
}
