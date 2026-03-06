import { DeviceType } from "../types";

export const DEVICE_SCALES: Record<DeviceType, number> = {
  [DeviceType.Lightbulb]: 0.8,
  [DeviceType.Television]: 0.4,
  [DeviceType.Fan]: 0.25,
  [DeviceType.AirConditioner]: 0.2,
  [DeviceType.SmartMeter]: 0.0005,
};

export const DEVICE_ICONS: Record<DeviceType, string> = {
  [DeviceType.Lightbulb]: "💡",
  [DeviceType.Television]: "📺",
  [DeviceType.Fan]: "🌀",
  [DeviceType.AirConditioner]: "❄️",
  [DeviceType.SmartMeter]: "⚡",
};

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  [DeviceType.Lightbulb]: "💡 Smart Light",
  [DeviceType.Television]: "📺 Smart TV",
  [DeviceType.Fan]: "🌀 Tower Fan",
  [DeviceType.AirConditioner]: "❄️ Air Conditioner",
  [DeviceType.SmartMeter]: "⚡ Smart Meter",
};

export const LIGHTBULB_COLORS = [
  "white",
  "warm_white",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
  "green",
] as const;

export const AC_TEMPERATURE_PRESETS = [16, 22, 25] as const;
export const AC_TEMPERATURE_MIN = 16;
export const AC_TEMPERATURE_MAX = 30;

export const FAN_SPEED_MIN = 0;
export const FAN_SPEED_MAX = 5;

export const TV_VOLUME_MIN = 0;
export const TV_VOLUME_MAX = 100;
export const TV_VOLUME_STEP = 5;
export const TV_CHANNEL_MIN = 1;

export const LIGHTBULB_BRIGHTNESS_MIN = 0;
export const LIGHTBULB_BRIGHTNESS_MAX = 100;
export const LIGHTBULB_BRIGHTNESS_STEP = 10;

export const DEVICE_ASSET_KEYS: Record<DeviceType, string> = {
  [DeviceType.Lightbulb]: "lightbulb",
  [DeviceType.Television]: "television",
  [DeviceType.Fan]: "fan",
  [DeviceType.AirConditioner]: "air_conditioner",
  [DeviceType.SmartMeter]: "smartmeter",
};
