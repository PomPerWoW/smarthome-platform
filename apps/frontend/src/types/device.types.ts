export const DeviceType = {
  Lightbulb: "Lightbulb",
  Television: "Television",
  Fan: "Fan",
  AirConditioner: "AirConditioner",
} as const;

export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

export interface DevicePosition {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface DeviceBaseDTO {
  id: string;
  device_name: string;
  device_pos: DevicePosition;
  room: string | null;
  tag: string | null;
  type: string;
  is_on: boolean;
}

export interface LightbulbDTO extends DeviceBaseDTO {
  type: "Lightbulb";
  brightness: number;
  colour: string;
}

export interface TelevisionDTO extends DeviceBaseDTO {
  type: "Television";
  volume: number;
  channel: number;
  is_mute: boolean;
}

export interface FanDTO extends DeviceBaseDTO {
  type: "Fan";
  speed: number;
  swing: boolean;
}

export interface AirConditionerDTO extends DeviceBaseDTO {
  type: "AirConditioner";
  temperature: number;
}

export type DeviceDTO =
  | LightbulbDTO
  | TelevisionDTO
  | FanDTO
  | AirConditionerDTO;

export interface CreateLightbulbDTO {
  device_name: string;
  room: string;
  brightness?: number;
  colour?: string;
}

export interface CreateTelevisionDTO {
  device_name: string;
  room: string;
  volume?: number;
  channel?: number;
}

export interface CreateFanDTO {
  device_name: string;
  room: string;
  speed?: number;
  swing?: boolean;
}

export interface CreateAirConditionerDTO {
  device_name: string;
  room: string;
  temperature?: number;
}
