import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationStore, type AddNotificationPayload } from "@/stores/notification_store";

describe("Notification Store", () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it("should have initial state", () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual([]);
    expect(state.isOpen).toBe(false);
    expect(state.unreadCount()).toBe(0);
  });

  it("addNotification should add a notification to the top", () => {
    const payload: AddNotificationPayload = {
      category: "system",
      iconType: "info",
      title: "Test Title",
      description: "Test Description",
      severity: "info",
    };

    useNotificationStore.getState().addNotification(payload);

    const state = useNotificationStore.getState();
    expect(state.notifications.length).toBe(1);
    expect(state.notifications[0].title).toBe("Test Title");
    expect(state.notifications[0].read).toBe(false);
    expect(state.unreadCount()).toBe(1);
  });

  it("should respect MAX_NOTIFICATIONS limit", () => {
    const payload: AddNotificationPayload = {
      category: "system",
      iconType: "info",
      title: "Title",
      description: "Desc",
      severity: "info",
    };

    // Add more than 150 notifications
    for (let i = 0; i < 160; i++) {
      useNotificationStore.getState().addNotification(payload);
    }

    const state = useNotificationStore.getState();
    expect(state.notifications.length).toBe(150);
  });

  it("markAsRead should mark a specific notification as read", () => {
    useNotificationStore.getState().addNotification({
      category: "system",
      iconType: "info",
      title: "N1",
      description: "D1",
      severity: "info",
    });

    const id = useNotificationStore.getState().notifications[0].id;
    useNotificationStore.getState().markAsRead(id);

    expect(useNotificationStore.getState().notifications[0].read).toBe(true);
    expect(useNotificationStore.getState().unreadCount()).toBe(0);
  });

  it("markAllAsRead should mark all as read", () => {
    useNotificationStore.getState().addNotification({ category: "system", iconType: "info", title: "N1", description: "D1", severity: "info" });
    useNotificationStore.getState().addNotification({ category: "system", iconType: "info", title: "N2", description: "D2", severity: "info" });

    useNotificationStore.getState().markAllAsRead();

    const state = useNotificationStore.getState();
    expect(state.notifications.every(n => n.read)).toBe(true);
    expect(state.unreadCount()).toBe(0);
  });

  it("removeNotification should remove a notification", () => {
    useNotificationStore.getState().addNotification({ category: "system", iconType: "info", title: "N1", description: "D1", severity: "info" });
    const id = useNotificationStore.getState().notifications[0].id;
    
    useNotificationStore.getState().removeNotification(id);
    
    expect(useNotificationStore.getState().notifications.length).toBe(0);
  });

  it("getByCategory should filter notifications", () => {
    useNotificationStore.getState().addNotification({ category: "system", iconType: "info", title: "S1", description: "D1", severity: "info" });
    useNotificationStore.getState().addNotification({ category: "device", iconType: "info", title: "D1", description: "D1", severity: "info" });

    const systems = useNotificationStore.getState().getByCategory("system");
    const devices = useNotificationStore.getState().getByCategory("device");
    const all = useNotificationStore.getState().getByCategory("all");

    expect(systems.length).toBe(1);
    expect(systems[0].category).toBe("system");
    expect(devices.length).toBe(1);
    expect(devices[0].category).toBe("device");
    expect(all.length).toBe(2);
  });

  it("toggleOpen should toggle isOpen", () => {
    expect(useNotificationStore.getState().isOpen).toBe(false);
    useNotificationStore.getState().toggleOpen();
    expect(useNotificationStore.getState().isOpen).toBe(true);
    useNotificationStore.getState().toggleOpen();
    expect(useNotificationStore.getState().isOpen).toBe(false);
  });
});
