import {
  Object3D,
  Mesh,
  MeshStandardMaterial,
  Color,
  PointLight,
} from "@iwsdk/core";
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
    // We don't call applyBaseVisualState here because we want the lamp to remain solid/visible
    // even when off. We only want to control the emissive part (the bulb).

    object3D.traverse((child) => {
      if (child instanceof Mesh) {
        // Target the specific bulb mesh for glow
        if (child.name === "Circle_Light_0") {
          const material = child.material;
          if (material instanceof MeshStandardMaterial) {
            if (this.isOn) {
              material.emissive = new Color(this.colour);
              material.emissiveIntensity = (this.brightness / 100) * 1.0; // Boost intensity
            } else {
              material.emissive = new Color(0x000000);
              material.emissiveIntensity = 0;
            }
          }

          // Manage PointLight for actual light casting
          let light = child.getObjectByName("BulbLight") as PointLight;
          if (!light) {
            light = new PointLight(new Color(this.colour), 0, 5); // distance 5 meters
            light.name = "BulbLight";
            light.position.set(0, 0, 0); // Center of the bulb mesh
            child.add(light);
          }

          if (this.isOn) {
            light.color = new Color(this.colour);
            // Intensity formula: brightness (0-100) -> intensity (0-0.1 approx)
            light.intensity = (this.brightness / 100) * 0.1;
          } else {
            light.intensity = 0;
          }
        }
        // Ensure other parts are fully opaque/visible
        else {
          const material = child.material;
          if (material instanceof MeshStandardMaterial) {
            material.opacity = 1;
            material.transparent = false;
            // Ensure no accidental glow on other parts if they had it
            material.emissiveIntensity = 0;
          }
        }
      }
    });
  }

  setBrightness(value: number): void {
    this.brightness = Math.max(0, Math.min(100, value));
  }

  setColour(colour: string): void {
    this.colour = colour;
  }
}
