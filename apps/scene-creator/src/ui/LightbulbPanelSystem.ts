import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Entity,
} from "@iwsdk/core";

import { DeviceComponent } from "../components/DeviceComponent";
import { deviceStore, getStore } from "../store/DeviceStore";
import { DeviceType, Lightbulb } from "../types";

// Color options matching the UIKitML file
const COLOR_OPTIONS = [
  "#ffffff", // white
  "#fef3c7", // warm
  "#e0f2fe", // cool
  "#ef4444", // red
  "#f97316", // orange
  "#facc15", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
];

export class LightbulbPanelSystem extends createSystem({
  lightbulbPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/lightbulb-panel.json")],
  },
}) {
  private unsubscribeDevices?: () => void;

  init() {
    console.log("[LightbulbPanel] System initialized");

    this.queries.lightbulbPanel.subscribe("qualify", (entity) => {
      this.setupPanel(entity);
    });

    // Subscribe to device state changes
    this.unsubscribeDevices = deviceStore.subscribe(
      (state) => state.devices,
      () => {
        this.updateAllPanels();
      }
    );
  }

  private setupPanel(entity: Entity): void {
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    if (!document) return;

    // Get the device ID associated with this panel
    const deviceId = entity.getValue(DeviceComponent, "deviceId");
    if (!deviceId) {
      console.warn("[LightbulbPanel] Panel entity missing deviceId");
      return;
    }

    console.log(`[LightbulbPanel] Setting up panel for device ${deviceId}`);

    // Power button
    const powerBtn = document.getElementById("power-btn");
    if (powerBtn) {
      powerBtn.addEventListener("click", () => {
        this.handlePowerToggle(deviceId);
      });
    }

    // Brightness controls
    const brightnessUp = document.getElementById("brightness-up");
    if (brightnessUp) {
      brightnessUp.addEventListener("click", () => {
        this.handleBrightnessChange(deviceId, 1);
      });
    }

    const brightnessDown = document.getElementById("brightness-down");
    if (brightnessDown) {
      brightnessDown.addEventListener("click", () => {
        this.handleBrightnessChange(deviceId, -1);
      });
    }

    // Color buttons
    for (const colorHex of COLOR_OPTIONS) {
      const colorId = `color-${colorHex.replace("#", "")}`;
      const colorBtn = document.getElementById(colorId);
      if (colorBtn) {
        colorBtn.addEventListener("click", () => {
          this.handleColorChange(deviceId, colorHex);
        });
      }
    }

    // Initial update for this specific panel
    this.updatePanel(entity, deviceId, document);
  }

  private handlePowerToggle(deviceId: string): void {
    const store = getStore();
    const device = store.getDeviceById(deviceId);
    if (!device || device.type !== DeviceType.Lightbulb) return;

    console.log(`[LightbulbPanel] Toggling power for ${deviceId}`);
    store.toggleDevice(deviceId);
  }

  private handleBrightnessChange(deviceId: string, delta: number): void {
    const store = getStore();
    const device = store.getLightbulb(deviceId);
    if (!device) return;

    const newBrightness = Math.max(0, Math.min(100, device.brightness + delta));
    console.log(
      `[LightbulbPanel] Setting brightness to ${newBrightness} for ${deviceId}`
    );

    store.updateLightbulb(deviceId, {
      brightness: newBrightness,
    });
  }

  private handleColorChange(deviceId: string, colorHex: string): void {
    console.log(
      `[LightbulbPanel] Setting color to ${colorHex} for ${deviceId}`
    );

    const store = getStore();
    store.updateLightbulb(deviceId, { colour: colorHex });
  }

  private updateAllPanels(): void {
    const entities = this.queries.lightbulbPanel.entities;
    for (const entity of entities) {
      const deviceId = entity.getValue(DeviceComponent, "deviceId");
      if (!deviceId) continue;

      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) continue;

      this.updatePanel(entity, deviceId, document);
    }
  }

  private updatePanel(
    entity: Entity,
    deviceId: string,
    document: UIKitDocument
  ): void {
    const store = getStore();
    const device = store.getLightbulb(deviceId);

    // Update device info
    const deviceName = document.getElementById("device-name") as UIKit.Text;
    const deviceLocation = document.getElementById(
      "device-location"
    ) as UIKit.Text;

    if (device) {
      deviceName?.setProperties({ text: device.name });
      deviceLocation?.setProperties({
        text: `${device.room_name} • ${device.floor_name}`,
      });
    } else {
      deviceName?.setProperties({ text: "Device not found" });
      deviceLocation?.setProperties({ text: "" });
    }

    // Update device position display
    const devicePosition = document.getElementById(
      "device-position"
    ) as UIKit.Text;
    if (devicePosition && device) {
      const pos = device.position;
      devicePosition.setProperties({
        text: `Position: (${pos[0].toFixed(1)}, ${pos[1].toFixed(
          1
        )}, ${pos[2].toFixed(1)})`,
      });
    } else if (devicePosition) {
      devicePosition.setProperties({ text: "" });
    }

    // Update power button style
    const powerBtn = document.getElementById("power-btn") as UIKit.Container;
    if (powerBtn) {
      powerBtn.setProperties({
        backgroundColor: device?.is_on ? "#22c55e" : "#27272a",
      });
    }

    // Update brightness value
    const brightnessValue = document.getElementById(
      "brightness-value"
    ) as UIKit.Text;
    if (brightnessValue && device) {
      brightnessValue.setProperties({ text: `${device.brightness}%` });
    }

    // Update status indicator
    const statusDot = document.getElementById("status-dot") as UIKit.Container;
    const statusText = document.getElementById("status-text") as UIKit.Text;
    if (statusDot && statusText && device) {
      statusDot.setProperties({
        backgroundColor: device.is_on ? "#22c55e" : "#71717a",
      });
      statusText.setProperties({ text: device.is_on ? "On" : "Off" });
    }

    // Update color selection (highlight selected color)
    const currentColor = device?.colour?.toLowerCase() || "#ffffff";
    for (const colorHex of COLOR_OPTIONS) {
      const colorId = `color-${colorHex.replace("#", "")}`;
      const colorBtn = document.getElementById(colorId) as UIKit.Container;
      if (colorBtn) {
        const isSelected = colorHex.toLowerCase() === currentColor;
        colorBtn.setProperties({
          borderColor: isSelected ? "#fafafa" : "transparent",
          borderWidth: isSelected ? 0.25 : 0.15,
        });
      }
    }
  }

  destroy(): void {
    this.unsubscribeDevices?.();
    this.unsubscribeDevices?.();
    console.log("[LightbulbPanel] System destroyed");
  }
}
