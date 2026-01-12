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

const PRESET_TEMPS = [18, 22, 25, 28];

export class AirConditionerPanelSystem extends createSystem({
  acPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/ac-panel.json")],
  },
}) {
  private unsubscribeDevices?: () => void;

  init() {
    console.log("[ACPanel] System initialized");

    this.queries.acPanel.subscribe("qualify", (entity) => {
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

    console.log(`[ACPanel] Setting up panel for device ${deviceId}`);

    const powerBtn = document.getElementById("power-btn");
    if (powerBtn) {
      powerBtn.addEventListener("click", () =>
        this.handlePowerToggle(deviceId),
      );
    }

    const tempUp = document.getElementById("temp-up");
    if (tempUp) {
      tempUp.addEventListener("click", () =>
        this.handleTempChange(deviceId, 1),
      );
    }

    const tempDown = document.getElementById("temp-down");
    if (tempDown) {
      tempDown.addEventListener("click", () =>
        this.handleTempChange(deviceId, -1),
      );
    }

    // Preset temperature buttons
    for (const temp of PRESET_TEMPS) {
      const presetBtn = document.getElementById(`preset-${temp}`);
      if (presetBtn) {
        presetBtn.addEventListener("click", () =>
          this.handleSetTemp(deviceId, temp),
        );
      }
    }

    this.updatePanel(entity, deviceId, document);
  }

  private handlePowerToggle(deviceId: string): void {
    const store = getStore();
    const device = store.getDeviceById(deviceId);
    if (!device || device.type !== DeviceType.AirConditioner) return;

    console.log(`[ACPanel] Toggling power for ${deviceId}`);
    store.toggleDevice(deviceId);
  }

  private handleTempChange(deviceId: string, delta: number): void {
    const store = getStore();
    const device = store.getAirConditioner(deviceId);
    if (!device) return;

    const newTemp = Math.max(16, Math.min(30, device.temperature + delta));
    console.log(`[ACPanel] Setting temperature to ${newTemp}`);

    store.updateAirConditioner(deviceId, {
      temperature: newTemp,
    });
  }

  private handleSetTemp(deviceId: string, temp: number): void {
    console.log(`[ACPanel] Setting temperature to preset ${temp}`);

    getStore().updateAirConditioner(deviceId, {
      temperature: temp,
    });
  }

  private updateAllPanels(): void {
    const entities = this.queries.acPanel.entities;
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
    const device = store.getAirConditioner(deviceId);

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

    const tempValue = document.getElementById("temp-value") as UIKit.Text;
    if (tempValue && device) {
      tempValue.setProperties({ text: `${device.temperature}` });
    }

    // Update preset buttons
    for (const temp of PRESET_TEMPS) {
      const presetBtn = document.getElementById(
        `preset-${temp}`,
      ) as UIKit.Container;
      if (presetBtn && device) {
        presetBtn.setProperties({
          backgroundColor: device.temperature === temp ? "#0ea5e9" : "#27272a",
        });
      }
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
