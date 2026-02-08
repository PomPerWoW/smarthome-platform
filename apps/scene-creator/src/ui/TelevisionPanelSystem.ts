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
import { DeviceType } from "../types";
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";

export class TelevisionPanelSystem extends createSystem({
  tvPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/television-panel.json")],
  },
}) {
  private unsubscribeDevices?: () => void;
  private deviceRenderer?: DeviceRendererSystem;

  init() {
    console.log("[TelevisionPanel] System initialized");

    this.queries.tvPanel.subscribe("qualify", (entity) => {
      this.setupPanel(entity);
    });

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

    const deviceId = entity.getValue(DeviceComponent, "deviceId");
    if (!deviceId) return;

    console.log(`[TelevisionPanel] Setting up panel for device ${deviceId}`);

    // Power button
    const powerBtn = document.getElementById("power-btn");
    if (powerBtn) {
      powerBtn.addEventListener("click", () =>
        this.handlePowerToggle(deviceId),
      );
    }

    // Volume controls
    const volumeUp = document.getElementById("volume-up");
    if (volumeUp) {
      volumeUp.addEventListener("click", () =>
        this.handleVolumeChange(deviceId, 5),
      );
    }

    const volumeDown = document.getElementById("volume-down");
    if (volumeDown) {
      volumeDown.addEventListener("click", () =>
        this.handleVolumeChange(deviceId, -5),
      );
    }

    // Channel controls
    const channelUp = document.getElementById("channel-up");
    if (channelUp) {
      channelUp.addEventListener("click", () =>
        this.handleChannelChange(deviceId, 1),
      );
    }

    const channelDown = document.getElementById("channel-down");
    if (channelDown) {
      channelDown.addEventListener("click", () =>
        this.handleChannelChange(deviceId, -1),
      );
    }

    // Mute button
    const muteBtn = document.getElementById("mute-btn");
    if (muteBtn) {
      muteBtn.addEventListener("click", () => this.handleMuteToggle(deviceId));
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

    this.updatePanel(entity, deviceId, document);
  }

  private handlePowerToggle(deviceId: string): void {
    const store = getStore();
    const device = store.getDeviceById(deviceId);
    if (!device || device.type !== DeviceType.Television) return;

    console.log(`[TelevisionPanel] Toggling power for ${deviceId}`);
    store.toggleDevice(deviceId);
  }

  private handleVolumeChange(deviceId: string, delta: number): void {
    const store = getStore();
    const device = store.getTelevision(deviceId);
    if (!device) return;

    const newVolume = Math.max(0, Math.min(100, device.volume + delta));
    console.log(`[TelevisionPanel] Setting volume to ${newVolume}`);

    store.updateTelevision(deviceId, { volume: newVolume });
  }

  private handleChannelChange(deviceId: string, delta: number): void {
    const store = getStore();
    const device = store.getTelevision(deviceId);
    if (!device) return;

    const newChannel = Math.max(1, device.channel + delta);
    console.log(`[TelevisionPanel] Setting channel to ${newChannel}`);

    store.updateTelevision(deviceId, { channel: newChannel });
  }

  private handleMuteToggle(deviceId: string): void {
    const store = getStore();
    const device = store.getTelevision(deviceId);
    if (!device) return;

    const newMute = !device.is_mute;
    console.log(`[TelevisionPanel] Setting mute to ${newMute}`);

    store.updateTelevision(deviceId, { is_mute: newMute });
  }

  private handleGetPosition(entity: Entity, deviceId: string): void {
    const record = this.deviceRenderer?.getRecord(deviceId);
    if (!record?.entity.object3D) {
      console.warn(
        `[TelevisionPanel] No Object3D found for device ${deviceId}`,
      );
      return;
    }

    const object3D = record.entity.object3D;
    const pos = object3D.position;
    const rot = object3D.rotation;
    const scale = object3D.scale;

    // Get device data from store for additional metadata
    const store = getStore();
    const device = store.getTelevision(deviceId);

    // Get world matrix rotation (accounts for parent transforms)
    object3D.updateMatrixWorld(true);
    const worldQuaternion = object3D.getWorldQuaternion(new Quaternion());
    const worldEuler = new Euler().setFromQuaternion(worldQuaternion);

    // Convert rotation from radians to degrees for readability
    const radToDeg = (rad: number) => (rad * 180) / Math.PI;

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
    console.log(`║ 🧭 LOCAL ROTATION (degrees)`);
    console.log(`║    X (Pitch): ${radToDeg(rot.x).toFixed(2)}°`);
    console.log(`║    Y (Yaw):   ${radToDeg(rot.y).toFixed(2)}°`);
    console.log(`║    Z (Roll):  ${radToDeg(rot.z).toFixed(2)}°`);
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(`║ 🌍 WORLD ROTATION (degrees)`);
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
    console.log(`║ 📺 DEVICE PROPERTIES`);
    if (device) {
      console.log(`║    Power:   ${device.is_on ? "ON" : "OFF"}`);
      console.log(`║    Volume:  ${device.volume}`);
      console.log(`║    Channel: ${device.channel}`);
      console.log(`║    Muted:   ${device.is_mute ? "YES" : "NO"}`);
      console.log(`║    Room:    ${device.room_name}`);
      console.log(`║    Floor:   ${device.floor_name}`);
      console.log(`║    Home:    ${device.home_name}`);
    } else {
      console.log(`║    (Device data not found)`);
    }
    console.log(
      `╚══════════════════════════════════════════════════════════════╝\n`,
    );

    // Also log as structured data for easy copying
    console.log(`[TelevisionPanel] Structured Data:`, {
      deviceId,
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: {
        x: radToDeg(rot.x),
        y: radToDeg(rot.y),
        z: radToDeg(rot.z),
        order: rot.order,
      },
      scale: { x: scale.x, y: scale.y, z: scale.z },
      properties: device
        ? {
            is_on: device.is_on,
            volume: device.volume,
            channel: device.channel,
            is_mute: device.is_mute,
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
      console.warn(
        `[TelevisionPanel] No Object3D found for device ${deviceId}`,
      );
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
      `[TelevisionPanel] Saving position for device ${deviceId}:`,
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
        `[TelevisionPanel] Position and rotation saved successfully for ${deviceId}`,
      );
    } catch (error) {
      console.error(`[TelevisionPanel] Failed to save position:`, error);
    }
  }

  private updateAllPanels(): void {
    const entities = this.queries.tvPanel.entities;
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
    const device = store.getTelevision(deviceId);

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

    const powerBtn = document.getElementById("power-btn") as UIKit.Container;
    if (powerBtn) {
      powerBtn.setProperties({
        backgroundColor: device?.is_on ? "#22c55e" : "#27272a",
      });
    }

    const volumeValue = document.getElementById("volume-value") as UIKit.Text;
    if (volumeValue && device) {
      volumeValue.setProperties({ text: `${device.volume}` });
    }

    const channelValue = document.getElementById("channel-value") as UIKit.Text;
    if (channelValue && device) {
      channelValue.setProperties({ text: `${device.channel}` });
    }

    const statusDot = document.getElementById("status-dot") as UIKit.Container;
    const statusText = document.getElementById("status-text") as UIKit.Text;
    if (statusDot && statusText && device) {
      statusDot.setProperties({
        backgroundColor: device.is_on ? "#22c55e" : "#71717a",
      });
      statusText.setProperties({ text: device.is_on ? "On" : "Off" });
    }

    // Update mute button
    const muteBtn = document.getElementById("mute-btn") as UIKit.Container;
    if (muteBtn && device) {
      muteBtn.setProperties({
        backgroundColor: device.is_mute ? "#ef4444" : "#27272a",
      });
    }
  }

  destroy(): void {
    this.unsubscribeDevices?.();
  }
}
