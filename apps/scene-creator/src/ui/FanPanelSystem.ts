import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Entity,
} from "@iwsdk/core";

import { Vector3, Quaternion, Euler } from "three";

import { DeviceComponent } from "../components/DeviceComponent";
import { deviceStore, getStore } from "../store/DeviceStore";
import { DeviceType } from "../types";
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";
import { scheduleUIKitInteractableBVHRefresh } from "./uikitRaycastBVH";

export class FanPanelSystem extends createSystem({
  fanPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/fan-panel.json")],
  },
}) {
  private unsubscribeDevices?: () => void;
  private deviceRenderer?: DeviceRendererSystem;

  init() {
    console.log("[FanPanel] System initialized");

    this.queries.fanPanel.subscribe("qualify", (entity) => {
      this.setupPanel(entity);
    });

    this.unsubscribeDevices = deviceStore.subscribe(
      (state) => state.devices,
      () => this.updateAllPanels(),
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

    console.log(`[FanPanel] Setting up panel for device ${deviceId}`);

    const powerBtn = document.getElementById("power-btn") as UIKit.Container | null;
    if (powerBtn) {
      powerBtn.setProperties({
        onClick: () => this.handlePowerToggle(deviceId),
      });
    }

    // Speed buttons
    const speedUp = document.getElementById("speed-up") as UIKit.Container | null;
    if (speedUp) {
      speedUp.setProperties({
        onClick: () => this.handleSpeedChange(deviceId, 1),
      });
    }

    const speedDown = document.getElementById("speed-down") as UIKit.Container | null;
    if (speedDown) {
      speedDown.setProperties({
        onClick: () => this.handleSpeedChange(deviceId, -1),
      });
    }

    const swingBtn = document.getElementById("swing-btn") as UIKit.Container | null;
    if (swingBtn) {
      swingBtn.setProperties({
        onClick: () => this.handleSwingToggle(deviceId),
      });
    }

    // Position buttons
    const getPositionBtn = document.getElementById("get-position-btn") as UIKit.Container | null;
    if (getPositionBtn) {
      getPositionBtn.setProperties({
        onClick: () => {
          this.handleGetPosition(entity, deviceId);
        }
      });
    }
  
    const savePositionBtn = document.getElementById("save-position-btn") as UIKit.Container | null;
    if (savePositionBtn) {
      savePositionBtn.setProperties({
        onClick: () => {
          this.handleSavePosition(entity, deviceId);
        }
      });
    }
  
    const showGraphBtn = document.getElementById("show-graph-btn") as UIKit.Container | null;
    if (showGraphBtn) {
      showGraphBtn.setProperties({
        onClick: () => {
          this.handleShowGraph(deviceId);
        }
      });
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

  private handleSpeedChange(deviceId: string, direction: number): void {
    console.log(`[FanPanel] Sending speed direction ${direction}`);
    getStore().updateFan(deviceId, { speed: direction });
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

  private handleGetPosition(entity: Entity, deviceId: string): void {
    const record = this.deviceRenderer?.getRecord(deviceId);
    if (!record?.entity.object3D) {
      console.warn(`[FanPanel] No Object3D found for device ${deviceId}`);
      return;
    }

    const object3D = record.entity.object3D;
    const pos = object3D.position;
    const rot = object3D.rotation;
    const scale = object3D.scale;

    // Get world matrix rotation for debugging/display
    object3D.updateMatrixWorld(true);
    const worldQuaternion = object3D.getWorldQuaternion(new Quaternion());
    const worldEuler = new Euler().setFromQuaternion(worldQuaternion as any);
    const worldPos = new Vector3();
    object3D.getWorldPosition(worldPos as any);

    const store = getStore();
    const device = store.getFan(deviceId);
    const radToDeg = (rad: number) => (rad * 180) / Math.PI;

    console.log(
      `\n╔══════════════════════════════════════════════════════════════╗`,
    );
    console.log(`║           DEVICE METADATA - ${device?.name || deviceId}`);
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(
      `║ 📍 LOCAL POSITION: X=${pos.x.toFixed(3)}, Y=${pos.y.toFixed(3)}, Z=${pos.z.toFixed(3)}`,
    );
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(
      `║ 🌍 WORLD POSITION: X=${worldPos.x.toFixed(3)}, Y=${worldPos.y.toFixed(3)}, Z=${worldPos.z.toFixed(3)}`,
    );
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(
      `║ 🧭 LOCAL ROTATION (degrees): X=${radToDeg(rot.x).toFixed(2)}°, Y=${radToDeg(rot.y).toFixed(2)}°, Z=${radToDeg(rot.z).toFixed(2)}°`,
    );
    console.log(
      `║ 🌍 WORLD ROTATION (degrees): X=${radToDeg(worldEuler.x).toFixed(2)}°, Y=${radToDeg(worldEuler.y).toFixed(2)}°, Z=${radToDeg(worldEuler.z).toFixed(2)}°`,
    );
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    console.log(
      `║ 📐 SCALE: X=${scale.x.toFixed(3)}, Y=${scale.y.toFixed(3)}, Z=${scale.z.toFixed(3)}`,
    );
    console.log(
      `╠══════════════════════════════════════════════════════════════╣`,
    );
    if (device) {
      console.log(
        `║ 🌀 Power: ${device.is_on ? "ON" : "OFF"}, Speed: ${device.speed}, Swing: ${device.swing ? "ON" : "OFF"}`,
      );
      console.log(
        `║    Location: ${device.room_name} - ${device.floor_name} - ${device.home_name}`,
      );
    }
    console.log(
      `╚══════════════════════════════════════════════════════════════╝\n`,
    );

    // Debug: check parent and children for rotation
    if (object3D.parent) {
      const p = object3D.parent.rotation;
      console.log(
        `[FanPanel] Parent rotation: (${radToDeg(p.x).toFixed(2)}°, ${radToDeg(p.y).toFixed(2)}°, ${radToDeg(p.z).toFixed(2)}°)`,
      );
    }
    object3D.traverse((child: any) => {
      if (
        child !== object3D &&
        (child.rotation.x !== 0 ||
          child.rotation.y !== 0 ||
          child.rotation.z !== 0)
      ) {
        console.log(
          `  Child "${child.name}": (${radToDeg(child.rotation.x).toFixed(2)}°, ${radToDeg(child.rotation.y).toFixed(2)}°, ${radToDeg(child.rotation.z).toFixed(2)}°)`,
        );
      }
    });

    console.log(`[FanPanel] Structured Data:`, {
      deviceId,
      position: { x: pos.x, y: pos.y, z: pos.z },
      localRotation: {
        x: radToDeg(rot.x),
        y: radToDeg(rot.y),
        z: radToDeg(rot.z),
      },
      worldRotation: {
        x: radToDeg(worldEuler.x),
        y: radToDeg(worldEuler.y),
        z: radToDeg(worldEuler.z),
      },
      scale: { x: scale.x, y: scale.y, z: scale.z },
    });
  }

  private async handleSavePosition(
    entity: Entity,
    deviceId: string,
  ): Promise<void> {
    const record = this.deviceRenderer?.getRecord(deviceId);
    if (!record?.entity.object3D) {
      console.warn(`[FanPanel] No Object3D found for device ${deviceId}`);
      return;
    }

    const object3D = record.entity.object3D;
    const pos = object3D.position;

    // We now use local rotation
    const rotationY = (object3D.rotation.y * 180) / Math.PI;

    console.log(
      `[FanPanel] Saving local position for device ${deviceId}:`,
      `x: ${pos.x.toFixed(3)}, y: ${pos.y.toFixed(3)}, z: ${pos.z.toFixed(3)}, rotation_y: ${rotationY.toFixed(2)}° (local)`,
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
        `[FanPanel] Position and rotation saved successfully for ${deviceId}`,
      );
    } catch (error) {
      console.error(`[FanPanel] Failed to save position:`, error);
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
    deviceId: string,
  ): void {
    const store = getStore();
    const device = store.getFan(deviceId);

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
        backgroundColor: device?.is_on ? "#22c55e" : "#64748b",
      });
    }

    // Update speed buttons highlight - remove absolute value highlight since it is now relative
    const speedDecBtn = document.getElementById("speed-dec") as UIKit.Container;
    if (speedDecBtn) speedDecBtn.setProperties({ backgroundColor: "rgba(203, 213, 225, 0.52)" });
    const speedIncBtn = document.getElementById("speed-inc") as UIKit.Container;
    if (speedIncBtn) speedIncBtn.setProperties({ backgroundColor: "rgba(203, 213, 225, 0.52)" });

    const swingBtn = document.getElementById("swing-btn") as UIKit.Container;
    if (swingBtn && device) {
      swingBtn.setProperties({
        backgroundColor: device.swing ? "#06b6d4" : "#64748b",
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

    if (entity.object3D) {
      scheduleUIKitInteractableBVHRefresh(entity.object3D);
    }
  }

  destroy(): void {
    this.unsubscribeDevices?.();
  }
}
