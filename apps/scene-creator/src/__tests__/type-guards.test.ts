import { describe, it, expect } from "vitest";
import {
  isLightbulb,
  isTelevision,
  isFan,
  isAirConditioner,
} from "../utils/type-guards";
import { DeviceType } from "../types";
import type { Device } from "../types";

function makeDevice(type: DeviceType): Device {
  const base = {
    id: "test-id",
    name: "Test",
    type,
    is_on: true,
    position: [0, 0, 0] as [number, number, number],
    rotation_y: 0,
    home_id: "h",
    home_name: "Home",
    floor_id: "f",
    floor_name: "Floor",
    room_id: "r",
    room_name: "Room",
  };

  switch (type) {
    case DeviceType.Lightbulb:
      return { ...base, type: DeviceType.Lightbulb, brightness: 100, colour: "#FFF" };
    case DeviceType.Television:
      return { ...base, type: DeviceType.Television, volume: 20, channel: 1, is_mute: false };
    case DeviceType.Fan:
      return { ...base, type: DeviceType.Fan, speed: 1, swing: false };
    case DeviceType.AirConditioner:
      return { ...base, type: DeviceType.AirConditioner, temperature: 24 };
    default:
      return { ...base, type: DeviceType.Chair } as Device;
  }
}

describe("isLightbulb", () => {
  it("returns true for Lightbulb device", () => {
    expect(isLightbulb(makeDevice(DeviceType.Lightbulb))).toBe(true);
  });
  it("returns false for non-Lightbulb device", () => {
    expect(isLightbulb(makeDevice(DeviceType.Fan))).toBe(false);
  });
});

describe("isTelevision", () => {
  it("returns true for Television device", () => {
    expect(isTelevision(makeDevice(DeviceType.Television))).toBe(true);
  });
  it("returns false for non-Television device", () => {
    expect(isTelevision(makeDevice(DeviceType.Lightbulb))).toBe(false);
  });
});

describe("isFan", () => {
  it("returns true for Fan device", () => {
    expect(isFan(makeDevice(DeviceType.Fan))).toBe(true);
  });
  it("returns false for non-Fan device", () => {
    expect(isFan(makeDevice(DeviceType.Television))).toBe(false);
  });
});

describe("isAirConditioner", () => {
  it("returns true for AirConditioner device", () => {
    expect(isAirConditioner(makeDevice(DeviceType.AirConditioner))).toBe(true);
  });
  it("returns false for non-AirConditioner device", () => {
    expect(isAirConditioner(makeDevice(DeviceType.Chair))).toBe(false);
  });
});
