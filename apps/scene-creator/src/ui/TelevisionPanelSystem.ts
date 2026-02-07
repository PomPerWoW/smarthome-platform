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
import { DeviceType } from "../types";
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";

export class TelevisionPanelSystem extends createSystem({
  tvPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/television-panel.json")],
  },
}) {
  private unsubscribeDevices?: () => void;

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

    // Graph button
    const graphBtn = document.getElementById("show-graph-btn");
    if (graphBtn) {
      graphBtn.addEventListener("click", () =>
        this.handleShowGraph(deviceId),
      );
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

  private handleShowGraph(deviceId: string): void {
    console.log(`[TVPanel] Show graph clicked for ${deviceId}`);

    // Toggle the separate graph panel
    const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
    if (deviceRenderer) {
      deviceRenderer.toggleGraphPanel(deviceId);
    }
  }

  private handleMuteToggle(deviceId: string): void {
    const store = getStore();
    const device = store.getTelevision(deviceId);
    if (!device) return;

    const newMute = !device.is_mute;
    console.log(`[TelevisionPanel] Setting mute to ${newMute}`);

    store.updateTelevision(deviceId, { is_mute: newMute });
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
        text: `${device.room_name} • ${device.floor_name}`,
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
