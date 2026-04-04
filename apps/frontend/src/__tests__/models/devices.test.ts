import { describe, it, expect, vi } from "vitest";
import { DeviceFactory } from "@/models/devices/DeviceFactory";
import { Lightbulb } from "@/models/devices/Lightbulb";
import { Television } from "@/models/devices/Television";
import { Fan } from "@/models/devices/Fan";
import { AirConditioner } from "@/models/devices/AirConditioner";
import { SmartMeter } from "@/models/devices/SmartMeter";
import { GenericDevice } from "@/models/devices/GenericDevice";
import type { LightbulbDTO, TelevisionDTO, FanDTO, AirConditionerDTO, SmartMeterDTO } from "@/types/device.types";

// ─── Shared fixtures ────────────────────────────────────────────────────────

const baseFields = {
  id: "dev-001",
  device_name: "Test Device",
  device_pos: { x: 1, y: 2, z: 3 },
  room: "Living Room",
  tag: "TAG-001",
  is_on: true,
};

const lightbulbDTO: LightbulbDTO = {
  ...baseFields,
  type: "Lightbulb",
  brightness: 75,
  colour: "#ffaa00",
};

const televisionDTO: TelevisionDTO = {
  ...baseFields,
  type: "Television",
  volume: 50,
  channel: 5,
  is_mute: false,
};

const fanDTO: FanDTO = {
  ...baseFields,
  type: "Fan",
  speed: 3,
  swing: true,
};

const acDTO: AirConditionerDTO = {
  ...baseFields,
  type: "AirConditioner",
  temperature: 24,
};

const smartMeterDTO: SmartMeterDTO = {
  ...baseFields,
  type: "SmartMeter",
};

// ─── DeviceFactory ──────────────────────────────────────────────────────────

describe("DeviceFactory", () => {
  describe("create", () => {
    it("creates Lightbulb for type 'Lightbulb'", () => {
      const device = DeviceFactory.create(lightbulbDTO);
      expect(device).toBeInstanceOf(Lightbulb);
      expect(device.type).toBe("Lightbulb");
    });

    it("creates Television for type 'Television'", () => {
      const device = DeviceFactory.create(televisionDTO);
      expect(device).toBeInstanceOf(Television);
    });

    it("creates Fan for type 'Fan'", () => {
      const device = DeviceFactory.create(fanDTO);
      expect(device).toBeInstanceOf(Fan);
    });

    it("creates AirConditioner for type 'AirConditioner'", () => {
      const device = DeviceFactory.create(acDTO);
      expect(device).toBeInstanceOf(AirConditioner);
    });

    it("creates SmartMeter for type 'SmartMeter'", () => {
      const device = DeviceFactory.create(smartMeterDTO);
      expect(device).toBeInstanceOf(SmartMeter);
    });

    it("creates GenericDevice for unknown types", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const device = DeviceFactory.create({ ...baseFields, type: "Robot" });
      expect(device).toBeInstanceOf(GenericDevice);
      expect(device.getDisplayLabel()).toBe("Robot");
      spy.mockRestore();
    });
  });

  describe("update", () => {
    it("updates device fields from new data", () => {
      const device = DeviceFactory.create(lightbulbDTO);
      const updatedDTO: LightbulbDTO = {
        ...lightbulbDTO,
        device_name: "Updated Light",
        brightness: 30,
        colour: "#00ff00",
        is_on: false,
        tag: "NEW-TAG",
      };

      DeviceFactory.update(device, updatedDTO);

      expect(device.name).toBe("Updated Light");
      expect(device.is_on).toBe(false);
      expect(device.tag).toBe("NEW-TAG");
      expect((device as Lightbulb).brightness).toBe(30);
    });

    it("throws on type mismatch", () => {
      const device = DeviceFactory.create(lightbulbDTO);
      expect(() => {
        DeviceFactory.update(device, { ...televisionDTO });
      }).toThrow("Device type mismatch");
    });
  });
});

// ─── Lightbulb ──────────────────────────────────────────────────────────────

