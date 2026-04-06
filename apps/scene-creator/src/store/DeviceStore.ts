import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { BackendApiClient, getApiClient } from "../api/BackendApiClient";
import { mapRawDeviceToDevice } from "../api/deviceMapper";
import {
  Device,
  DeviceType,
  Home,
  Lightbulb,
  Television,
  Fan,
  AirConditioner,
} from "../types";
import { sceneNotify, SN_ICONS } from "../ui/SceneNotification";

export interface FurnitureItem {
  id: string;
  furniture_name: string;
  furniture_type: string;
  position: [number, number, number];
  rotation_y: number;
  room: string;
}

export const FURNITURE_TYPES: Set<DeviceType> = new Set([
  DeviceType.Chair,
  DeviceType.Chair2,
  DeviceType.Chair3,
  DeviceType.Chair4,
  DeviceType.Chair5,
  DeviceType.Chair6,
]);

export function isFurnitureType(type: DeviceType): boolean {
  return FURNITURE_TYPES.has(type);
}

interface DeviceState {
  // State
  devices: Device[];
  furniture: FurnitureItem[];
  homes: Home[];
  roomModel: string;
  roomModelFileUrl: string | null;
  roomId: string | null;
  homeId: string | null;
  loading: boolean;
  error: string | null;
  selectedDeviceId: string | null;
  placementMode: DeviceType | null;

  // Actions
  loadAllData: () => Promise<void>;
  loadRoomData: (roomId: string) => Promise<void>;
  refreshDevices: () => Promise<void>;
  refreshSingleDevice: (deviceId: string) => Promise<void>;

  createDevice: (
    type: DeviceType,
    name: string,
    position: [number, number, number],
    rotationY: number,
  ) => Promise<void>;
  createFurniture: (
    type: DeviceType,
    name: string,
    position: [number, number, number],
    rotationY: number,
  ) => Promise<void>;
  updateFurniturePosition: (
    furnitureId: string,
    x: number,
    y: number,
    z: number,
    rotationY?: number,
  ) => Promise<void>;
  handleDeviceUpdate: (rawDevice: any) => void;
  toggleDevice: (deviceId: string, on?: boolean) => Promise<void>;
  updateDevicePosition: (
    deviceId: string,
    x: number,
    y: number,
    z: number,
    rotationY?: number,
  ) => Promise<void>;
  updateRoomAlignment: (
    roomId: string,
    x: number,
    y: number,
    z: number,
    rotationY: number,
    anchorUuid?: string,
  ) => Promise<void>;
  updateLightbulb: (
    deviceId: string,
    options: { brightness?: number; colour?: string },
  ) => Promise<void>;
  updateTelevision: (
    deviceId: string,
    options: { volume?: number; channel?: number; is_mute?: boolean },
  ) => Promise<void>;
  updateFan: (
    deviceId: string,
    options: { speed?: number; swing?: boolean },
  ) => Promise<void>;
  updateAirConditioner: (
    deviceId: string,
    options: { temperature?: number },
  ) => Promise<void>;
  selectDevice: (deviceId: string | null) => void;
  setPlacementMode: (type: DeviceType | null) => void;
  clearSelection: () => void;

  // Getters
  getDeviceById: (id: string) => Device | undefined;
  getDevicesForRoom: (roomId: string) => Device[];
  getSelectedDevice: () => Device | null;
  getDevicesByType: () => Record<DeviceType, Device[]>;
  getDevicesByRoom: () => Record<
    string,
    { roomName: string; floorName: string; devices: Device[] }
  >;
  getDeviceCount: () => number;
  getActiveDevices: () => Device[];
  getLightbulb: (id: string) => Lightbulb | undefined;
  getTelevision: (id: string) => Television | undefined;
  getFan: (id: string) => Fan | undefined;
  getAirConditioner: (id: string) => AirConditioner | undefined;
}

// ─── Device notification helpers ─────────────────────────────────────────────

