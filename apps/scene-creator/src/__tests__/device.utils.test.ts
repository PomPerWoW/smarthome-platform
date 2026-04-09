import { describe, it, expect } from "vitest";
import {
  parseDeviceProperties,
  stringifyDeviceProperties,
  getDeviceProperties,
} from "../utils/device.utils";
import { DeviceType } from "../types";
import type { Device, Lightbulb, Television, Fan, AirConditioner } from "../types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBase(type: DeviceType) {
  return {
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
}

// ── parseDeviceProperties ────────────────────────────────────────────────────

describe("parseDeviceProperties", () => {
  it("parses valid JSON string", () => {
    const result = parseDeviceProperties<{ brightness: number }>(
      '{"brightness":75}',
    );
    expect(result).toEqual({ brightness: 75 });
  });

  it("returns empty object for invalid JSON", () => {
    const result = parseDeviceProperties("not-json");
    expect(result).toEqual({});
  });

  it("returns empty object for empty string", () => {
    const result = parseDeviceProperties("");
    expect(result).toEqual({});
  });
});

// ── stringifyDeviceProperties ────────────────────────────────────────────────

describe("stringifyDeviceProperties", () => {
  it("serializes properties to JSON string", () => {
    const json = stringifyDeviceProperties({ brightness: 50, colour: "#FFF" });
    expect(JSON.parse(json)).toEqual({ brightness: 50, colour: "#FFF" });
  });
});

// ── getDeviceProperties ──────────────────────────────────────────────────────

describe("getDeviceProperties", () => {
  it("returns brightness and colour for Lightbulb", () => {
    const device: Lightbulb = {
      ...makeBase(DeviceType.Lightbulb),
      type: DeviceType.Lightbulb,
      brightness: 80,
      colour: "#FF0000",
    };
    expect(getDeviceProperties(device)).toEqual({
      brightness: 80,
      colour: "#FF0000",
    });
  });

  it("returns volume, channel, is_mute for Television", () => {
    const device: Television = {
      ...makeBase(DeviceType.Television),
      type: DeviceType.Television,
      volume: 50,
      channel: 3,
      is_mute: false,
    };
    expect(getDeviceProperties(device)).toEqual({
      volume: 50,
      channel: 3,
      is_mute: false,
    });
  });

  it("returns speed and swing for Fan", () => {
    const device: Fan = {
      ...makeBase(DeviceType.Fan),
      type: DeviceType.Fan,
      speed: 3,
      swing: true,
    };
    expect(getDeviceProperties(device)).toEqual({ speed: 3, swing: true });
  });

  it("returns temperature for AirConditioner", () => {
    const device: AirConditioner = {
      ...makeBase(DeviceType.AirConditioner),
      type: DeviceType.AirConditioner,
      temperature: 24,
    };
    expect(getDeviceProperties(device)).toEqual({ temperature: 24 });
  });

  it("returns empty object for Chair types", () => {
    const device = {
      ...makeBase(DeviceType.Chair),
      type: DeviceType.Chair,
    } as Device;
    expect(getDeviceProperties(device)).toEqual({});
  });
});
