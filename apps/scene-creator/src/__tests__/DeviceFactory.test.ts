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

import { DeviceFactory } from "../entities/DeviceFactory";
import { Lightbulb } from "../entities/Lightbulb";
import { Television } from "../entities/Television";
import { Fan } from "../entities/Fan";
import { AirConditioner } from "../entities/AirConditioner";
import { Chair } from "../entities/Chair";
import { SmartMeter } from "../entities/SmartMeter";

function makeDeviceData(type: DeviceType, extras: Record<string, unknown> = {}) {
  return {
    id: "dev-1",
    name: "Test Device",
    type,
    tag: "T_001",
    is_on: true,
    position: [0, 1, -2] as [number, number, number],
    rotation_y: 0,
    home_id: "h1",
    home_name: "Home",
    floor_id: "f1",
    floor_name: "Floor",
    room_id: "r1",
    room_name: "Room",
    ...extras,
  } as any;
}

describe("DeviceFactory.create", () => {
  it("creates a Lightbulb entity", () => {
    const entity = DeviceFactory.create(
      makeDeviceData(DeviceType.Lightbulb, { brightness: 80, colour: "#FFF" }),
    );
    expect(entity).toBeInstanceOf(Lightbulb);
    expect(entity.type).toBe(DeviceType.Lightbulb);
  });

  it("creates a Television entity", () => {
    const entity = DeviceFactory.create(
      makeDeviceData(DeviceType.Television, { volume: 50, channel: 3, is_mute: false }),
    );
    expect(entity).toBeInstanceOf(Television);
  });

  it("creates a Fan entity", () => {
    const entity = DeviceFactory.create(
      makeDeviceData(DeviceType.Fan, { speed: 3, swing: true }),
    );
    expect(entity).toBeInstanceOf(Fan);
  });

  it("creates an AirConditioner entity", () => {
    const entity = DeviceFactory.create(
      makeDeviceData(DeviceType.AirConditioner, { temperature: 22 }),
    );
    expect(entity).toBeInstanceOf(AirConditioner);
  });

  it("creates a Chair entity for Chair type", () => {
    const entity = DeviceFactory.create(makeDeviceData(DeviceType.Chair));
    expect(entity).toBeInstanceOf(Chair);
  });

  it("creates a SmartMeter entity", () => {
    const entity = DeviceFactory.create(makeDeviceData(DeviceType.SmartMeter));
    expect(entity).toBeInstanceOf(SmartMeter);
  });

  it("falls back to Chair for unknown type", () => {
    const entity = DeviceFactory.create(makeDeviceData("UnknownThing" as DeviceType));
    expect(entity).toBeInstanceOf(Chair);
  });
});

describe("DeviceFactory.update", () => {
  it("updates an entity from new data", () => {
    const entity = DeviceFactory.create(
      makeDeviceData(DeviceType.Lightbulb, { brightness: 50, colour: "#000" }),
    ) as Lightbulb;

    DeviceFactory.update(
      entity,
      makeDeviceData(DeviceType.Lightbulb, { brightness: 90, colour: "#FFF", is_on: false }),
    );

    expect(entity.brightness).toBe(90);
    expect(entity.colour).toBe("#FFF");
    expect(entity.isOn).toBe(false);
  });

  it("throws on type mismatch", () => {
    const entity = DeviceFactory.create(
      makeDeviceData(DeviceType.Lightbulb, { brightness: 50, colour: "#000" }),
    );

    expect(() =>
      DeviceFactory.update(entity, makeDeviceData(DeviceType.Fan, { speed: 1, swing: false })),
    ).toThrow("Device type mismatch");
  });
});