function _devIcon(type: DeviceType): {
  icon: string;
  iconBg: string;
  iconFg: string;
} {
  switch (type) {
    case DeviceType.Lightbulb:
      return {
        icon: SN_ICONS.lightbulb,
        iconBg: "rgba(234,179,8,0.15)",
        iconFg: "#eab308",
      };
    case DeviceType.Fan:
      return {
        icon: SN_ICONS.fan,
        iconBg: "rgba(34,211,238,0.15)",
        iconFg: "#22d3ee",
      };
    case DeviceType.AirConditioner:
      return {
        icon: SN_ICONS.snowflake,
        iconBg: "rgba(56,189,248,0.15)",
        iconFg: "#38bdf8",
      };
    case DeviceType.Television:
      return {
        icon: SN_ICONS.tv,
        iconBg: "rgba(99,102,241,0.15)",
        iconFg: "#6366f1",
      };
    default:
      return {
        icon: SN_ICONS.zap,
        iconBg: "rgba(59,130,246,0.15)",
        iconFg: "#3b82f6",
      };
  }
}

function _devTypeName(type: DeviceType): string {
  switch (type) {
    case DeviceType.Lightbulb:
      return "Light";
    case DeviceType.Fan:
      return "Fan";
    case DeviceType.AirConditioner:
      return "AC";
    case DeviceType.Television:
      return "TV";
    default:
      return "Device";
  }
}

const FAN_SPEED_LABELS = [
  "Off",
  "Low",
  "Med-Low",
  "Medium",
  "Med-High",
  "High",
];

// ─────────────────────────────────────────────────────────────────────────────

const api: BackendApiClient = getApiClient();

