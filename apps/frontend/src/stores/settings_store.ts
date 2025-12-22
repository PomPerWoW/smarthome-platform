import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {

  refresh_interval: number;
  auto_update: boolean;
  prefer_plain_text: boolean;
  posts_per_page: number;
  enable_notifications: boolean;
  notification_sound: boolean;
  show_device_icons: boolean;
  show_3d_models: boolean;
  animation_speed: number;
  
  set_refresh_interval: (interval: number) => void;
  toggle_auto_update: () => void;
  toggle_notifications: () => void;
  toggle_notification_sound: () => void;
  toggle_device_icons: () => void;
  toggle_3d_models: () => void;
  set_animation_speed: (speed: number) => void;
  set_posts_per_page: (count: number) => void;
  refresh_interval_ms: () => number;
  reset_state: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({

      refresh_interval: 15,
      auto_update: true,
      prefer_plain_text: true,
      posts_per_page: 20,
      enable_notifications: true,
      notification_sound: true,
      show_device_icons: true,
      show_3d_models: true,
      animation_speed: 1.0,
      
      set_refresh_interval: (interval) => {
        if (interval >= 5) {
          set({ refresh_interval: interval });
        }
      },
      
      toggle_auto_update: () => set((state) => ({ auto_update: !state.auto_update })),
      
      toggle_notifications: () => set((state) => ({ 
        enable_notifications: !state.enable_notifications 
      })),
      
      toggle_notification_sound: () => set((state) => ({ 
        notification_sound: !state.notification_sound 
      })),
      
      toggle_device_icons: () => set((state) => ({ 
        show_device_icons: !state.show_device_icons 
      })),
      
      toggle_3d_models: () => set((state) => ({ 
        show_3d_models: !state.show_3d_models 
      })),
      
      set_animation_speed: (speed) => {
        if (speed >= 0.5 && speed <= 2.0) {
          set({ animation_speed: speed });
        }
      },

      set_posts_per_page: (count) => {
        if (count > 0) {
          set({ posts_per_page: count });
        }
      },
      
      refresh_interval_ms: () => get().refresh_interval * 1000,
      
      reset_state: () => set({
        refresh_interval: 15,
        auto_update: true,
        prefer_plain_text: true,
        posts_per_page: 20,
        enable_notifications: true,
        notification_sound: true,
        show_device_icons: true,
        show_3d_models: true,
        animation_speed: 1.0,
      }),
    }),
    {
      name: "settings-storage",
    }
  )
);