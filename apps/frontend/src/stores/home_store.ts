import { create } from "zustand";
import { Home, Room, type BaseDevice } from "@/models";
import { HomeService } from "@/services/HomeService";
import { DeviceService } from "@/services/DeviceService";

interface HomeState {
  // Data
  homes: Home[];
  selectedHome: Home | null;
  rooms: Room[];
  selectedRoom: Room | null;
  devices: BaseDevice[];

  // Loading states
  isLoadingHomes: boolean;
  isLoadingRooms: boolean;
  isLoadingDevices: boolean;

  // Error state
  error: string | null;

  // Actions
  fetchHomes: () => Promise<void>;
  selectHome: (home: Home | null) => void;
  fetchRooms: () => Promise<void>;
  selectRoom: (room: Room | null) => void;
  fetchDevices: () => Promise<void>;
  fetchHomeDevices: (homeId: string) => Promise<void>;
  fetchRoomDevices: (roomId: string) => Promise<void>;
  clearError: () => void;
}

export const useHomeStore = create<HomeState>((set, get) => ({
  // Initial state
  homes: [],
  selectedHome: null,
  rooms: [],
  selectedRoom: null,
  devices: [],
  isLoadingHomes: false,
  isLoadingRooms: false,
  isLoadingDevices: false,
  error: null,

  // Actions
  fetchHomes: async () => {
    set({ isLoadingHomes: true, error: null });
    try {
      const homes = await HomeService.getInstance().getHomes();
      const allRooms = await HomeService.getInstance().getRooms();

      // Assign rooms to each home
      for (const home of homes) {
        home.rooms = allRooms.filter((room) => room.homeId === home.id);

        // Fetch devices for each room to get device counts
        for (const room of home.rooms) {
          const devices = await HomeService.getInstance().getRoomDevices(
            room.id,
          );
          room.devices = devices;
        }
      }

      set({ homes, isLoadingHomes: false });
    } catch (err) {
      set({
        isLoadingHomes: false,
        error: err instanceof Error ? err.message : "Failed to fetch homes",
      });
    }
  },

  selectHome: (home) => {
    set({ selectedHome: home, selectedRoom: null, devices: [] });
  },

  fetchRooms: async () => {
    set({ isLoadingRooms: true, error: null });
    try {
      const rooms = await HomeService.getInstance().getRooms();
      set({ rooms, isLoadingRooms: false });
    } catch (err) {
      set({
        isLoadingRooms: false,
        error: err instanceof Error ? err.message : "Failed to fetch rooms",
      });
    }
  },

  selectRoom: (room) => {
    set({ selectedRoom: room });
  },

  fetchDevices: async () => {
    set({ isLoadingDevices: true, error: null });
    try {
      const devices = await DeviceService.getInstance().getAllDevices();
      set({ devices, isLoadingDevices: false });
    } catch (err) {
      set({
        isLoadingDevices: false,
        error: err instanceof Error ? err.message : "Failed to fetch devices",
      });
    }
  },

  fetchHomeDevices: async (homeId: string) => {
    set({ isLoadingDevices: true, error: null });
    try {
      const devices = await HomeService.getInstance().getHomeDevices(homeId);
      set({ devices, isLoadingDevices: false });
    } catch (err) {
      set({
        isLoadingDevices: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch home devices",
      });
    }
  },

  fetchRoomDevices: async (roomId: string) => {
    set({ isLoadingDevices: true, error: null });
    try {
      const devices = await HomeService.getInstance().getRoomDevices(roomId);
      set({ devices, isLoadingDevices: false });
    } catch (err) {
      set({
        isLoadingDevices: false,
        error:
          err instanceof Error ? err.message : "Failed to fetch room devices",
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
