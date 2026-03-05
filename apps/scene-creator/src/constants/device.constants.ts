import { DeviceType } from "../types";

export const DEVICE_SCALES: Record<DeviceType, number> = {
  [DeviceType.Lightbulb]: 0.8,
  [DeviceType.Television]: 0.4,
  [DeviceType.Fan]: 0.25,
  [DeviceType.AirConditioner]: 0.2,
  [DeviceType.Chair]: 1.0,
  [DeviceType.Chair2]: 1.0,
  [DeviceType.Chair3]: 1.0,
  [DeviceType.Chair4]: 1.0,
  [DeviceType.Chair5]: 1.0,
  [DeviceType.Chair6]: 1.0,
};

export const DEVICE_ICONS: Record<DeviceType, string> = {
  [DeviceType.Lightbulb]: "💡",
  [DeviceType.Television]: "📺",
  [DeviceType.Fan]: "🌀",
  [DeviceType.AirConditioner]: "❄️",
  [DeviceType.Chair]: "🪑",
  [DeviceType.Chair2]: "🪑",
  [DeviceType.Chair3]: "🪑",
  [DeviceType.Chair4]: "🪑",
  [DeviceType.Chair5]: "🪑",
  [DeviceType.Chair6]: "🪑",
};

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  [DeviceType.Lightbulb]: "💡 Smart Light",
  [DeviceType.Television]: "📺 Smart TV",
  [DeviceType.Fan]: "🌀 Tower Fan",
  [DeviceType.AirConditioner]: "❄️ Air Conditioner",
  [DeviceType.Chair]: "🪑 Chair",
  [DeviceType.Chair2]: "🪑 Velvet Chair",
  [DeviceType.Chair3]: "🪑 Leather Chair",
  [DeviceType.Chair4]: "🪑 Accent Chair",
  [DeviceType.Chair5]: "🪑 Wingback Chair",
  [DeviceType.Chair6]: "🪑 Tufted Chair",
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
  [DeviceType.Chair]: "chair",
  [DeviceType.Chair2]: "chair2",
  [DeviceType.Chair3]: "chair3",
  [DeviceType.Chair4]: "chair4",
  [DeviceType.Chair5]: "chair5",
  [DeviceType.Chair6]: "chair6",
};
