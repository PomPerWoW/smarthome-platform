import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Object3D,
} from "@iwsdk/core";

import { DeviceType } from "../types";
import { getStore } from "../store/DeviceStore";

// Device type to button ID mapping
const DEVICE_BUTTONS = [
  { id: "btn-lightbulb", type: DeviceType.Lightbulb, label: "Light" },
  { id: "btn-fan", type: DeviceType.Fan, label: "Fan" },
  { id: "btn-television", type: DeviceType.Television, label: "TV" },
  { id: "btn-ac", type: DeviceType.AirConditioner, label: "AC" },
];

export class HandMenuSystem extends createSystem({
  menuPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/hand_menu.json")],
  },
}) {
  // Follow logic - store reference to the panel's Object3D
  private panelObject3D: any = null;
  private selectedType: DeviceType | null = null;
  private buttons: Map<string, UIKit.Container> = new Map();
  private statusText: UIKit.Text | null = null;

  init() {
    console.log("[HandMenuSystem] Initializing floating menu...");

    this.queries.menuPanel.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) return;

      console.log("[HandMenuSystem] Panel ready, wiring buttons...");

      // Store the Object3D reference for follow behavior
      this.panelObject3D = entity.object3D;

      // Get status text
      this.statusText = document.getElementById("menu-status") as UIKit.Text;

      // Wire up each device button
      DEVICE_BUTTONS.forEach(({ id, type, label }) => {
        const btn = document.getElementById(id) as UIKit.Container;
        if (btn) {
          this.buttons.set(id, btn);
          btn.addEventListener("click", () => {
            console.log(`[HandMenu] Selected: ${label}`);
            this.selectDevice(type, id);
          });
        } else {
          console.warn(`[HandMenuSystem] Button #${id} not found`);
        }
      });
    });
  }

  private selectDevice(type: DeviceType, buttonId: string) {
    // Toggle: if same type tapped again, deselect
    if (this.selectedType === type) {
      this.selectedType = null;
      getStore().setPlacementMode(null as any);
      this.updateButtonStyles(null);
      if (this.statusText) {
        this.statusText.setProperties({ text: "Tap a device to place it" });
      }
      return;
    }

    this.selectedType = type;
    getStore().setPlacementMode(type);
    this.updateButtonStyles(buttonId);

    const label = DEVICE_BUTTONS.find((b) => b.id === buttonId)?.label ?? type;
    if (this.statusText) {
      this.statusText.setProperties({
        text: `Placing ${label}... Point & tap`,
      });
    }
  }

  private updateButtonStyles(activeId: string | null) {
    this.buttons.forEach((btn, id) => {
      const isActive = id === activeId;
      btn.setProperties({
        backgroundColor: isActive ? "#1e3a5f" : "#27272a",
        borderColor: isActive ? "#3b82f6" : "#3f3f46",
        borderWidth: isActive ? 0.2 : 0.15,
      });
    });
  }

  update(dt: number) {
    if (!this.panelObject3D) return;

    const camera = this.world.camera;
    if (!camera) return;

    // Position: 0.6m in front of camera, 0.15m lower, 0.35m to the LEFT
    const camDir = camera.getWorldDirection(
      new Object3D().position.clone().set(0, 0, 0)
    );
    camDir.y = 0;
    camDir.normalize();

    // Right vector: forward cross up
    const rightX = camDir.z;
    const rightZ = -camDir.x;

    const targetX = camera.position.x + camDir.x * 0.55 - rightX * 0.15;
    const targetY = camera.position.y - 0.1;
    const targetZ = camera.position.z + camDir.z * 0.55 - rightZ * 0.15;

    // Smooth follow via lerp
    const dx = targetX - this.panelObject3D.position.x;
    const dy = targetY - this.panelObject3D.position.y;
    const dz = targetZ - this.panelObject3D.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist > 1.0) {
      // Snap if too far (e.g. teleport)
      this.panelObject3D.position.set(targetX, targetY, targetZ);
    } else {
      const t = Math.min(1, 5 * dt);
      this.panelObject3D.position.x += dx * t;
      this.panelObject3D.position.y += dy * t;
      this.panelObject3D.position.z += dz * t;
    }

    // Always face the camera
    this.panelObject3D.lookAt(camera.position);
  }
}