describe("Lightbulb", () => {
  it("constructs from DTO with correct properties", () => {
    const light = new Lightbulb(lightbulbDTO);
    expect(light.brightness).toBe(75);
    expect(light.colour).toBe("#ffaa00");
    expect(light.id).toBe("dev-001");
    expect(light.name).toBe("Test Device");
  });

  it("getProperties returns all fields", () => {
    const light = new Lightbulb(lightbulbDTO);
    expect(light.getProperties()).toEqual({
      is_on: true,
      brightness: 75,
      colour: "#ffaa00",
    });
  });

  it("getIcon returns 'lightbulb'", () => {
    expect(new Lightbulb(lightbulbDTO).getIcon()).toBe("lightbulb");
  });

  it("getDisplayLabel returns 'Smart Bulb'", () => {
    expect(new Lightbulb(lightbulbDTO).getDisplayLabel()).toBe("Smart Bulb");
  });

  describe("setBrightness", () => {
    it("clamps to 0-100 range", () => {
      const light = new Lightbulb(lightbulbDTO);

      light.setBrightness(150);
      expect(light.brightness).toBe(100);

      light.setBrightness(-10);
      expect(light.brightness).toBe(0);

      light.setBrightness(50);
      expect(light.brightness).toBe(50);
    });
  });

  it("setColour updates colour", () => {
    const light = new Lightbulb(lightbulbDTO);
    light.setColour("#ff0000");
    expect(light.colour).toBe("#ff0000");
  });

  it("updateFromData updates all properties", () => {
    const light = new Lightbulb(lightbulbDTO);
    light.updateFromData({
      ...lightbulbDTO,
      device_name: "Updated",
      brightness: 10,
      colour: "#000000",
    });
    expect(light.name).toBe("Updated");
    expect(light.brightness).toBe(10);
    expect(light.colour).toBe("#000000");
  });
});

// ─── Television ─────────────────────────────────────────────────────────────

describe("Television", () => {
  it("constructs from DTO with correct properties", () => {
    const tv = new Television(televisionDTO);
    expect(tv.volume).toBe(50);
    expect(tv.channel).toBe(5);
    expect(tv.isMute).toBe(false);
  });

  it("getProperties returns all fields", () => {
    const tv = new Television(televisionDTO);
    expect(tv.getProperties()).toEqual({
      is_on: true,
      volume: 50,
      channel: 5,
      is_mute: false,
    });
  });

  it("getIcon returns 'tv'", () => {
    expect(new Television(televisionDTO).getIcon()).toBe("tv");
  });

  it("getDisplayLabel returns 'Smart TV'", () => {
    expect(new Television(televisionDTO).getDisplayLabel()).toBe("Smart TV");
  });

  describe("setVolume", () => {
    it("clamps to 0-100 range", () => {
      const tv = new Television(televisionDTO);

      tv.setVolume(120);
      expect(tv.volume).toBe(100);

      tv.setVolume(-5);
      expect(tv.volume).toBe(0);
    });
  });

  describe("setChannel", () => {
    it("clamps minimum to 1", () => {
      const tv = new Television(televisionDTO);

      tv.setChannel(0);
      expect(tv.channel).toBe(1);

      tv.setChannel(99);
      expect(tv.channel).toBe(99);
    });
  });

  describe("toggleMute", () => {
    it("toggles mute state", () => {
      const tv = new Television(televisionDTO);
      expect(tv.isMute).toBe(false);

      tv.toggleMute();
      expect(tv.isMute).toBe(true);

      tv.toggleMute();
      expect(tv.isMute).toBe(false);
    });
  });
});

// ─── Fan ────────────────────────────────────────────────────────────────────

