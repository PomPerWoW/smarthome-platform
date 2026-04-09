import { describe, it, expect } from "vitest";
import {
  mapRawDeviceToDevice,
  mapRawDevicesToDevices,
} from "../api/deviceMapper";
import { DeviceType } from "../types";

function makeRawDevice(overrides: Record<string, unknown> = {}) {
  return {
    id: "abc-123",
    device_name: "Test Bulb",
    device_pos: { x: 1, y: 2, z: 3 },
    type: "Lightbulb",
    tag: "TAG_01",
    room_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    room_name: "Living Room",
    home_id: "home-1",
    home_name: "My Home",
    floor_id: "floor-1",
    floor_name: "Ground",
    is_on: true,
    brightness: 80,
    colour: "#FFAA00",
    ...overrides,
  };
}

// ── mapRawDeviceToDevice ─────────────────────────────────────────────────────

describe("mapRawDeviceToDevice", () => {
  it("maps a Lightbulb correctly", () => {
    const device = mapRawDeviceToDevice(makeRawDevice());
    expect(device.type).toBe(DeviceType.Lightbulb);
    expect(device.id).toBe("abc-123");
    expect(device.name).toBe("Test Bulb");
    expect(device.position).toEqual([1, 2, 3]);
    expect(device.is_on).toBe(true);
    if (device.type === DeviceType.Lightbulb) {
      expect(device.brightness).toBe(80);
      expect(device.colour).toBe("#FFAA00");
    }
  });

  it("maps a Television with defaults", () => {
    const device = mapRawDeviceToDevice(
      makeRawDevice({ type: "Television", volume: undefined, channel: undefined, is_mute: undefined }),
    );
    expect(device.type).toBe(DeviceType.Television);
    if (device.type === DeviceType.Television) {
      expect(device.volume).toBe(20);
      expect(device.channel).toBe(1);
      expect(device.is_mute).toBe(false);
    }
  });

  it("maps a Fan correctly", () => {
    const device = mapRawDeviceToDevice(
      makeRawDevice({ type: "Fan", speed: 3, swing: true }),
    );
    expect(device.type).toBe(DeviceType.Fan);
    if (device.type === DeviceType.Fan) {
      expect(device.speed).toBe(3);
      expect(device.swing).toBe(true);
    }
  });

  it("maps an AirConditioner correctly", () => {
    const device = mapRawDeviceToDevice(
      makeRawDevice({ type: "AirConditioner", temperature: 22 }),
    );
    expect(device.type).toBe(DeviceType.AirConditioner);
    if (device.type === DeviceType.AirConditioner) {
      expect(device.temperature).toBe(22);
    }
  });

  it("maps a Chair correctly", () => {
    const device = mapRawDeviceToDevice(makeRawDevice({ type: "Chair" }));
    expect(device.type).toBe(DeviceType.Chair);
  });

  it("maps a SmartMeter correctly", () => {
    const device = mapRawDeviceToDevice(makeRawDevice({ type: "SmartMeter" }));
    expect(device.type).toBe(DeviceType.SmartMeter);
  });

  it("falls back to Chair for unknown types", () => {
    const device = mapRawDeviceToDevice(makeRawDevice({ type: "UnknownGizmo" }));
    expect(device.type).toBe(DeviceType.Chair);
  });

  it("uses default position when device_pos is null", () => {
    const device = mapRawDeviceToDevice(
      makeRawDevice({ device_pos: { x: null, y: null, z: null } }),
    );
    // Default for Lightbulb: [0, 1.5, -2]
    expect(device.position).toEqual([0, 1.5, -2]);
  });

  it("uses 'Unnamed Device' when device_name is empty", () => {
    const device = mapRawDeviceToDevice(makeRawDevice({ device_name: "" }));
    expect(device.name).toBe("Unnamed Device");
  });

  it("resolves room_id from UUID-like room field", () => {
    const device = mapRawDeviceToDevice(
      makeRawDevice({
        room_id: undefined,
        room: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        room_name: "Kitchen",
      }),
    );
    expect(device.room_id).toBe("f47ac10b-58cc-4372-a567-0e02b2c3d479");
    expect(device.room_name).toBe("Kitchen");
  });

  it("resolves room_name from non-UUID room field", () => {
    const device = mapRawDeviceToDevice(
      makeRawDevice({
        room_id: undefined,
        room: "Bedroom",
        room_name: undefined,
      }),
    );
    expect(device.room_id).toBe(""); // Not a UUID
    expect(device.room_name).toBe("Bedroom");
  });

  it("preserves device_rotation.y as rotation_y", () => {
    const device = mapRawDeviceToDevice(
      makeRawDevice({ device_rotation: { x: 0, y: 1.57, z: 0 } }),
    );
    expect(device.rotation_y).toBeCloseTo(1.57);
  });
});

// ── mapRawDevicesToDevices ───────────────────────────────────────────────────

describe("mapRawDevicesToDevices", () => {
  it("maps an array of raw devices", () => {
    const devices = mapRawDevicesToDevices([
      makeRawDevice({ type: "Lightbulb" }),
      makeRawDevice({ id: "xyz-789", type: "Fan", speed: 2, swing: false }),
    ]);
    expect(devices).toHaveLength(2);
    expect(devices[0].type).toBe(DeviceType.Lightbulb);
    expect(devices[1].type).toBe(DeviceType.Fan);
  });

  it("returns empty array for empty input", () => {
    expect(mapRawDevicesToDevices([])).toEqual([]);
  });
});
