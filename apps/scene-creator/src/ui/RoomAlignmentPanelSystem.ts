import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  Entity,
} from "@iwsdk/core";
import { RoomScanningSystem } from "../systems/RoomScanningSystem";
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";
import { getStore } from "../store/DeviceStore";

export class RoomAlignmentPanelSystem extends createSystem({
  panels: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/room-alignment-panel.json")],
  },
}) {
  private attachedEntityIds = new Set<number>();

  init(): void {
    console.log("[RoomAlignmentPanelSystem] Initialized");

    this.queries.panels.subscribe("qualify", (entity) => {
      console.log(
        "[RoomAlignmentPanelSystem] Found panel, attaching events...",
      );
      this.setupPanel(entity);
    });
  }

  private setupPanel(entity: Entity): void {
    if (this.attachedEntityIds.has(entity.index)) return;

    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    if (!document) return;

    // Movement: 0.1m per click
    const MOVE_STEP = 0.1;
    // Rotation: 5 degrees per click
    const ROT_STEP = (5 * Math.PI) / 180;

    const translateRoom = (dx: number, dy: number, dz: number) => {
      const labModel = (globalThis as any).__labRoomModel;
      if (labModel) {
        labModel.position.x += dx;
        labModel.position.y += dy;
        labModel.position.z += dz;
        this.updateDisplayText(document, labModel);

        // Also translation devices
        const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
        if (deviceRenderer) {
          deviceRenderer.queries.devices.entities.forEach((ent: any) => {
            if (ent.object3D) {
              ent.object3D.position.x += dx;
              ent.object3D.position.y += dy;
              ent.object3D.position.z += dz;
            }
          });
        }
      }
    };

    const rotateRoom = (dRotY: number) => {
      const labModel = (globalThis as any).__labRoomModel;
      if (labModel) {
        const pivot = labModel.position.clone();
        labModel.rotation.y += dRotY;
        this.updateDisplayText(document, labModel);

        // Also rotate devices around labModel's position
        const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
        if (deviceRenderer) {
          deviceRenderer.queries.devices.entities.forEach((ent: any) => {
            if (ent.object3D) {
              const dx = ent.object3D.position.x - pivot.x;
              const dz = ent.object3D.position.z - pivot.z;
              const cos = Math.cos(dRotY);
              const sin = Math.sin(dRotY);
              ent.object3D.position.x = pivot.x + (dx * cos - dz * sin);
              ent.object3D.position.z = pivot.z + (dx * sin + dz * cos);
              ent.object3D.rotation.y += dRotY;
            }
          });
        }
      }
    };

    // Mapping buttons to actions
    document
      .getElementById("btn-move-fwd")
      ?.addEventListener("click", () => translateRoom(0, 0, -MOVE_STEP));
    document
      .getElementById("btn-move-back")
      ?.addEventListener("click", () => translateRoom(0, 0, MOVE_STEP));
    document
      .getElementById("btn-move-left")
      ?.addEventListener("click", () => translateRoom(-MOVE_STEP, 0, 0));
    document
      .getElementById("btn-move-right")
      ?.addEventListener("click", () => translateRoom(MOVE_STEP, 0, 0));
    document
      .getElementById("btn-move-up")
      ?.addEventListener("click", () => translateRoom(0, MOVE_STEP, 0));
    document
      .getElementById("btn-move-down")
      ?.addEventListener("click", () => translateRoom(0, -MOVE_STEP, 0));

    document
      .getElementById("btn-rot-left")
      ?.addEventListener("click", () => rotateRoom(ROT_STEP));
    document
      .getElementById("btn-rot-right")
      ?.addEventListener("click", () => rotateRoom(-ROT_STEP));

    document
      .getElementById("btn-save-alignment")
      ?.addEventListener("click", () => this.saveAlignment(document));

    // Initial text update
    if ((globalThis as any).__labRoomModel) {
      this.updateDisplayText(document, (globalThis as any).__labRoomModel);
    }

    this.attachedEntityIds.add(entity.index);
  }

  private updateDisplayText(document: UIKitDocument, labModel: any) {
    const textEl = document.getElementById("alignment-status");
    if (textEl) {
      const rY = ((labModel.rotation.y * 180) / Math.PI).toFixed(1);
      (textEl as any).setProperties({
        text: `P: (${labModel.position.x.toFixed(2)}, ${labModel.position.y.toFixed(2)}, ${labModel.position.z.toFixed(2)}) R: ${rY}°`,
      });
    }
  }

  private async saveAlignment(document: UIKitDocument) {
    const labModel = (globalThis as any).__labRoomModel;
    if (!labModel) return;

    const btn = document.getElementById("btn-save-alignment");
    if (btn) (btn as any).setProperties({ text: "Saving..." });

    const state = getStore();
    const homes = state.homes;
    if (
      homes &&
      homes.length > 0 &&
      homes[0].floors &&
      homes[0].floors.length > 0 &&
      homes[0].floors[0].rooms &&
      homes[0].floors[0].rooms.length > 0
    ) {
      const roomId = homes[0].floors[0].rooms[0].id;
      try {
        await state.updateRoomAlignment(
          roomId,
          labModel.position.x,
          labModel.position.y,
          labModel.position.z,
          labModel.rotation.y,
        );
        if (btn) (btn as any).setProperties({ text: "Saved ✓" });
        setTimeout(() => {
          if (btn) (btn as any).setProperties({ text: "Save Room Alignment" });
        }, 2000);

        const scanSystem = this.world.getSystem(RoomScanningSystem);
        if (scanSystem)
          (scanSystem as any).addHUDLine("Floppy save: Alignment persistent");
      } catch (e) {
        console.error("Failed to save room alignment", e);
        if (btn) (btn as any).setProperties({ text: "Error!" });
        setTimeout(() => {
          if (btn) (btn as any).setProperties({ text: "Save Room Alignment" });
        }, 2000);
      }
    } else {
      console.warn("No room found in store to save to");
      if (btn) (btn as any).setProperties({ text: "Error: No Room" });
      setTimeout(() => {
        if (btn) (btn as any).setProperties({ text: "Save Room Alignment" });
      }, 2000);
    }
  }
}
