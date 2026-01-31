import { Object3D, Mesh, MeshStandardMaterial } from "@iwsdk/core";
import { DeviceType, DeviceBase } from "../types";
import { DEVICE_SCALES } from "../constants";

export abstract class BaseDevice {
  readonly id: string;
  name: string;
  abstract readonly type: DeviceType;
  isOn: boolean;
  position: [number, number, number];
  rotationY: number;

  readonly homeId: string;
  readonly homeName: string;
  readonly floorId: string;
  readonly floorName: string;
  readonly roomId: string;
  readonly roomName: string;

  constructor(data: DeviceBase) {
    this.id = data.id;
    this.name = data.name;
    this.isOn = data.is_on;
    this.position = data.position;
    this.rotationY = data.rotation_y ?? 0;
    this.homeId = data.home_id;
    this.homeName = data.home_name;
    this.floorId = data.floor_id;
    this.floorName = data.floor_name;
    this.roomId = data.room_id;
    this.roomName = data.room_name;
  }

  toggle(): void {
    this.isOn = !this.isOn;
  }

  getScale(): number {
    return DEVICE_SCALES[this.type];
  }

  abstract getProperties(): Record<string, unknown>;
  abstract updateVisuals(object3D: Object3D): void;
  abstract updateFromData(data: unknown): void;

  protected applyBaseVisualState(object3D: Object3D): void {
    object3D.traverse((child) => {
      if (child instanceof Mesh) {
        const material = child.material;
        if (material instanceof MeshStandardMaterial) {
          if (!this.isOn) {
            material.emissiveIntensity = 0;
            material.opacity = 0.5;
            material.transparent = true;
          } else {
            material.opacity = 1;
            material.transparent = false;
          }
        }
      }
    });
  }

  toJSON(): DeviceBase & Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      is_on: this.isOn,
      position: this.position,
      rotation_y: this.rotationY,
      home_id: this.homeId,
      home_name: this.homeName,
      floor_id: this.floorId,
      floor_name: this.floorName,
      room_id: this.roomId,
      room_name: this.roomName,
      ...this.getProperties(),
    };
  }
}
