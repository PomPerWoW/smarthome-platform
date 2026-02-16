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

interface DeviceState {
  // State
  devices: Device[];
  homes: Home[];
  loading: boolean;
  error: string | null;
  selectedDeviceId: string | null;
  placementMode: DeviceType | null;

  // Actions
  loadAllData: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  refreshSingleDevice: (deviceId: string) => Promise<void>;


  createDevice: (
    type: DeviceType,
    position: [number, number, number],
    rotation: [number, number, number, number]
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

const api: BackendApiClient = getApiClient();

export const deviceStore = createStore<DeviceState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    devices: [],
    homes: [],
    loading: false,
    error: null,
    selectedDeviceId: null,
    placementMode: null,

    // Actions
    loadAllData: async () => {
      set({ loading: true, error: null });
      try {
        console.log("[Store] Loading all data from backend...");
        const [homes, devices] = await Promise.all([
          api.getFullHomeData(),
          api.getAllDevices(),
        ]);
        console.log(
          "[Store] Raw devices data:",
          JSON.stringify(devices, null, 2),
        );
        set({ homes, devices, loading: false });
        console.log(
          `[Store] Loaded ${homes.length} homes, ${devices.length} devices`,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load data";
        set({ error: message, loading: false });
        console.error("[Store] Failed to load data:", err);
      }
    },

    refreshDevices: async () => {
      try {
        console.log("[Store] Refreshing devices...");
        const devices = await api.getAllDevices();
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



    createDevice: async (type, position, rotation) => {
      try {
        console.log(`[Store] Creating device of type ${type}`);
        // simplistic: pick first home, first room
        // In real app, we need context.
        const homes = get().homes;
        let roomId = "";
        if (homes.length > 0 && homes[0].floors.length > 0 && homes[0].floors[0].rooms.length > 0) {
          roomId = homes[0].floors[0].rooms[0].id;
        }

        // Convert rotation quaternion to Euler Y if needed, or just store defaults.
        // Backend currently supports rotation_y.
        // We might need to convert quat to euler Y.
        // For now, simplify.

        const payload: any = {
          type: type,
          name: `New ${type}`,
          room_id: roomId,
          position: position,
          // rotation...
        };

        const newDevice = await api.createDevice(payload);
        set((state) => ({ devices: [...state.devices, newDevice] }));
        console.log(`[Store] Created device ${newDevice.id}`);
      } catch (err) {
        console.error("[Store] Failed to create device:", err);
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
      } catch (err) {
        console.error("[Store] Failed to toggle device:", err);
        throw err;
      }
    },

    updateDevicePosition: async (deviceId, x, y, z, rotationY) => {
      try {
        console.log(`[Store] Updating position for device ${deviceId}:`, {
          x,
          y,
          z,
          rotationY,
        });
        const updated = await api.setDevicePosition(deviceId, {
          x: x,
          y: y,
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

    updateLightbulb: async (deviceId, options) => {
      try {
        console.log(`[Store] Updating lightbulb ${deviceId}:`, options);
        const updated = await api.setLightbulb(deviceId, options);
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
      } catch (err) {
        console.error("[Store] Failed to update lightbulb:", err);
        throw err;
      }
    },

    updateTelevision: async (deviceId, options) => {
      try {
        console.log(`[Store] Updating television ${deviceId}:`, options);
        const updated = await api.setTelevision(deviceId, options);
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
      } catch (err) {
        console.error("[Store] Failed to update television:", err);
        throw err;
      }
    },

    updateFan: async (deviceId, options) => {
      try {
        console.log(`[Store] Updating fan ${deviceId}:`, options);
        const updated = await api.setFan(deviceId, options);
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
      } catch (err) {
        console.error("[Store] Failed to update fan:", err);
        throw err;
      }
    },

    updateAirConditioner: async (deviceId, options) => {
      try {
        console.log(`[Store] Updating air conditioner ${deviceId}:`, options);
        const updated = await api.setAirConditioner(deviceId, options);
        set((state) => ({
          devices: state.devices.map((d) => (d.id === deviceId ? updated : d)),
        }));
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
