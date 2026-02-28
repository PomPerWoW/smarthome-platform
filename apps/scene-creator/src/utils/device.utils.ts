import {
  Device,
  DeviceType,
  LightbulbProperties,
  TelevisionProperties,
  FanProperties,
  AirConditionerProperties,
} from "../types";

export function parseDeviceProperties<T = Record<string, unknown>>(
  propertiesJson: string,
): T {
  try {
    return JSON.parse(propertiesJson) as T;
  } catch {
    return {} as T;
  }
}

export function stringifyDeviceProperties(
  properties: Record<string, unknown>,
): string {
  return JSON.stringify(properties);
}

export function getDeviceProperties(device: Device): Record<string, unknown> {
  switch (device.type) {
    case DeviceType.Lightbulb:
      return {
        brightness: device.brightness,
        colour: device.colour,
      } satisfies LightbulbProperties;
    case DeviceType.Television:
      return {
        volume: device.volume,
        channel: device.channel,
        is_mute: (device as any).is_mute || false,
      } satisfies TelevisionProperties;
    case DeviceType.Fan:
      return {
        speed: device.speed,
        swing: device.swing,
      } satisfies FanProperties;
    case DeviceType.AirConditioner:
      return {
        temperature: device.temperature,
      } satisfies AirConditionerProperties;
  }
}