describe("Fan", () => {
  it("constructs from DTO with correct properties", () => {
    const fan = new Fan(fanDTO);
    expect(fan.speed).toBe(3);
    expect(fan.swing).toBe(true);
  });

  it("getProperties returns all fields", () => {
    const fan = new Fan(fanDTO);
    expect(fan.getProperties()).toEqual({
      is_on: true,
      speed: 3,
      swing: true,
    });
  });

  it("getIcon returns 'fan'", () => {
    expect(new Fan(fanDTO).getIcon()).toBe("fan");
  });

  it("getDisplayLabel returns 'Tower Fan'", () => {
    expect(new Fan(fanDTO).getDisplayLabel()).toBe("Tower Fan");
  });

  describe("setSpeed", () => {
    it("clamps to 0-5 range", () => {
      const fan = new Fan(fanDTO);

      fan.setSpeed(10);
      expect(fan.speed).toBe(5);

      fan.setSpeed(-1);
      expect(fan.speed).toBe(0);

      fan.setSpeed(3);
      expect(fan.speed).toBe(3);
    });
  });

  describe("toggleSwing", () => {
    it("toggles swing state", () => {
      const fan = new Fan(fanDTO);
      expect(fan.swing).toBe(true);

      fan.toggleSwing();
      expect(fan.swing).toBe(false);

      fan.toggleSwing();
      expect(fan.swing).toBe(true);
    });
  });
});

// ─── AirConditioner ─────────────────────────────────────────────────────────

describe("AirConditioner", () => {
  it("constructs from DTO with correct properties", () => {
    const ac = new AirConditioner(acDTO);
    expect(ac.temperature).toBe(24);
  });

  it("getProperties returns all fields", () => {
    const ac = new AirConditioner(acDTO);
    expect(ac.getProperties()).toEqual({
      is_on: true,
      temperature: 24,
    });
  });

  it("getIcon returns 'snowflake'", () => {
    expect(new AirConditioner(acDTO).getIcon()).toBe("snowflake");
  });

  it("getDisplayLabel returns 'Air Conditioner'", () => {
    expect(new AirConditioner(acDTO).getDisplayLabel()).toBe("Air Conditioner");
  });

  describe("setTemperature", () => {
    it("clamps to 16-30 range", () => {
      const ac = new AirConditioner(acDTO);

      ac.setTemperature(10);
      expect(ac.temperature).toBe(16);

      ac.setTemperature(35);
      expect(ac.temperature).toBe(30);

      ac.setTemperature(22);
      expect(ac.temperature).toBe(22);
    });
  });
});

// ─── SmartMeter ─────────────────────────────────────────────────────────────

describe("SmartMeter", () => {
  it("constructs from DTO", () => {
    const sm = new SmartMeter(smartMeterDTO);
    expect(sm.id).toBe("dev-001");
    expect(sm.type).toBe("SmartMeter");
  });

  it("getProperties returns only is_on", () => {
    const sm = new SmartMeter(smartMeterDTO);
    expect(sm.getProperties()).toEqual({ is_on: true });
  });

  it("getIcon returns 'activity'", () => {
    expect(new SmartMeter(smartMeterDTO).getIcon()).toBe("activity");
  });

  it("getDisplayLabel returns 'Smart Meter'", () => {
    expect(new SmartMeter(smartMeterDTO).getDisplayLabel()).toBe("Smart Meter");
  });
});

// ─── GenericDevice ──────────────────────────────────────────────────────────

describe("GenericDevice", () => {
  it("uses the type from data as-is", () => {
    const device = new GenericDevice({ ...baseFields, type: "Unknown" });
    expect(device.type).toBe("Unknown");
  });

  it("getProperties returns empty object", () => {
    const device = new GenericDevice({ ...baseFields, type: "Unknown" });
    expect(device.getProperties()).toEqual({});
  });

  it("getDisplayLabel returns the type name", () => {
    const device = new GenericDevice({ ...baseFields, type: "Robot" });
    expect(device.getDisplayLabel()).toBe("Robot");
  });

  it("getIcon returns fallback icon", () => {
    const device = new GenericDevice({ ...baseFields, type: "Unknown" });
    expect(device.getIcon()).toBe("HelpCircle");
  });
});

// ─── BaseDevice.toJSON ──────────────────────────────────────────────────────

describe("BaseDevice.toJSON", () => {
  it("includes base fields and device-specific properties", () => {
    const light = new Lightbulb(lightbulbDTO);
    const json = light.toJSON();

    expect(json.id).toBe("dev-001");
    expect(json.device_name).toBe("Test Device");
    expect(json.type).toBe("Lightbulb");
    expect(json.is_on).toBe(true);
    expect(json.brightness).toBe(75);
    expect(json.colour).toBe("#ffaa00");
  });
});
