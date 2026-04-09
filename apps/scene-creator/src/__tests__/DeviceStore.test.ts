import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeviceType } from "../types";
import type { Device, Lightbulb } from "../types";

// Mock the API client and notification system before importing store
vi.mock("../api/BackendApiClient", () => ({
  BackendApiClient: class {},
  getApiClient: () => ({
    getFullHomeData: vi.fn().mockResolvedValue([]),
    getAllDevices: vi.fn().mockResolvedValue([]),
    getAllFurniture: vi.fn().mockResolvedValue([]),
    getRoomDevices: vi.fn().mockResolvedValue([]),
    getRoomFurniture: vi.fn().mockResolvedValue([]),
    getRoom: vi.fn().mockResolvedValue({ room_model: "LabPlan", room_model_file_url: null, home: "h1" }),
    getDevice: vi.fn().mockResolvedValue({}),
    getRooms: vi.fn().mockResolvedValue([]),
    createDevice: vi.fn().mockResolvedValue({}),
    setDeviceState: vi.fn().mockResolvedValue({}),
    setDevicePosition: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock("../api/deviceMapper", () => ({
  mapRawDeviceToDevice: (raw: any) => ({
    id: raw.id,
    name: raw.device_name ?? "Mapped",
    type: raw.type ?? DeviceType.Lightbulb,
    is_on: raw.is_on ?? true,
    position: [raw.device_pos?.x ?? 0, raw.device_pos?.y ?? 0, raw.device_pos?.z ?? 0],
    rotation_y: 0,
    home_id: "",
    home_name: "",
    floor_id: "",
    floor_name: "",
    room_id: raw.room_id ?? "",
    room_name: raw.room_name ?? "",
    brightness: 100,
    colour: "#FFF",
  }),
}));

vi.mock("../ui/SceneNotification", () => ({
  sceneNotify: vi.fn(),
  SN_ICONS: {
    lightbulb: "💡",
    fan: "🌀",
    snowflake: "❄️",
    tv: "📺",
    zap: "⚡",
    power: "⏻",
    sun: "☀️",
    palette: "🎨",
    volume2: "🔊",
    volumeX: "🔇",
    hash: "#",
    wind: "💨",
    rotateCw: "🔄",
    thermometer: "🌡️",
  },
}));

import { deviceStore, isFurnitureType, FURNITURE_TYPES } from "../store/DeviceStore";

function makeDevice(id: string, type: DeviceType = DeviceType.Lightbulb, extras: Partial<Device> = {}): Device {
  const base = {
    id,
    name: `Device ${id}`,
    type,
    is_on: true,
    position: [0, 1, -2] as [number, number, number],
    rotation_y: 0,
    home_id: "h1",
    home_name: "Home",
    floor_id: "f1",
    floor_name: "Floor",
    room_id: "r1",
    room_name: "Room",
  };

  switch (type) {
    case DeviceType.Lightbulb:
      return { ...base, type: DeviceType.Lightbulb, brightness: 100, colour: "#FFF", ...extras } as Lightbulb;
    case DeviceType.Fan:
      return { ...base, type: DeviceType.Fan, speed: 1, swing: false, ...extras } as any;
    default:
      return { ...base, type: DeviceType.Chair, ...extras } as any;
  }
}

// ── isFurnitureType ──────────────────────────────────────────────────────────

describe("isFurnitureType", () => {
  it("returns true for Chair types", () => {
    expect(isFurnitureType(DeviceType.Chair)).toBe(true);
    expect(isFurnitureType(DeviceType.Chair2)).toBe(true);
    expect(isFurnitureType(DeviceType.Chair6)).toBe(true);
  });

  it("returns false for non-Chair types", () => {
    expect(isFurnitureType(DeviceType.Lightbulb)).toBe(false);
    expect(isFurnitureType(DeviceType.Fan)).toBe(false);
    expect(isFurnitureType(DeviceType.SmartMeter)).toBe(false);
  });
});

describe("FURNITURE_TYPES set", () => {
  it("contains exactly 6 chair types", () => {
    expect(FURNITURE_TYPES.size).toBe(6);
  });
});

// ── DeviceStore getters ──────────────────────────────────────────────────────

describe("DeviceStore getters", () => {
  beforeEach(() => {
    // Reset store state with test devices
    deviceStore.setState({
      devices: [
        makeDevice("d1", DeviceType.Lightbulb),
        makeDevice("d2", DeviceType.Fan),
        makeDevice("d3", DeviceType.Lightbulb, { is_on: false } as any),
      ],
      furniture: [],
      homes: [],
      roomId: null,
      homeId: null,
      loading: false,
      error: null,
      selectedDeviceId: null,
      placementMode: null,
    });
  });

  it("getDeviceById() returns correct device", () => {
    const state = deviceStore.getState();
    expect(state.getDeviceById("d1")?.name).toBe("Device d1");
    expect(state.getDeviceById("nonexistent")).toBeUndefined();
  });

  it("getDevicesForRoom() filters by room_id", () => {
    const state = deviceStore.getState();
    expect(state.getDevicesForRoom("r1")).toHaveLength(3);
    expect(state.getDevicesForRoom("other-room")).toHaveLength(0);
  });

  it("getDeviceCount() returns total count", () => {
    const state = deviceStore.getState();
    expect(state.getDeviceCount()).toBe(3);
  });

  it("getActiveDevices() returns only is_on devices", () => {
    const state = deviceStore.getState();
    expect(state.getActiveDevices()).toHaveLength(2);
  });

  it("getSelectedDevice() returns null when nothing selected", () => {
    const state = deviceStore.getState();
    expect(state.getSelectedDevice()).toBeNull();
  });
});

// ── DeviceStore actions (sync) ───────────────────────────────────────────────

describe("DeviceStore sync actions", () => {
  beforeEach(() => {
    deviceStore.setState({
      devices: [makeDevice("d1", DeviceType.Lightbulb)],
      furniture: [],
      selectedDeviceId: null,
      placementMode: null,
    });
  });

  it("selectDevice() sets selectedDeviceId", () => {
    deviceStore.getState().selectDevice("d1");
    expect(deviceStore.getState().selectedDeviceId).toBe("d1");
    expect(deviceStore.getState().getSelectedDevice()?.id).toBe("d1");
  });

  it("clearSelection() resets selectedDeviceId", () => {
    deviceStore.getState().selectDevice("d1");
    deviceStore.getState().clearSelection();
    expect(deviceStore.getState().selectedDeviceId).toBeNull();
  });

  it("setPlacementMode() updates mode", () => {
    deviceStore.getState().setPlacementMode(DeviceType.Fan);
    expect(deviceStore.getState().placementMode).toBe(DeviceType.Fan);

    deviceStore.getState().setPlacementMode(null);
    expect(deviceStore.getState().placementMode).toBeNull();
  });

  it("handleDeviceUpdate() adds a new device", () => {
    deviceStore.getState().handleDeviceUpdate({
      id: "new-dev",
      device_name: "New Bulb",
      device_pos: { x: 1, y: 2, z: 3 },
      type: DeviceType.Lightbulb,
      is_on: true,
    });
    expect(deviceStore.getState().devices).toHaveLength(2);
    expect(deviceStore.getState().getDeviceById("new-dev")).toBeDefined();
  });

  it("handleDeviceUpdate() updates existing device", () => {
    deviceStore.getState().handleDeviceUpdate({
      id: "d1",
      device_name: "Updated Bulb",
      device_pos: { x: 5, y: 5, z: 5 },
      type: DeviceType.Lightbulb,
      is_on: false,
    });
    const updated = deviceStore.getState().getDeviceById("d1");
    expect(updated?.is_on).toBe(false);
    expect(updated?.position).toEqual([5, 5, 5]);
  });
});
