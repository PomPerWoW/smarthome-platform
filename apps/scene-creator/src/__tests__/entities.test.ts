import { describe, it, expect, vi } from "vitest";
import { DeviceType } from "../types";

// Mock @iwsdk/core before importing entities
vi.mock("@iwsdk/core", () => ({
  Object3D: class Object3D {
    traverse(_cb: Function) {}
  },
  Mesh: class Mesh {},
  MeshStandardMaterial: class MeshStandardMaterial {},
  Color: class Color {
    constructor(_c?: any) {}
  },
  PointLight: class PointLight {
    name = "";
    position = { set: vi.fn() };
    color: any;
    intensity = 0;
    constructor() {}
  },
}));

import { Lightbulb } from "../entities/Lightbulb";
import { Fan } from "../entities/Fan";
import { Television } from "../entities/Television";
import { AirConditioner } from "../entities/AirConditioner";

function makeBase(type: DeviceType) {
  return {
    id: "e-1",
    name: "Entity Test",
    type,
    tag: "T",
    is_on: true,
    position: [1, 2, 3] as [number, number, number],
    rotation_y: 0.5,
    home_id: "h",
    home_name: "Home",
    floor_id: "f",
    floor_name: "Floor",
    room_id: "r",
    room_name: "Room",
  };
}

// ── Lightbulb ────────────────────────────────────────────────────────────────

describe("Lightbulb entity", () => {
  const data = {
    ...makeBase(DeviceType.Lightbulb),
    type: DeviceType.Lightbulb as const,
    brightness: 75,
    colour: "#00FF00",
  };

  it("initializes with correct properties", () => {
    const bulb = new Lightbulb(data);
    expect(bulb.brightness).toBe(75);
    expect(bulb.colour).toBe("#00FF00");
    expect(bulb.isOn).toBe(true);
  });

  it("toggle() flips isOn", () => {
    const bulb = new Lightbulb(data);
    expect(bulb.isOn).toBe(true);
    bulb.toggle();
    expect(bulb.isOn).toBe(false);
    bulb.toggle();
    expect(bulb.isOn).toBe(true);
  });

  it("setBrightness() clamps to 0–100", () => {
    const bulb = new Lightbulb(data);
    bulb.setBrightness(150);
    expect(bulb.brightness).toBe(100);
    bulb.setBrightness(-10);
    expect(bulb.brightness).toBe(0);
    bulb.setBrightness(42);
    expect(bulb.brightness).toBe(42);
  });

  it("setColour() updates colour", () => {
    const bulb = new Lightbulb(data);
    bulb.setColour("#AABBCC");
    expect(bulb.colour).toBe("#AABBCC");
  });

  it("getProperties() returns brightness and colour", () => {
    const bulb = new Lightbulb(data);
    expect(bulb.getProperties()).toEqual({
      brightness: 75,
      colour: "#00FF00",
    });
  });

  it("toJSON() includes all fields", () => {
    const bulb = new Lightbulb(data);
    const json = bulb.toJSON();
    expect(json.id).toBe("e-1");
    expect(json.type).toBe(DeviceType.Lightbulb);
    expect(json.is_on).toBe(true);
    expect(json.brightness).toBe(75);
    expect(json.colour).toBe("#00FF00");
    expect(json.position).toEqual([1, 2, 3]);
  });

  it("updateFromData() updates all fields", () => {
    const bulb = new Lightbulb(data);
    bulb.updateFromData({
      ...data,
      is_on: false,
      brightness: 10,
      colour: "#000000",
      position: [4, 5, 6],
    });
    expect(bulb.isOn).toBe(false);
    expect(bulb.brightness).toBe(10);
    expect(bulb.colour).toBe("#000000");
    expect(bulb.position).toEqual([4, 5, 6]);
  });

  it("getScale() returns a number from constants", () => {
    const bulb = new Lightbulb(data);
    expect(typeof bulb.getScale()).toBe("number");
    expect(bulb.getScale()).toBeGreaterThan(0);
  });
});

// ── Fan ──────────────────────────────────────────────────────────────────────

describe("Fan entity", () => {
  it("getProperties() returns speed and swing", () => {
    const fan = new Fan({
      ...makeBase(DeviceType.Fan),
      type: DeviceType.Fan as const,
      speed: 3,
      swing: true,
    });
    expect(fan.getProperties()).toEqual({ speed: 3, swing: true });
  });
});

// ── Television ───────────────────────────────────────────────────────────────

describe("Television entity", () => {
  it("getProperties() returns volume, channel, is_mute", () => {
    const tv = new Television({
      ...makeBase(DeviceType.Television),
      type: DeviceType.Television as const,
      volume: 50,
      channel: 7,
      is_mute: true,
    });
    expect(tv.getProperties()).toEqual({ volume: 50, channel: 7, is_mute: true });
  });
});

// ── AirConditioner ───────────────────────────────────────────────────────────

describe("AirConditioner entity", () => {
  it("getProperties() returns temperature", () => {
    const ac = new AirConditioner({
      ...makeBase(DeviceType.AirConditioner),
      type: DeviceType.AirConditioner as const,
      temperature: 22,
    });
    expect(ac.getProperties()).toEqual({ temperature: 22 });
  });
});
