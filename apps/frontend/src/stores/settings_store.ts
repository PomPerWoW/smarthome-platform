import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  refreshInterval: number;
  autoUpdate: boolean;
  preferPlainText: boolean;
  postsPerPage: number;
  enableNotifications: boolean;
  notificationSound: boolean;
  showDeviceIcons: boolean;
  show3dModels: boolean;
  animationSpeed: number;

  setRefreshInterval: (interval: number) => void;
  toggleAutoUpdate: () => void;
  toggleNotifications: () => void;
  toggleNotificationSound: () => void;
  toggleDeviceIcons: () => void;
  toggle3dModels: () => void;
  setAnimationSpeed: (speed: number) => void;
  setPostsPerPage: (count: number) => void;
  refreshIntervalMs: () => number;
  resetState: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      refreshInterval: 15,
      autoUpdate: true,
      preferPlainText: true,
      postsPerPage: 20,
      enableNotifications: true,
      notificationSound: true,
      showDeviceIcons: true,
      show3dModels: true,
      animationSpeed: 1.0,

      setRefreshInterval: (interval) => {
        if (interval >= 5) {
          set({ refreshInterval: interval });
        }
      },

      toggleAutoUpdate: () => set((state) => ({ 
        autoUpdate: !state.autoUpdate 
      })),

      toggleNotifications: () => set((state) => ({
        enableNotifications: !state.enableNotifications,
      })),

      toggleNotificationSound: () => set((state) => ({
        notificationSound: !state.notificationSound,
      })),

      toggleDeviceIcons: () => set((state) => ({
        showDeviceIcons: !state.showDeviceIcons,
      })),

      toggle3dModels: () => set((state) => ({
        show3dModels: !state.show3dModels,
      })),

      setAnimationSpeed: (speed) => {
        if (speed >= 0.5 && speed <= 2.0) {
          set({ animationSpeed: speed });
        }
      },

      setPostsPerPage: (count) => {
        if (count > 0) {
          set({ postsPerPage: count });
        }
      },

      refreshIntervalMs: () => get().refreshInterval * 1000,

      resetState: () => set({
        refreshInterval: 15,
        autoUpdate: true,
        preferPlainText: true,
        postsPerPage: 20,
        enableNotifications: true,
        notificationSound: true,
        showDeviceIcons: true,
        show3dModels: true,
        animationSpeed: 1.0,
      }),
    }),
    {
      name: "settings-storage",
    }
  )
);