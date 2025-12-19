import {
  Device,
  DeviceType,
  Lightbulb,
  Television,
  Fan,
  AirConditioner,
} from "../types";

export function isLightbulb(device: Device): device is Lightbulb {
  return device.type === DeviceType.Lightbulb;
}

export function isTelevision(device: Device): device is Television {
  return device.type === DeviceType.Television;
}

export function isFan(device: Device): device is Fan {
  return device.type === DeviceType.Fan;
}

export function isAirConditioner(device: Device): device is AirConditioner {
  return device.type === DeviceType.AirConditioner;
}
