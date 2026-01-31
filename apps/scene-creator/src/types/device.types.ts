export enum DeviceType {
  Lightbulb = "Lightbulb",
  Television = "Television",
  Fan = "Fan",
  AirConditioner = "AirConditioner",
}

export interface DeviceBase {
  id: string;
  name: string;
  type: DeviceType;
  is_on: boolean;
  position: [number, number, number];
  rotation_y: number;
  home_id: string;
  home_name: string;
  floor_id: string;
  floor_name: string;
  room_id: string;
  room_name: string;
}

export interface Lightbulb extends DeviceBase {
  type: DeviceType.Lightbulb;
  brightness: number;
  colour: string;
}

export interface Television extends DeviceBase {
  type: DeviceType.Television;
  volume: number;
  channel: number;
  is_mute: boolean;
}

export interface Fan extends DeviceBase {
  type: DeviceType.Fan;
  speed: number;
  swing: boolean;
}

export interface AirConditioner extends DeviceBase {
  type: DeviceType.AirConditioner;
  temperature: number;
  min_temp?: number;
  max_temp?: number;
}

export type Device = Lightbulb | Television | Fan | AirConditioner;

export interface LightbulbProperties {
  brightness: number;
  colour: string;
}

export interface TelevisionProperties {
  volume: number;
  channel: number;
  is_mute: boolean;
}

export interface FanProperties {
  speed: number;
  swing: boolean;
}

export interface AirConditionerProperties {
  temperature: number;
}

export interface DeviceComponentData {
  deviceId: string;
  deviceType: DeviceType;
  isOn: boolean;
  properties: string;
}
