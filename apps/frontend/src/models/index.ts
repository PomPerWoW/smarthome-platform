import type {
  Device,
  Lightbulb,
  Television,
  AirConditioner,
  Fan,
} from "./device";

import type {
  Home,
  Floor,
  Room,
} from "./home";

import {
  DeviceType,
  createDevice,
  createLightbulb,
  createTelevision,
  createAirConditioner,
  createFan,
  getDefaultModelPath,
  getPosition,
  isLightbulb,
  isTelevision,
  isAirConditioner,
  isFan,
} from "./device";

import {
  createHome,
  createFloor,
  createRoom,
} from "./home";

export type {
  Device,
  Lightbulb,
  Television,
  AirConditioner,
  Fan,
  Home,
  Floor,
  Room,
};

export {
  DeviceType,
  createDevice,
  createLightbulb,
  createTelevision,
  createAirConditioner,
  createFan,
  createHome,
  createFloor,
  createRoom,
  getDefaultModelPath,
  getPosition,
  isLightbulb,
  isTelevision,
  isAirConditioner,
  isFan,
};