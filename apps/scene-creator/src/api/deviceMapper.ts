import { Device, DeviceType } from "../types";

interface RawDeviceResponse {
  id: string;
  device_name: string;
  device_pos: { x: number | null; y: number | null; z: number | null };
  device_rotation?: { x: number; y: number; z: number }; // Rotation from backend
  type: string;
  tag: string | null;
  room: string;
  is_on?: boolean;
  brightness?: number;
  colour?: string;
  volume?: number;
  channel?: number;
  is_mute?: boolean;
  speed?: number;
  swing?: boolean;
  temperature?: number;
}

const DEFAULT_POSITIONS: Record<DeviceType, [number, number, number]> = {
  [DeviceType.Lightbulb]: [0, 1.5, -2],
  [DeviceType.Television]: [1.5, 1, -2],
  [DeviceType.Fan]: [-1.5, 1, -2],
  [DeviceType.AirConditioner]: [0, 2, -2.5],
};

export function mapRawDeviceToDevice(raw: RawDeviceResponse): Device {
  const deviceType = raw.type as DeviceType;

  const defaultPos = DEFAULT_POSITIONS[deviceType] || [0, 1, -2];
  const position: [number, number, number] = [
    raw.device_pos?.x ?? defaultPos[0],
    raw.device_pos?.y ?? defaultPos[1],
    raw.device_pos?.z ?? defaultPos[2],
  ];

  const base = {
    id: raw.id,
    name: raw.device_name || "Unnamed Device",
    type: deviceType,
    is_on: raw.is_on ?? true,
    position,
    rotation_y: raw.device_rotation?.y ?? 0,
    home_id: "",
    home_name: "",
    floor_id: "",
    floor_name: "",
    room_id: "",
    room_name: raw.room || "",
  };

  switch (deviceType) {
    case DeviceType.Lightbulb:
      return {
        ...base,
        type: DeviceType.Lightbulb,
        brightness: raw.brightness ?? 100,
        colour: raw.colour ?? "#FFFFFF",
      };
    case DeviceType.Television:
      return {
        ...base,
        type: DeviceType.Television,
        volume: raw.volume ?? 20,
        channel: raw.channel ?? 1,
        is_mute: raw.is_mute ?? false,
      };
    case DeviceType.Fan:
      return {
        ...base,
        type: DeviceType.Fan,
        speed: raw.speed ?? 1,
        swing: raw.swing ?? false,
      };
    case DeviceType.AirConditioner:
      return {
        ...base,
        type: DeviceType.AirConditioner,
        temperature: raw.temperature ?? 24,
      };
    default:
      // Fallback for unknown types - treat as lightbulb
      console.warn(`[DeviceMapper] Unknown device type: ${raw.type}`);
      return {
        ...base,
        type: DeviceType.Lightbulb,
        brightness: 100,
        colour: "#FFFFFF",
      };
  }
}

export function mapRawDevicesToDevices(
  rawDevices: RawDeviceResponse[],
): Device[] {
  return rawDevices.map(mapRawDeviceToDevice);
}