export const deviceStore = createStore<DeviceState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    devices: [],
    furniture: [],
    homes: [],
    roomModel: "LabPlan",
    roomModelFileUrl: null,
    roomId: null,
    homeId: null,
    loading: false,
    error: null,
    selectedDeviceId: null,
    placementMode: null,

    // Actions
    loadAllData: async () => {
      set({ loading: true, error: null });
      try {
        console.log("[Store] Loading all data from backend...");
        const [homes, devices, rawFurniture] = await Promise.all([
          api.getFullHomeData(),
          api.getAllDevices(),
          api.getAllFurniture(),
        ]);
        console.log(
          "[Store] Raw devices data:",
          JSON.stringify(devices, null, 2),
        );
        const furniture: FurnitureItem[] = rawFurniture.map((f: any) => ({
          id: f.id,
          furniture_name: f.furniture_name,
          furniture_type: f.furniture_type,
          position: [
            f.device_pos?.x ?? 0,
            f.device_pos?.y ?? 0,
            f.device_pos?.z ?? 0,
          ] as [number, number, number],
          rotation_y: f.device_rotation?.y ?? 0,
          room: f.room || "",
        }));
        set({ homes, devices, furniture, loading: false });
        // Ensure at least 1 SmartMeter exists for the Scene Creator Showcase
        const hasSmartMeter = devices.some(d => d.type === DeviceType.SmartMeter);
        if (!hasSmartMeter) {
          console.log("[Store] Injecting missing SmartMeter for AR showcase...");
          devices.push({
            id: "local-smartmeter-mock-01",
            name: "Smart Meter Demo",
            type: DeviceType.SmartMeter,
            is_on: true,
            position: [0.6, 2.0, -0.8],
            rotation_y: 0,
            tag: "smartmeter-raspi.meter-1phase-01",
            home_id: "local_home",
            home_name: "Local Home",
            floor_id: "local_floor",
            floor_name: "Local Floor",
            room_id: "local_room",
            room_name: "Lab Room",
          });
        }

        set({ homes, devices, loading: false });
        console.log(
          `[Store] Loaded ${homes.length} homes, ${devices.length} devices, ${furniture.length} furniture`,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load data";
        set({ error: message, loading: false });
        console.error("[Store] Failed to load data:", err);
      }
    },

    loadRoomData: async (roomId: string) => {
      set({ loading: true, error: null });
      try {
        console.log(`[Store] Loading data for room ${roomId}...`);

        // Fetch room details to get room_model and model file URL
        const roomData = await api.getRoom(roomId);
        const roomModel = roomData.room_model || "LabPlan";
        const roomModelFileUrl = roomData.room_model_file_url || null;
        const homeId = roomData.home;

        // Fetch room-specific devices and furniture in parallel
        const [devices, rawFurniture] = await Promise.all([
          api.getRoomDevices(roomId),
          api.getRoomFurniture(roomId),
        ]);

        const furniture: FurnitureItem[] = rawFurniture.map((f: any) => ({
          id: f.id,
          furniture_name: f.furniture_name,
          furniture_type: f.furniture_type,
          position: [
            f.device_pos?.x ?? 0,
            f.device_pos?.y ?? 0,
            f.device_pos?.z ?? 0,
          ] as [number, number, number],
          rotation_y: f.device_rotation?.y ?? 0,
          room: f.room || "",
        }));

        set({
          devices,
          furniture,
          roomModel,
          roomModelFileUrl,
          roomId,
          homeId,
          loading: false,
        });

        console.log(
          `[Store] Loaded room "${roomData.room_name}": model=${roomModel}, modelFileUrl=${roomModelFileUrl || "none"}, ${devices.length} devices, ${furniture.length} furniture`,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load room data";
        set({ error: message, loading: false });
        console.error("[Store] Failed to load room data:", err);
      }
    },

    refreshDevices: async () => {
      try {
        console.log("[Store] Refreshing devices...");
        // If we have a roomId, refresh only that room's devices
        const { roomId } = get();
        let devices: Device[];
        if (roomId) {
          devices = await api.getRoomDevices(roomId);
        } else {
          devices = await api.getAllDevices();
        }
        set({ devices });
        console.log(`[Store] Refreshed ${devices.length} devices`);
      } catch (err) {
        console.error("[Store] Failed to refresh devices:", err);
      }
    },

    refreshSingleDevice: async (deviceId: string) => {
      try {
        console.log(`[Store] Refreshing single device: ${deviceId}`);
        const updatedDevice = await api.getDevice(deviceId);

        set((state) => {
          const existingIndex = state.devices.findIndex(
            (d) => d.id === deviceId,
          );

          if (existingIndex >= 0) {
            const existingDevice = state.devices[existingIndex];
            // Preserve position from existing device if updated device has default position
            const mergedDevice = {
              ...updatedDevice,
              position:
                updatedDevice.position[0] !== 0 ||
                  updatedDevice.position[1] !== 0 ||
                  updatedDevice.position[2] !== 0
                  ? updatedDevice.position
                  : existingDevice.position,
            };

            const newDevices = [...state.devices];
            newDevices[existingIndex] = mergedDevice;
            console.log(`[Store] Updated device ${deviceId}:`, mergedDevice);
            return { devices: newDevices };
          } else {
            // New device, add it
            console.log(`[Store] Added new device ${deviceId}`);
            return { devices: [...state.devices, updatedDevice] };
          }
        });
      } catch (err) {
        console.error(`[Store] Failed to refresh device ${deviceId}:`, err);
      }
    },

    createDevice: async (type, name, position, rotationY) => {
      try {
        console.log(`[Store] Creating device of type ${type} named "${name}"`);

        // Fetch available rooms to assign the device to
        let roomId = "";
        try {
          const params = new URLSearchParams(window.location.search);
          const urlRoomId = params.get("roomId");

          if (urlRoomId) {
            roomId = urlRoomId;
          } else {
            const rooms = await api.getRooms();
            if (rooms && rooms.length > 0) {
              roomId = rooms[0].id;
            }
          }
        } catch (roomErr) {
          console.error(
            "[Store] Could not fetch valid rooms. Using default.",
            roomErr,
          );
        }

        const newDevice = await api.createDevice({
          type: type,
          device_name: name,
          room: roomId,
          position: position,
          rotation_y: rotationY,
        });
        set((state) => ({ devices: [...state.devices, newDevice] }));
        console.log(`[Store] Created device ${newDevice.id} "${name}"`);
      } catch (err) {
        console.error("[Store] Failed to create device:", err);
      }
    },

    createFurniture: async (type, name, position, rotationY) => {
      try {
        console.log(
          `[Store] Creating furniture of type ${type} named "${name}"`,
        );

        let roomId = "";
        try {
          const params = new URLSearchParams(window.location.search);
          const urlRoomId = params.get("roomId");

          if (urlRoomId) {
            roomId = urlRoomId;
          } else {
            const rooms = await api.getRooms();
            if (rooms && rooms.length > 0) {
              roomId = rooms[0].id;
            }
          }
        } catch (roomErr) {
          console.error(
            "[Store] Could not fetch valid rooms. Using default.",
            roomErr,
          );
        }

        const newFurniture = await api.createFurniture({
          furniture_name: name,
          furniture_type: type,
          room: roomId,
          position: position,
          rotation_y: rotationY,
        });

        const item: FurnitureItem = {
          id: newFurniture.id,
          furniture_name: name,
          furniture_type: type,
          position: position,
          rotation_y: rotationY,
          room: newFurniture.room || "",
        };
        set((state) => ({ furniture: [...state.furniture, item] }));
        console.log(`[Store] Created furniture ${newFurniture.id} "${name}"`);
      } catch (err) {
        console.error("[Store] Failed to create furniture:", err);
      }
    },

    updateFurniturePosition: async (furnitureId, x, y, z, rotationY) => {
      try {
        console.log(`[Store] Updating position for furniture ${furnitureId}:`, {
          x,
          y,
          z,
          rotationY,
        });
        await api.setFurniturePosition(furnitureId, {
          x,
          y,
          z,
          rotation_y: rotationY,
        });
        set((state) => ({
          furniture: state.furniture.map((f) =>
            f.id === furnitureId
              ? {
                ...f,
                position: [x, y, z] as [number, number, number],
                rotation_y: rotationY ?? f.rotation_y,
              }
              : f,
          ),
        }));
      } catch (err) {
        console.error("[Store] Failed to update furniture position:", err);
        throw err;
      }
    },

    handleDeviceUpdate: (rawDevice) => {
      try {
        console.log("[Store] Handling real-time device update:", rawDevice);
        const updatedDevice = mapRawDeviceToDevice(rawDevice);

        set((state) => {
          const existingIndex = state.devices.findIndex(
            (d) => d.id === updatedDevice.id,
          );

          if (existingIndex >= 0) {
            // Update existing device, preserving position if not provided
            const existingDevice = state.devices[existingIndex];
            const mergedDevice = {
              ...existingDevice,
              ...updatedDevice,
              // Preserve position if the update doesn't include it
              position:
                updatedDevice.position[0] !== 0 ||
                  updatedDevice.position[1] !== 0 ||
                  updatedDevice.position[2] !== 0
                  ? updatedDevice.position
                  : existingDevice.position,
            };

            const newDevices = [...state.devices];
            newDevices[existingIndex] = mergedDevice;
            console.log(
              `[Store] Updated device ${updatedDevice.id}:`,
              mergedDevice,
            );
            return { devices: newDevices };
          } else {
            // Add new device
            console.log(`[Store] Added new device ${updatedDevice.id}`);
            return { devices: [...state.devices, updatedDevice] };
          }
        });
      } catch (err) {
        console.error("[Store] Failed to handle device update:", err);
      }
    },

    toggleDevice: async (deviceId, on) => {
      try {
        const device = get().getDeviceById(deviceId);
        if (!device) {
          console.warn(`[Store] Cannot toggle non-existent device ${deviceId}`);
          return;
        }

        const nextState = on ?? !device.is_on;
        console.log(`[Store] Toggling device ${deviceId} to ${nextState}`);

        const updated = await api.setDeviceState(deviceId, {
          is_on: nextState,
        });
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
        // ── notification ──────────────────────────────────────────────────────
        const { icon, iconBg, iconFg } = _devIcon(device.type);
        sceneNotify({
          title: nextState
            ? `${_devTypeName(device.type)} turned on`
            : `${_devTypeName(device.type)} turned off`,
          description: `'${device.name}' is now ${nextState ? "on" : "off"}`,
          severity: nextState ? "success" : "info",
          icon: nextState ? icon : SN_ICONS.power,
          iconBg: nextState ? iconBg : "rgba(100,116,139,0.15)",
          iconFg: nextState ? iconFg : "#64748b",
        });
      } catch (err) {
        console.error("[Store] Failed to toggle device:", err);
        throw err;
      }
    },

    updateDevicePosition: async (deviceId, x, y, z, rotationY) => {
      try {
        const existing = get().getDeviceById(deviceId);
        // Furniture uses `updateFurniturePosition` and persists Y. Smart devices only
        // move on the floor plan here: keep the last stored Y (server / defaults), not scene Y.
        const yPersist = existing ? existing.position[1] : y;
        console.log(`[Store] Updating position for device ${deviceId}:`, {
          x,
          y: yPersist,
          z,
          rotationY,
        });
        const updated = await api.setDevicePosition(deviceId, {
          x: x,
          y: yPersist,
          z: z,
          rotation_y: rotationY,
        });
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
      } catch (err) {
        console.error("[Store] Failed to update position:", err);
        throw err;
      }
    },

    updateRoomAlignment: async (roomId, x, y, z, rotationY, anchorUuid) => {
      try {
        console.log(`[Store] Updating alignment for room ${roomId}:`, {
          x,
          y,
          z,
          rotationY,
          anchorUuid,
        });

        await api.setRoomAlignment(roomId, {
          x,
          y,
          z,
          rotation_y: rotationY,
          anchor_uuid: anchorUuid,
        });

        // Updating homes in store to reflect the new room alignment is generally
        // a good idea, but getting the updated room state or full homes refresh
        // might be needed. Let's do a full reload of homes to be safe and simple:
        const homes = await api.getFullHomeData();
        set({ homes });
      } catch (err) {
        console.error("[Store] Failed to update room alignment:", err);
        throw err;
      }
    },

    updateLightbulb: async (deviceId, options) => {
      try {
        const device = get().getDeviceById(deviceId);
        console.log(`[Store] Updating lightbulb ${deviceId}:`, options);
        const updated = await api.setLightbulb(deviceId, options);
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
        if (options.colour !== undefined) {
          sceneNotify({
            title: "Light color changed",
            description: `'${device?.name ?? "Light"}' color updated`,
            severity: "info",
            icon: SN_ICONS.palette,
            iconBg: "rgba(168,85,247,0.15)",
            iconFg: "#a855f7",
            colorValue: options.colour,
          });
        }
        if (options.brightness !== undefined) {
          sceneNotify({
            title: "Brightness adjusted",
            description: `'${device?.name ?? "Light"}' set to ${options.brightness}%`,
            severity: "info",
            icon: SN_ICONS.sun,
            iconBg: "rgba(234,179,8,0.15)",
            iconFg: "#eab308",
            badge: `${options.brightness}%`,
          });
        }
      } catch (err) {
        console.error("[Store] Failed to update lightbulb:", err);
        throw err;
      }
    },

    updateTelevision: async (deviceId, options) => {
      try {
        const device = get().getDeviceById(deviceId);
        console.log(`[Store] Updating television ${deviceId}:`, options);
        const updated = await api.setTelevision(deviceId, options);
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
        if (options.volume !== undefined) {
          sceneNotify({
            title: "Volume adjusted",
            description: `'${device?.name ?? "TV"}' volume → ${options.volume}%`,
            severity: "info",
            icon: SN_ICONS.volume2,
            iconBg: "rgba(99,102,241,0.15)",
            iconFg: "#6366f1",
            badge: `${options.volume}%`,
          });
        }
        if (options.channel !== undefined) {
          sceneNotify({
            title: "Channel changed",
            description: `'${device?.name ?? "TV"}' → channel ${options.channel}`,
            severity: "info",
            icon: SN_ICONS.hash,
            iconBg: "rgba(99,102,241,0.15)",
            iconFg: "#6366f1",
            badge: `ch ${options.channel}`,
          });
        }
        if (options.is_mute !== undefined) {
          sceneNotify({
            title: options.is_mute ? "TV muted" : "TV unmuted",
            description: `'${device?.name ?? "TV"}' ${options.is_mute ? "audio muted" : "audio restored"}`,
            severity: "info",
            icon: options.is_mute ? SN_ICONS.volumeX : SN_ICONS.volume2,
            iconBg: "rgba(99,102,241,0.15)",
            iconFg: "#6366f1",
          });
        }
      } catch (err) {
        console.error("[Store] Failed to update television:", err);
        throw err;
      }
    },

    updateFan: async (deviceId, options) => {
      try {
        const device = get().getDeviceById(deviceId);
        console.log(`[Store] Updating fan ${deviceId}:`, options);
        const updated = await api.setFan(deviceId, options);
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
        if (options.speed !== undefined) {
          sceneNotify({
            title: "Fan speed changed",
            description: `'${device?.name ?? "Fan"}' → ${FAN_SPEED_LABELS[options.speed] ?? options.speed}`,
            severity: "info",
            icon: SN_ICONS.wind,
            iconBg: "rgba(34,211,238,0.15)",
            iconFg: "#22d3ee",
            badge: FAN_SPEED_LABELS[options.speed] ?? `${options.speed}`,
          });
        }
        if (options.swing !== undefined) {
          sceneNotify({
            title: options.swing ? "Fan oscillation on" : "Fan oscillation off",
            description: `'${device?.name ?? "Fan"}' ${options.swing ? "is now oscillating" : "oscillation stopped"}`,
            severity: "info",
            icon: SN_ICONS.rotateCw,
            iconBg: "rgba(34,211,238,0.15)",
            iconFg: "#22d3ee",
          });
        }
      } catch (err) {
        console.error("[Store] Failed to update fan:", err);
        throw err;
      }
    },

    updateAirConditioner: async (deviceId, options) => {
      try {
        const device = get().getDeviceById(deviceId);
        console.log(`[Store] Updating air conditioner ${deviceId}:`, options);
        const updated = await api.setAirConditioner(deviceId, options);
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
        if (options.temperature !== undefined) {
          sceneNotify({
            title: "Temperature set",
            description: `'${device?.name ?? "AC"}' → ${options.temperature}°C`,
            severity: "info",
            icon: SN_ICONS.thermometer,
            iconBg: "rgba(56,189,248,0.15)",
            iconFg: "#38bdf8",
            badge: `${options.temperature}°C`,
          });
        }
      } catch (err) {
        console.error("[Store] Failed to update air conditioner:", err);
        throw err;
      }
    },

    selectDevice: (deviceId) => {
      console.log(`[Store] Selected device:`, deviceId);
      set({ selectedDeviceId: deviceId });
    },

    setPlacementMode: (type) => {
      console.log(`[Store] Set placement mode:`, type);
      set({ placementMode: type });
    },

    clearSelection: () => {
      set({ selectedDeviceId: null });
    },

    // Getters
    getDeviceById: (id) => get().devices.find((d) => d.id === id),

    getDevicesForRoom: (roomId) =>
      get().devices.filter((d) => d.room_id === roomId),

    getSelectedDevice: () => {
      const { devices, selectedDeviceId } = get();
      if (!selectedDeviceId) return null;
      return devices.find((d) => d.id === selectedDeviceId) ?? null;
    },

    getDevicesByType: () => {
      const grouped: Record<DeviceType, Device[]> = {
        [DeviceType.Lightbulb]: [],
        [DeviceType.Television]: [],
        [DeviceType.Fan]: [],
        [DeviceType.AirConditioner]: [],
        [DeviceType.Chair]: [],
        [DeviceType.Chair2]: [],
        [DeviceType.Chair3]: [],
        [DeviceType.Chair4]: [],
        [DeviceType.Chair5]: [],
        [DeviceType.Chair6]: [],
        [DeviceType.SmartMeter]: [],
      };
      for (const device of get().devices) {
        grouped[device.type].push(device);
      }
      return grouped;
    },

    getDevicesByRoom: () => {
      const grouped: Record<
        string,
        { roomName: string; floorName: string; devices: Device[] }
      > = {};
      for (const device of get().devices) {
        const key = device.room_id;
        if (!grouped[key]) {
          grouped[key] = {
            roomName: device.room_name,
            floorName: device.floor_name,
            devices: [],
          };
        }
        grouped[key].devices.push(device);
      }
      return grouped;
    },

    getDeviceCount: () => get().devices.length,

    getActiveDevices: () => get().devices.filter((d) => d.is_on),

    getLightbulb: (id) => {
      const device = get().getDeviceById(id);
      return device?.type === DeviceType.Lightbulb
        ? (device as Lightbulb)
        : undefined;
    },

    getTelevision: (id) => {
      const device = get().getDeviceById(id);
      return device?.type === DeviceType.Television
        ? (device as Television)
        : undefined;
    },

    getFan: (id) => {
      const device = get().getDeviceById(id);
      return device?.type === DeviceType.Fan ? (device as Fan) : undefined;
    },

    getAirConditioner: (id) => {
      const device = get().getDeviceById(id);
      return device?.type === DeviceType.AirConditioner
        ? (device as AirConditioner)
        : undefined;
    },
  })),
);

export const getStore = () => deviceStore.getState();

export const subscribeToStore = deviceStore.subscribe;
