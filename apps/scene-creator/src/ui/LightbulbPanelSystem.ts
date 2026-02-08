import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Entity,
  Quaternion,
  Euler,
} from "@iwsdk/core";

import { DeviceComponent } from "../components/DeviceComponent";
import { deviceStore, getStore } from "../store/DeviceStore";
import { DeviceType, Lightbulb } from "../types";
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";

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
  private deviceRenderer?: DeviceRendererSystem;

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
      },
    );
  }

  private setupPanel(entity: Entity): void {
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    if (!document) return;

    // Lazy-load the device renderer system if not already loaded
    if (!this.deviceRenderer) {
      this.deviceRenderer = this.world.getSystem(DeviceRendererSystem);
    }

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

    // Position buttons
    const getPositionBtn = document.getElementById("get-position-btn");
    if (getPositionBtn) {
      getPositionBtn.addEventListener("click", () => {
        this.handleGetPosition(entity, deviceId);
      });
    }

    const savePositionBtn = document.getElementById("save-position-btn");
    if (savePositionBtn) {
      savePositionBtn.addEventListener("click", () => {
        this.handleSavePosition(entity, deviceId);
      });
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
      `[LightbulbPanel] Setting brightness to ${newBrightness} for ${deviceId}`,
    );

    store.updateLightbulb(deviceId, {
      brightness: newBrightness,
    });
  }

  private handleColorChange(deviceId: string, colorHex: string): void {
    console.log(
      `[LightbulbPanel] Setting color to ${colorHex} for ${deviceId}`,
    );

    const store = getStore();
    store.updateLightbulb(deviceId, { colour: colorHex });
  }

  private handleGetPosition(entity: Entity, deviceId: string): void {
    const record = this.deviceRenderer?.getRecord(deviceId);
    if (!record?.entity.object3D) {
      console.warn(`[LightbulbPanel] No Object3D found for device ${deviceId}`);
      return;
    }

    const object3D = record.entity.object3D;
    const pos = object3D.position;
    const rot = object3D.rotation;
    const scale = object3D.scale;

    // Get world matrix rotation (accounts for parent transforms)
    object3D.updateMatrixWorld(true);
    const worldQuaternion = object3D.getWorldQuaternion(new Quaternion());

    // Get device data from store for additional metadata
    const store = getStore();
    const device = store.getLightbulb(deviceId);

    // Convert rotation from radians to degrees for readability
    const radToDeg = (rad: number) => (rad * 180) / Math.PI;

    // Extract Euler from world quaternion
    const worldEuler = new Euler().setFromQuaternion(worldQuaternion);

    console.log(
      `\n╔══════════════════════════════════════════════════════════════╗`,
    );
    console.log(`║           DEVICE METADATA - ${device?.name || deviceId}`);
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(`║ 📍 POSITION (World Coordinates)`);
    console.log(`║    X: ${pos.x.toFixed(3)}`);
    console.log(`║    Y: ${pos.y.toFixed(3)}`);
    console.log(`║    Z: ${pos.z.toFixed(3)}`);
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(`║ 🧭 ROTATION - Local (Euler Angles - Degrees)`);
    console.log(`║    X (Pitch): ${radToDeg(rot.x).toFixed(2)}°`);
    console.log(`║    Y (Yaw):   ${radToDeg(rot.y).toFixed(2)}°`);
    console.log(`║    Z (Roll):  ${radToDeg(rot.z).toFixed(2)}°`);
    console.log(`║    Order:     ${rot.order}`);
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(`║ 🌍 ROTATION - World (From Matrix)`);
    console.log(`║    X (Pitch): ${radToDeg(worldEuler.x).toFixed(2)}°`);
    console.log(`║    Y (Yaw):   ${radToDeg(worldEuler.y).toFixed(2)}°`);
    console.log(`║    Z (Roll):  ${radToDeg(worldEuler.z).toFixed(2)}°`);
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(`║ 📐 SCALE`);
    console.log(`║    X: ${scale.x.toFixed(3)}`);
    console.log(`║    Y: ${scale.y.toFixed(3)}`);
    console.log(`║    Z: ${scale.z.toFixed(3)}`);
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(`║ 💡 DEVICE PROPERTIES`);
    if (device) {
      console.log(`║    Power:      ${device.is_on ? "ON" : "OFF"}`);
      console.log(`║    Brightness: ${device.brightness}%`);
      console.log(`║    Colour:     ${device.colour}`);
      console.log(`║    Room:       ${device.room_name}`);
      console.log(`║    Floor:      ${device.floor_name}`);
      console.log(`║    Home:       ${device.home_name}`);
    } else {
      console.log(`║    (Device data not found)`);
    }
    console.log(
      `╚══════════════════════════════════════════════════════════════╝\n`,
    );

    // Log child rotations for debugging
    console.log(`[LightbulbPanel] Checking child objects for rotation...`);
    object3D.traverse((child) => {
      if (
        child !== object3D &&
        (child.rotation.x !== 0 ||
          child.rotation.y !== 0 ||
          child.rotation.z !== 0)
      ) {
        console.log(
          `  Child "${child.name}": rotation (${radToDeg(child.rotation.x).toFixed(2)}°, ${radToDeg(child.rotation.y).toFixed(2)}°, ${radToDeg(child.rotation.z).toFixed(2)}°)`,
        );
      }
    });

    // Also log as structured data for easy copying
    console.log(`[LightbulbPanel] Structured Data:`, {
      deviceId,
      position: { x: pos.x, y: pos.y, z: pos.z },
      localRotation: {
        x: radToDeg(rot.x),
        y: radToDeg(rot.y),
        z: radToDeg(rot.z),
        order: rot.order,
      },
      worldRotation: {
        x: radToDeg(worldEuler.x),
        y: radToDeg(worldEuler.y),
        z: radToDeg(worldEuler.z),
      },
      scale: { x: scale.x, y: scale.y, z: scale.z },
      properties: device
        ? {
            is_on: device.is_on,
            brightness: device.brightness,
            colour: device.colour,
            room: device.room_name,
            floor: device.floor_name,
            home: device.home_name,
          }
        : null,
    });
  }

  private async handleSavePosition(
    entity: Entity,
    deviceId: string,
  ): Promise<void> {
    const record = this.deviceRenderer?.getRecord(deviceId);
    if (!record?.entity.object3D) {
      console.warn(`[LightbulbPanel] No Object3D found for device ${deviceId}`);
      return;
    }

    const object3D = record.entity.object3D;
    const pos = object3D.position;

    // Get world rotation Y (accounts for parent transforms)
    object3D.updateMatrixWorld(true);
    const worldQuaternion = object3D.getWorldQuaternion(new Quaternion());
    const worldEuler = new Euler().setFromQuaternion(worldQuaternion);
    const rotationY = (worldEuler.y * 180) / Math.PI;

    console.log(
      `[LightbulbPanel] Saving position for device ${deviceId}:`,
      `x: ${pos.x.toFixed(3)}, y: ${pos.y.toFixed(3)}, z: ${pos.z.toFixed(3)}, rotation_y: ${rotationY.toFixed(2)}° (world)`,
    );

    try {
      await getStore().updateDevicePosition(
        deviceId,
        pos.x,
        pos.y,
        pos.z,
        rotationY,
      );
      console.log(
        `[LightbulbPanel] Position and rotation saved successfully for ${deviceId}`,
      );
    } catch (error) {
      console.error(`[LightbulbPanel] Failed to save position:`, error);
    }
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
    document: UIKitDocument,
  ): void {
    const store = getStore();
    const device = store.getLightbulb(deviceId);

    // Update device info
    const deviceName = document.getElementById("device-name") as UIKit.Text;
    const deviceLocation = document.getElementById(
      "device-location",
    ) as UIKit.Text;

    if (device) {
      deviceName?.setProperties({ text: device.name });
      deviceLocation?.setProperties({
        text: `${device.room_name} - ${device.floor_name}`,
      });
    } else {
      deviceName?.setProperties({ text: "Device not found" });
      deviceLocation?.setProperties({ text: "" });
    }

    // Update device position display
    const devicePosition = document.getElementById(
      "device-position",
    ) as UIKit.Text;
    if (devicePosition && device) {
      const pos = device.position;
      devicePosition.setProperties({
        text: `Position: (${pos[0].toFixed(1)}, ${pos[1].toFixed(
          1,
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
      "brightness-value",
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
