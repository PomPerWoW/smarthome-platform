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

export class FanPanelSystem extends createSystem({
  fanPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/fan-panel.json")],
  },
}) {
  private unsubscribeDevices?: () => void;

  init() {
    console.log("[FanPanel] System initialized");

    this.queries.fanPanel.subscribe("qualify", (entity) => {
      this.setupPanel(entity);
    });

    this.unsubscribeDevices = deviceStore.subscribe(
      (state) => state.devices,
      () => this.updateAllPanels()
    );
  }

  private setupPanel(entity: Entity): void {
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    if (!document) return;

    const deviceId = entity.getValue(DeviceComponent, "deviceId");
    if (!deviceId) return;

    console.log(`[FanPanel] Setting up panel for device ${deviceId}`);

    const powerBtn = document.getElementById("power-btn");
    if (powerBtn) {
      powerBtn.addEventListener("click", () =>
        this.handlePowerToggle(deviceId)
      );
    }

    // Speed buttons
    for (let i = 1; i <= 3; i++) {
      const speedBtn = document.getElementById(`speed-${i}`);
      if (speedBtn) {
        speedBtn.addEventListener("click", () =>
          this.handleSpeedChange(deviceId, i)
        );
      }
    }

    const swingBtn = document.getElementById("swing-btn");
    if (swingBtn) {
      swingBtn.addEventListener("click", () =>
        this.handleSwingToggle(deviceId)
      );
    }

    // Graph button
    const graphBtn = document.getElementById("show-graph-btn");
    if (graphBtn) {
      graphBtn.addEventListener("click", () =>
        this.handleShowGraph(deviceId)
      );
    }

    this.updatePanel(entity, document, deviceId);
  }

  private handlePowerToggle(deviceId: string): void {
    const store = getStore();
    const device = store.getDeviceById(deviceId);
    if (!device || device.type !== DeviceType.Fan) return;

    console.log(`[FanPanel] Toggling power for ${deviceId}`);
    store.toggleDevice(deviceId);
  }

  private handleSpeedChange(deviceId: string, speed: number): void {
    console.log(`[FanPanel] Setting speed to ${speed}`);
    getStore().updateFan(deviceId, { speed });
  }

  private handleSwingToggle(deviceId: string): void {
    const store = getStore();
    const device = store.getFan(deviceId);
    if (!device) return;

    console.log(`[FanPanel] Toggling swing`);
    store.updateFan(deviceId, { swing: !device.swing });
  }

  private handleShowGraph(deviceId: string): void {
    console.log(`[FanPanel] Show graph clicked for ${deviceId}`);

    // Toggle the separate graph panel
    const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
    if (deviceRenderer) {
      deviceRenderer.toggleGraphPanel(deviceId);
    }
  }

  private updateAllPanels(): void {
    const entities = this.queries.fanPanel.entities;
    for (const entity of entities) {
      const deviceId = entity.getValue(DeviceComponent, "deviceId");
      if (!deviceId) continue;

      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) continue;

      this.updatePanel(entity, document, deviceId);
    }
  }

  private updatePanel(
    entity: Entity,
    document: UIKitDocument,
    deviceId: string
  ): void {
    const store = getStore();
    const device = store.getFan(deviceId);

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

    const powerBtn = document.getElementById("power-btn") as UIKit.Container;
    if (powerBtn) {
      powerBtn.setProperties({
        backgroundColor: device?.is_on ? "#22c55e" : "#27272a",
      });
    }

    // Update speed buttons
    for (let i = 1; i <= 3; i++) {
      const speedBtn = document.getElementById(`speed-${i}`) as UIKit.Container;
      if (speedBtn && device) {
        speedBtn.setProperties({
          backgroundColor: device.speed === i ? "#06b6d4" : "#27272a",
        });
      }
    }

    const swingBtn = document.getElementById("swing-btn") as UIKit.Container;
    if (swingBtn && device) {
      swingBtn.setProperties({
        backgroundColor: device.swing ? "#06b6d4" : "#27272a",
      });
    }

    const statusDot = document.getElementById("status-dot") as UIKit.Container;
    const statusText = document.getElementById("status-text") as UIKit.Text;
    if (statusDot && statusText && device) {
      statusDot.setProperties({
        backgroundColor: device.is_on ? "#22c55e" : "#71717a",
      });
      statusText.setProperties({ text: device.is_on ? "On" : "Off" });
    }
  }

  destroy(): void {
    this.unsubscribeDevices?.();
  }
}
