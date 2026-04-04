import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "@/stores/settings_store";

describe("Settings Store", () => {
  beforeEach(() => {
    useSettingsStore.getState().reset_state();
  });

  it("should have initial state", () => {
    const state = useSettingsStore.getState();
    expect(state.refresh_interval).toBe(15);
    expect(state.auto_update).toBe(true);
    expect(state.enable_notifications).toBe(true);
    expect(state.show_3d_models).toBe(true);
    expect(state.animation_speed).toBe(1.0);
  });

  it("set_refresh_interval should update interval if value >= 5", () => {
    useSettingsStore.getState().set_refresh_interval(10);
    expect(useSettingsStore.getState().refresh_interval).toBe(10);

    useSettingsStore.getState().set_refresh_interval(3); // Should ignore
    expect(useSettingsStore.getState().refresh_interval).toBe(10);
  });

  it("set_animation_speed should update speed if within 0.5-2.0", () => {
    useSettingsStore.getState().set_animation_speed(1.5);
    expect(useSettingsStore.getState().animation_speed).toBe(1.5);

    useSettingsStore.getState().set_animation_speed(0.1); // Should ignore
    expect(useSettingsStore.getState().animation_speed).toBe(1.5);

    useSettingsStore.getState().set_animation_speed(2.5); // Should ignore
    expect(useSettingsStore.getState().animation_speed).toBe(1.5);
  });

  it("toggles should flip boolean values", () => {
    useSettingsStore.getState().toggle_auto_update();
    expect(useSettingsStore.getState().auto_update).toBe(false);

    useSettingsStore.getState().toggle_notifications();
    expect(useSettingsStore.getState().enable_notifications).toBe(false);

    useSettingsStore.getState().toggle_3d_models();
    expect(useSettingsStore.getState().show_3d_models).toBe(false);
  });

  it("refresh_interval_ms should return value in milliseconds", () => {
    useSettingsStore.getState().set_refresh_interval(10);
    expect(useSettingsStore.getState().refresh_interval_ms()).toBe(10000);
  });

  it("reset_state should restore defaults", () => {
    useSettingsStore.getState().set_refresh_interval(60);
    useSettingsStore.getState().toggle_auto_update();
    
    useSettingsStore.getState().reset_state();
    
    const state = useSettingsStore.getState();
    expect(state.refresh_interval).toBe(15);
    expect(state.auto_update).toBe(true);
  });
});
