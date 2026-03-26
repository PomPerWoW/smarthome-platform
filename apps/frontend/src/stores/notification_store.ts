import { create } from "zustand";
import type { DeviceType } from "@/types/device.types";

// ─── Category ────────────────────────────────────────────────────────────────
export type NotificationCategory = "device" | "robot" | "automation" | "system";

// ─── Severity ────────────────────────────────────────────────────────────────
export type NotificationSeverity = "info" | "success" | "warning" | "error";

// ─── Icon types – one per distinct visual action ─────────────────────────────
export type NotificationIconType =
  // Power
  | "power_on"
  | "power_off"
  // Lightbulb specifics
  | "brightness"
  | "color"
  // Fan specifics
  | "fan_speed"
  | "fan_swing_on"
  | "fan_swing_off"
  // Air-conditioner specifics
  | "temperature"
  // Television specifics
  | "volume"
  | "mute"
  | "unmute"
  | "channel"
  // Robot / voice assistant
  | "robot_command_success"
  | "robot_command_fail"
  | "robot_listening"
  | "robot_cancelled"
  | "robot_info"
  // Automation
  | "automation"
  // System / websocket
  | "system_connected"
  | "system_disconnected"
  | "device_update"
  // Generic
  | "error"
  | "info";

// ─── Notification shape ───────────────────────────────────────────────────────
export interface AppNotification {
  id: string;
  category: NotificationCategory;
  iconType: NotificationIconType;
  title: string;
  description: string;
  timestamp: number;
  read: boolean;
  severity: NotificationSeverity;

  // Optional device context
  deviceType?: DeviceType;
  deviceName?: string;

  // Rich extras shown in the sidebar
  colorValue?: string;   // hex color – shown as a color swatch
  numericValue?: number; // e.g. 75 (brightness), 22 (temperature), 3 (channel)
  unit?: string;         // e.g. "%", "°C", " ch"
}

// ─── Convenience omit type for callers ────────────────────────────────────────
export type AddNotificationPayload = Omit<
  AppNotification,
  "id" | "timestamp" | "read"
>;

// ─── Store shape ──────────────────────────────────────────────────────────────
interface NotificationState {
  notifications: AppNotification[];
  isOpen: boolean;

  // Derived helpers (functions so they always read fresh state)
  unreadCount: () => number;
  getByCategory: (
    category: NotificationCategory | "all"
  ) => AppNotification[];

  // Mutators
  addNotification: (payload: AddNotificationPayload) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;

  // Panel visibility
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
}

// ─── Max items to keep in memory ─────────────────────────────────────────────
const MAX_NOTIFICATIONS = 150;

// ─── Store ────────────────────────────────────────────────────────────────────
export const useNotificationStore = create<NotificationState>()(
  (set, get) => ({
    notifications: [],
    isOpen: false,

    // ── Derived ──────────────────────────────────────────────────────────────

    unreadCount: () =>
      get().notifications.filter((n) => !n.read).length,

    getByCategory: (category) => {
      const { notifications } = get();
      if (category === "all") return notifications;
      return notifications.filter((n) => n.category === category);
    },

    // ── Mutators ─────────────────────────────────────────────────────────────

    addNotification: (payload) => {
      const newItem: AppNotification = {
        ...payload,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: Date.now(),
        read: false,
      };

      set((state) => {
        const updated = [newItem, ...state.notifications];
        return {
          notifications:
            updated.length > MAX_NOTIFICATIONS
              ? updated.slice(0, MAX_NOTIFICATIONS)
              : updated,
        };
      });
    },

    markAsRead: (id) =>
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
      })),

    markAllAsRead: () =>
      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          read: true,
        })),
      })),

    removeNotification: (id) =>
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),

    clearAll: () => set({ notifications: [] }),

    // ── Panel visibility ──────────────────────────────────────────────────────

    toggleOpen: () =>
      set((state) => ({ isOpen: !state.isOpen })),

    setOpen: (open) => set({ isOpen: open }),
  })
);
