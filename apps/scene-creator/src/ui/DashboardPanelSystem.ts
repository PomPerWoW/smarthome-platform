import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Entity,
} from "@iwsdk/core";
import { Vector3 } from "three";

import { deviceStore, getStore } from "../store/DeviceStore";
import { getAuth } from "../api/auth";
import {
  DeviceType,
  Device,
  Lightbulb,
  Television,
  Fan,
  AirConditioner,
} from "../types";
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";
import { getApiClient } from "../api/BackendApiClient";
import { setRoomTransform } from "../config/navmesh";
import { updateCollisionTransform } from "../config/collision";
import {
  applyColorWallpaper,
  pickAndApplyWallpaper,
  removeAllWallpaper,
} from "../systems/WallpaperSystem";
import { WALLPAPER_PRESETS } from "../utils/wallDetection";

// ── Constants ──────────────────────────────────────────────────────────────────

const CARD_SLOT_COUNT = 8;

const FURNITURE_TYPES = new Set<string>([
  DeviceType.Chair,
  DeviceType.Chair2,
  DeviceType.Chair3,
  DeviceType.Chair4,
  DeviceType.Chair5,
  DeviceType.Chair6,
]);

const COLOR_ON = "#22c55e";
const COLOR_OFF = "#27272a";
const COLOR_RAIL_ACTIVE_BG = "rgba(37, 99, 235, 0.34)";
const COLOR_RAIL_ACTIVE_BORDER = "rgba(37, 99, 235, 0.56)";
const COLOR_RAIL_INACTIVE_BG = "rgba(255, 255, 255, 0.22)";
const COLOR_RAIL_INACTIVE_BORDER = "rgba(255, 255, 255, 0.35)";

// ── Helpers ────────────────────────────────────────────────────────────────────

function isFurniture(device: Device): boolean {
  return FURNITURE_TYPES.has(device.type);
}

function getDeviceValueText(device: Device): string {
  switch (device.type) {
    case DeviceType.Lightbulb:
      return `${(device as Lightbulb).brightness}%`;
    case DeviceType.Television:
      return `Vol ${(device as Television).volume}`;
    case DeviceType.Fan:
      return `Speed ${(device as Fan).speed}`;
    case DeviceType.AirConditioner:
      return `${(device as AirConditioner).temperature}°C`;
    case DeviceType.SmartMeter:
      return device.is_on ? "Active" : "Idle";
    default:
      return device.is_on ? "On" : "Off";
  }
}

function getDeviceStatusText(device: Device): string {
  return device.is_on ? "On" : "Off";
}

// ── System ─────────────────────────────────────────────────────────────────────

export class DashboardPanelSystem extends createSystem({
  dashboardPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/dashboard.json")],
  },
}) {
  private currentRoomId: string | null = null;
  private unsubscribeDevices?: () => void;
  private dashboardObject3D: any = null;
  private activeDocument: UIKitDocument | null = null;
  private activeEntity: Entity | null = null;
  private isHeadFollowEnabled = true;
  private keydownHandler?: (event: KeyboardEvent) => void;
  private attemptedInitialDataFetch = false;
  private roomNameById: Map<string, string> = new Map();
  private roomNameFetchInFlight: Set<string> = new Set();
  private voiceDialogueLines: string[] = [];
  private homeWelcomeText = "Welcome, User";
  private energyGraphsVisible = false;

  // Map card slot index → device id for click handling
  private slotDeviceMap: Map<number, string> = new Map();

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init(): void {
    console.log("[DashboardPanel] System initialized");

    this.queries.dashboardPanel.subscribe("qualify", (entity) => {
      console.log("[DashboardPanel] Panel entity qualified");
      this.setupDashboard(entity);
    });

    // React to device store mutations
    this.unsubscribeDevices = deviceStore.subscribe(
      (state) => state.devices,
      () => {
        this.refreshDashboard();
      },
    );
  }

  destroy(): void {
    this.unsubscribeDevices?.();
    this.unsubscribeDevices = undefined;
    this.slotDeviceMap.clear();
    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = undefined;
    }

    // Clean up global references
    if ((globalThis as any).__dashboardPanelEntity === this.activeEntity) {
      (globalThis as any).__dashboardPanelEntity = undefined;
    }
    (globalThis as any).__toggleDashboardPanel = undefined;
    (globalThis as any).__summonDashboardPanel = undefined;
    (globalThis as any).__switchRoom = undefined;
    (globalThis as any).__toggleDashboardFollowMode = undefined;
    (globalThis as any).__dashboardVoiceHooks = undefined;

    console.log("[DashboardPanel] System destroyed");
  }

  // ── Main Setup ─────────────────────────────────────────────────────────────

  private setupDashboard(entity: Entity): void {
    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
    if (!document) {
      console.warn("[DashboardPanel] No UIKitDocument found on entity");
      return;
    }

    this.activeDocument = document;
    this.activeEntity = entity;
    this.dashboardObject3D = entity.object3D;

    // ── Expose globally ──────────────────────────────────────────────────────
    (globalThis as any).__dashboardPanelEntity = entity;

    (globalThis as any).__toggleDashboardPanel = () => {
      if (entity.object3D) {
        const isVisible = entity.object3D.visible;
        entity.object3D.visible = !isVisible;
        console.log(
          `[DashboardPanel] Panel ${!isVisible ? "shown" : "hidden"}`,
        );
      }
    };

    (globalThis as any).__summonDashboardPanel = () => {
      this.summonPanelInFront();
    };

    (globalThis as any).__switchRoom = (roomId: string) => {
      this.switchRoom(roomId);
    };
    (globalThis as any).__toggleDashboardFollowMode = () => {
      this.toggleFollowMode();
    };

    // ── Header ───────────────────────────────────────────────────────────────
    this.setupHeader(document);

    // ── Sidebar rail ─────────────────────────────────────────────────────────
    this.setupSidebarRail(document);
    this.setupVoiceAssistantPanel(document);
    this.setupPlacementSection(document);

    // ── Close button ─────────────────────────────────────────────────────────
    const closeBtn = document.getElementById("close-dashboard-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        if (entity.object3D) {
          entity.object3D.visible = false;
          console.log("[DashboardPanel] Panel closed");
        }
      });
    }

    // ── Card interactions ────────────────────────────────────────────────────
    this.setupCardInteractions(document);
    this.setupKeyboardShortcuts();

    // ── Current room render ──────────────────────────────────────────────────
    this.renderCurrentRoom(document);

    console.log("[DashboardPanel] Setup complete");
  }

  private setupKeyboardShortcuts(): void {
    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler);
    }

    this.keydownHandler = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        this.toggleFollowMode();
      }
    };

    window.addEventListener("keydown", this.keydownHandler);
  }

  private toggleFollowMode(): void {
    this.isHeadFollowEnabled = !this.isHeadFollowEnabled;
    console.log(
      `[DashboardPanel] Follow mode: ${this.isHeadFollowEnabled ? "head-follow" : "fixed"}`,
    );
  }

  // ── Header ─────────────────────────────────────────────────────────────────

  private setupHeader(document: UIKitDocument): void {
    const auth = getAuth();
    const user = auth.getUser();

    const welcomeText = document.getElementById("welcome-text") as UIKit.Text;
    if (welcomeText && user) {
      const displayName = user.first_name || user.email || "User";
      this.homeWelcomeText = `Welcome, ${displayName}`;
      welcomeText.setProperties({ text: this.homeWelcomeText });
    }

    // Search pill – currently decorative; hook up later
    // Light/dark toggle – decorative for now
    // User settings – decorative for now
  }

  // ── Sidebar Rail ───────────────────────────────────────────────────────────

  private setupSidebarRail(document: UIKitDocument): void {
    const energyRailId = document.getElementById("rail-energy-btn")
      ? "rail-energy-btn"
      : "rail-xr-btn";
    const railIds = [
      "rail-home-btn",
      "rail-devices-btn",
      "rail-refresh-btn",
      "rail-mic-btn",
      energyRailId,
    ];

    const setActiveRail = (activeId: string) => {
      for (const id of railIds) {
        const btn = document.getElementById(id) as any;
        if (!btn) continue;
        btn.setProperties?.({
          backgroundColor:
            id === activeId ? COLOR_RAIL_ACTIVE_BG : COLOR_RAIL_INACTIVE_BG,
          borderColor:
            id === activeId
              ? COLOR_RAIL_ACTIVE_BORDER
              : COLOR_RAIL_INACTIVE_BORDER,
        });
      }
    };

    // Home
    const railHomeBtn = document.getElementById("rail-home-btn");
    if (railHomeBtn) {
      railHomeBtn.addEventListener("click", () => {
        console.log("[DashboardPanel][Home] Home button clicked");
        setActiveRail("rail-home-btn");
        this.showDashboardHomeSection(document);
        const placementEntity = (globalThis as any).__placementPanelEntity;
        if (placementEntity?.object3D) placementEntity.object3D.visible = false;
        // Show dashboard
        if (this.activeEntity?.object3D) {
          this.activeEntity.object3D.visible = true;
        }
        this.renderCurrentRoom(document);
        this.showHomeInformation(document);
        console.log("[DashboardPanel][Home] Home info render completed");
      });
    }

    // Devices → toggle placement panel
    const railDevicesBtn = document.getElementById("rail-devices-btn");
    if (railDevicesBtn) {
      railDevicesBtn.addEventListener("click", () => {
        setActiveRail("rail-devices-btn");
        this.showDashboardHomeSection(document);
        this.showDashboardPlacementSection(document);
        const placementEntity = (globalThis as any).__placementPanelEntity;
        if (placementEntity?.object3D) placementEntity.object3D.visible = false;
      });
    }

    // Room alignment is unplugged from current workflow.
    const railAlignBtn = document.getElementById("rail-align-room-btn");
    if (railAlignBtn) {
      (railAlignBtn as any).setProperties?.({ display: "none" });
    }

    // Refresh
    const railRefreshBtn = document.getElementById("rail-refresh-btn");
    if (railRefreshBtn) {
      railRefreshBtn.addEventListener("click", async () => {
        setActiveRail("rail-refresh-btn");
        this.showDashboardHomeSection(document);
        console.log("[DashboardPanel] Refreshing devices...");
        await getStore().refreshDevices();
        setActiveRail("rail-home-btn");
      });
    }

    // Mic → voice assistant
    const railMicBtn = document.getElementById("rail-mic-btn");
    if (railMicBtn) {
      railMicBtn.addEventListener("click", () => {
        setActiveRail("rail-mic-btn");
        this.showVoiceAssistantPanel(document);
      });
    }

    // Energy Graphs → toggle graph panel for each device in current room
    const railEnergyBtn =
      document.getElementById("rail-energy-btn") ??
      document.getElementById("rail-xr-btn");
    if (railEnergyBtn) {
      railEnergyBtn.addEventListener("click", () => {
        setActiveRail(energyRailId);
        this.showDashboardHomeSection(document);
        const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
        if (!deviceRenderer) {
          console.warn("[DashboardPanel] Device renderer system is unavailable");
          setActiveRail("rail-home-btn");
          return;
        }

        const roomDevices = this.getCurrentRoomDevices();
        if (roomDevices.length === 0) {
          console.log("[DashboardPanel] No devices available for energy graphs");
          setActiveRail("rail-home-btn");
          return;
        }

        this.energyGraphsVisible = !this.energyGraphsVisible;
        for (const device of roomDevices) {
          deviceRenderer.toggleGraphPanel(device.id);
        }

        console.log(
          `[DashboardPanel] Energy graphs ${this.energyGraphsVisible ? "shown" : "hidden"} for ${roomDevices.length} device(s)`,
        );
      });
    }

    this.showDashboardHomeSection(document);
    setActiveRail("rail-home-btn");
  }

  private setupVoiceAssistantPanel(document: UIKitDocument): void {
    const commandBtn = document.getElementById("voice-command-btn");
    if (commandBtn) {
      commandBtn.addEventListener("click", () => {
        this.triggerVoiceAssistantFromDashboard(document);
      });
    }

    (globalThis as any).__dashboardVoiceHooks = {
      onShow: () => {
        this.showVoiceAssistantPanel(document);
      },
      onHide: () => {
        this.setVoiceStatus(document, "Idle");
      },
      onStatus: (text: string) => {
        this.setVoiceStatus(document, text);
      },
      onUserMessage: (text: string) => {
        this.pushVoiceDialogueLine(document, `You: ${text}`);
      },
      onAssistantMessage: (text: string) => {
        this.pushVoiceDialogueLine(document, `Assistant: ${text}`);
      },
      onSystemMessage: (text: string) => {
        this.pushVoiceDialogueLine(document, `System: ${text}`);
      },
      onTyping: (text?: string) => {
        this.setVoiceStatus(document, text ?? "Listening...");
      },
      onTypingEnd: () => {
        this.setVoiceStatus(document, "Active");
      },
    };
  }

  private showVoiceAssistantPanel(document: UIKitDocument): void {
    this.showDashboardSection(document, "voice");

    const panel = document.getElementById(
      "voice-assistant-panel",
    ) as UIKit.Container;
    if (panel) {
      panel.setProperties({ display: "flex" });
    }
    if (this.voiceDialogueLines.length === 0) {
      this.pushVoiceDialogueLine(
        document,
        'Press "Voice Command" to talk with assistant.',
        true,
      );
    }
  }

  private showDashboardHomeSection(document: UIKitDocument): void {
    this.showDashboardSection(document, "home");
  }

  private showDashboardPlacementSection(document: UIKitDocument): void {
    this.showDashboardSection(document, "placement");
  }

  private showDashboardAlignmentSection(document: UIKitDocument): void {
    this.showDashboardSection(document, "alignment");
  }

  private showDashboardSection(
    document: UIKitDocument,
    section: "home" | "voice" | "placement" | "alignment",
  ): void {
    const deviceGrid = document.getElementById("device-grid") as UIKit.Container;
    if (deviceGrid) {
      deviceGrid.setProperties({ display: section === "home" ? "flex" : "none" });
    }

    const panel = document.getElementById(
      "voice-assistant-panel",
    ) as UIKit.Container;
    if (panel) {
      panel.setProperties({ display: section === "voice" ? "flex" : "none" });
    }

    const placementSection = document.getElementById(
      "placement-section",
    ) as UIKit.Container;
    if (placementSection) {
      placementSection.setProperties({
        display: section === "placement" ? "flex" : "none",
      });
    }

    const alignmentSection = document.getElementById(
      "alignment-section",
    ) as UIKit.Container;
    if (alignmentSection) {
      alignmentSection.setProperties({
        display: section === "alignment" ? "flex" : "none",
      });
    }
  }

  private setupPlacementSection(document: UIKitDocument): void {
    const store = getStore();
    const deviceButtons: Array<{ id: string; type: DeviceType }> = [
      { id: "place-lightbulb", type: DeviceType.Lightbulb },
      { id: "place-television", type: DeviceType.Television },
      { id: "place-fan", type: DeviceType.Fan },
      { id: "place-ac", type: DeviceType.AirConditioner },
      { id: "place-chair", type: DeviceType.Chair },
      { id: "place-chair2", type: DeviceType.Chair2 },
      { id: "place-chair3", type: DeviceType.Chair3 },
      { id: "place-chair4", type: DeviceType.Chair4 },
      { id: "place-chair5", type: DeviceType.Chair5 },
      { id: "place-chair6", type: DeviceType.Chair6 },
    ];

    for (const { id, type } of deviceButtons) {
      document.getElementById(id)?.addEventListener("click", () => {
        store.setPlacementMode(type);
        this.showDashboardHomeSection(document);
      });
    }

    document
      .getElementById("place-wallpaper-upload")
      ?.addEventListener("click", async () => {
        await pickAndApplyWallpaper();
      });

    const presetButtonMap: Array<{ btnId: string; presetId: string }> = [
      { btnId: "place-wallpaper-white", presetId: "preset-white" },
      { btnId: "place-wallpaper-cream", presetId: "preset-cream" },
      { btnId: "place-wallpaper-sky", presetId: "preset-sky" },
      { btnId: "place-wallpaper-sage", presetId: "preset-sage" },
      { btnId: "place-wallpaper-blush", presetId: "preset-blush" },
      { btnId: "place-wallpaper-lavender", presetId: "preset-lavender" },
    ];

    for (const { btnId, presetId } of presetButtonMap) {
      const preset = WALLPAPER_PRESETS.find((p) => p.id === presetId);
      if (!preset) continue;
      document.getElementById(btnId)?.addEventListener("click", () => {
        applyColorWallpaper(preset.color, preset.label);
      });
    }

    document.getElementById("remove-wallpaper")?.addEventListener("click", () => {
      removeAllWallpaper();
    });
  }

  private setupAlignmentSection(document: UIKitDocument): void {
    const MOVE_STEP = 0.1;
    const ROT_STEP = (5 * Math.PI) / 180;

    const translateRoom = (dx: number, dy: number, dz: number) => {
      const labModel = (globalThis as any).__labRoomModel;
      if (!labModel) return;
      labModel.position.x += dx;
      labModel.position.y += dy;
      labModel.position.z += dz;
      this.updateAlignmentStatus(document, labModel);
      setRoomTransform(
        labModel.position.x,
        labModel.position.y,
        labModel.position.z,
        labModel.rotation.y,
        labModel.scale.x,
      );
      updateCollisionTransform();
      const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
      deviceRenderer?.queries.devices.entities.forEach((ent: any) => {
        if (!ent.object3D) return;
        ent.object3D.position.x += dx;
        ent.object3D.position.y += dy;
        ent.object3D.position.z += dz;
      });
    };

    const rotateRoom = (dRotY: number) => {
      const labModel = (globalThis as any).__labRoomModel;
      if (!labModel) return;
      const pivot = labModel.position.clone();
      labModel.rotation.y += dRotY;
      this.updateAlignmentStatus(document, labModel);
      setRoomTransform(
        labModel.position.x,
        labModel.position.y,
        labModel.position.z,
        labModel.rotation.y,
        labModel.scale.x,
      );
      updateCollisionTransform();
      const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
      deviceRenderer?.queries.devices.entities.forEach((ent: any) => {
        if (!ent.object3D) return;
        const dx = ent.object3D.position.x - pivot.x;
        const dz = ent.object3D.position.z - pivot.z;
        const cos = Math.cos(dRotY);
        const sin = Math.sin(dRotY);
        ent.object3D.position.x = pivot.x + (dx * cos - dz * sin);
        ent.object3D.position.z = pivot.z + (dx * sin + dz * cos);
        ent.object3D.rotation.y += dRotY;
      });
    };

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

    const labModel = (globalThis as any).__labRoomModel;
    if (labModel) this.updateAlignmentStatus(document, labModel);
  }

  private updateAlignmentStatus(document: UIKitDocument, labModel: any): void {
    const statusEl = document.getElementById("alignment-status") as UIKit.Text;
    if (!statusEl) return;
    const rY = ((labModel.rotation.y * 180) / Math.PI).toFixed(1);
    statusEl.setProperties({
      text: `P: (${labModel.position.x.toFixed(2)}, ${labModel.position.y.toFixed(2)}, ${labModel.position.z.toFixed(2)}) R: ${rY}deg`,
    });
  }

  private triggerVoiceAssistantFromDashboard(document: UIKitDocument): void {
    const triggerFn = (globalThis as any).__triggerVoiceAssistant as
      | (() => void)
      | undefined;
    if (triggerFn) {
      triggerFn();
      return;
    }

    const voicePanel = (globalThis as any).__voicePanelSystem as
      | { triggerAssistant?: () => void }
      | undefined;
    if (voicePanel?.triggerAssistant) {
      voicePanel.triggerAssistant();
      return;
    }

    this.setVoiceStatus(document, "Voice system not ready");
    this.pushVoiceDialogueLine(
      document,
      "System: Voice assistant is still initializing. Try again in a moment.",
    );
  }

  private setVoiceStatus(document: UIKitDocument, text: string): void {
    const status = document.getElementById("voice-status-inline") as UIKit.Text;
    if (status) {
      status.setProperties({ text });
    }
  }

  private pushVoiceDialogueLine(
    document: UIKitDocument,
    text: string,
    replace = false,
  ): void {
    const dialogueText = document.getElementById("voice-dialogue-text") as UIKit.Text;
    if (!dialogueText) return;

    if (replace) {
      this.voiceDialogueLines = [text];
    } else {
      this.voiceDialogueLines.push(text);
      if (this.voiceDialogueLines.length > 6) {
        this.voiceDialogueLines = this.voiceDialogueLines.slice(-6);
      }
    }

    dialogueText.setProperties({ text: this.voiceDialogueLines.join("\n") });
  }

  // ── Card Interactions ──────────────────────────────────────────────────────

  private setupCardInteractions(document: UIKitDocument): void {
    for (let i = 0; i < CARD_SLOT_COUNT; i++) {
      const slotIndex = i;

      // Power toggle
      const toggleBtn = document.getElementById(`card-toggle-${i}`);
      if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
          const deviceId = this.slotDeviceMap.get(slotIndex);
          if (!deviceId) return;
          console.log(
            `[DashboardPanel] Toggling device ${deviceId} from card ${slotIndex}`,
          );
          getStore().toggleDevice(deviceId);
        });
      }

      // Increment
      const upBtn = document.getElementById(`card-up-${i}`);
      if (upBtn) {
        upBtn.addEventListener("click", () => {
          const deviceId = this.slotDeviceMap.get(slotIndex);
          if (!deviceId) return;
          this.handleDeviceIncrement(deviceId, 1);
        });
      }

      // Decrement
      const downBtn = document.getElementById(`card-down-${i}`);
      if (downBtn) {
        downBtn.addEventListener("click", () => {
          const deviceId = this.slotDeviceMap.get(slotIndex);
          if (!deviceId) return;
          this.handleDeviceIncrement(deviceId, -1);
        });
      }
    }
  }

  private handleDeviceIncrement(deviceId: string, direction: number): void {
    const store = getStore();
    const device = store.getDeviceById(deviceId);
    if (!device) return;

    switch (device.type) {
      case DeviceType.Lightbulb: {
        const lb = device as Lightbulb;
        const newBrightness = Math.max(
          0,
          Math.min(100, lb.brightness + direction * 5),
        );
        console.log(
          `[DashboardPanel] Lightbulb ${deviceId} brightness → ${newBrightness}`,
        );
        store.updateLightbulb(deviceId, { brightness: newBrightness });
        break;
      }
      case DeviceType.Television: {
        const tv = device as Television;
        const newVolume = Math.max(0, Math.min(100, tv.volume + direction * 5));
        console.log(
          `[DashboardPanel] Television ${deviceId} volume → ${newVolume}`,
        );
        store.updateTelevision(deviceId, { volume: newVolume });
        break;
      }
      case DeviceType.Fan: {
        const fan = device as Fan;
        const newSpeed = Math.max(0, Math.min(5, fan.speed + direction));
        console.log(`[DashboardPanel] Fan ${deviceId} speed → ${newSpeed}`);
        store.updateFan(deviceId, { speed: newSpeed });
        break;
      }
      case DeviceType.AirConditioner: {
        const ac = device as AirConditioner;
        const minTemp = ac.min_temp ?? 16;
        const maxTemp = ac.max_temp ?? 30;
        const newTemp = Math.max(
          minTemp,
          Math.min(maxTemp, ac.temperature + direction),
        );
        console.log(`[DashboardPanel] AC ${deviceId} temperature → ${newTemp}`);
        store.updateAirConditioner(deviceId, { temperature: newTemp });
        break;
      }
      default:
        // SmartMeter and others don't have adjustable values
        break;
    }
  }

  // ── Current room rendering ────────────────────────────────────────────────

  private renderCurrentRoom(document: UIKitDocument): void {
    const store = getStore();
    const roomMap = store.getDevicesByRoom();
    const roomIds = Object.keys(roomMap);
    const storeRoomId = store.roomId;
    const fallbackRoom = store.homes[0]?.floors?.[0]?.rooms?.[0];
    let resolvedRoomName: string | null = null;

    // If the dashboard mounts before any data arrives, fetch once.
    if (
      roomIds.length === 0 &&
      store.homes.length === 0 &&
      !store.loading &&
      !this.attemptedInitialDataFetch
    ) {
      this.attemptedInitialDataFetch = true;
      void store.loadAllData().catch((err) => {
        console.error("[DashboardPanel] Failed to auto-load data:", err);
      });
    }

    // Prefer the currently loaded room from store; fallback to first available.
    if (store.loading && !storeRoomId && roomIds.length === 0 && !fallbackRoom) {
      const currentRoomText = document.getElementById(
        "current-room-text",
      ) as UIKit.Text;
      if (currentRoomText) {
        currentRoomText.setProperties({ text: "Loading room..." });
      }
      this.hideAllCards(document);
      return;
    }

    if (storeRoomId) {
      this.currentRoomId = storeRoomId;
      resolvedRoomName =
        roomMap[storeRoomId]?.roomName ??
        this.roomNameById.get(storeRoomId) ??
        (fallbackRoom && fallbackRoom.id === storeRoomId
          ? fallbackRoom.name
          : null);
    } else if (roomIds.length > 0) {
      this.currentRoomId = roomIds[0];
      resolvedRoomName = roomMap[this.currentRoomId]?.roomName ?? null;
    } else if (fallbackRoom) {
      this.currentRoomId = fallbackRoom.id;
      resolvedRoomName = fallbackRoom.name;
    } else {
      this.currentRoomId = null;
    }
    console.log("[DashboardPanel][Home] renderCurrentRoom state:", {
      storeRoomId,
      roomIds,
      fallbackRoomId: fallbackRoom?.id ?? null,
      fallbackRoomName: fallbackRoom?.name ?? null,
      resolvedCurrentRoomId: this.currentRoomId,
      resolvedRoomName,
      homesCount: store.homes.length,
      loading: store.loading,
    });

    const currentRoomText = document.getElementById(
      "current-room-text",
    ) as UIKit.Text;
    if (currentRoomText) {
      const roomName = this.currentRoomId
        ? (resolvedRoomName ??
          roomMap[this.currentRoomId]?.roomName ??
          "Loading room...")
        : "No Room";
      currentRoomText.setProperties({ text: roomName });
    }

    // Resolve room name by roomId even when room has zero devices.
    if (this.currentRoomId && !resolvedRoomName) {
      this.resolveRoomNameById(this.currentRoomId);
    }

    if (this.currentRoomId) {
      this.renderRoom(this.currentRoomId, document);
    } else {
      this.hideAllCards(document);
    }
  }

  // ── Render Room Cards ──────────────────────────────────────────────────────

  private renderRoom(roomId: string, document: UIKitDocument): void {
    this.currentRoomId = roomId;
    const store = getStore();
    const roomMap = store.getDevicesByRoom();
    const devices = this.getDevicesForRoomContext(roomId);

    this.slotDeviceMap.clear();

    for (let i = 0; i < CARD_SLOT_COUNT; i++) {
      const cardContainer = document.getElementById(
        `device-card-${i}`,
      ) as UIKit.Container;
      const cardName = document.getElementById(`card-name-${i}`) as UIKit.Text;
      const cardStatus = document.getElementById(
        `card-status-${i}`,
      ) as UIKit.Text;
      const cardValue = document.getElementById(
        `card-value-${i}`,
      ) as UIKit.Text;
      const cardToggle = document.getElementById(
        `card-toggle-${i}`,
      ) as UIKit.Container;
      const cardIcon = document.getElementById(
        `card-icon-${i}`,
      ) as UIKit.Container;

      if (i < devices.length) {
        const device = devices[i];
        this.slotDeviceMap.set(i, device.id);

        // Show card
        if (cardContainer) {
          cardContainer.setProperties({ display: "flex" });
        }

        // Device name
        if (cardName) {
          cardName.setProperties({ text: device.name });
        }

        // Status text
        if (cardStatus) {
          cardStatus.setProperties({ text: getDeviceStatusText(device) });
        }

        // Value display
        if (cardValue) {
          cardValue.setProperties({ text: getDeviceValueText(device) });
        }

        // Power toggle color
        if (cardToggle) {
          cardToggle.setProperties({
            backgroundColor: device.is_on ? COLOR_ON : COLOR_OFF,
          });
        }

        // Icon color tint based on power state
        if (cardIcon) {
          cardIcon.setProperties({
            backgroundColor: device.is_on
              ? "rgba(34, 197, 94, 0.15)"
              : "rgba(113, 113, 122, 0.15)",
          });
        }
      } else {
        // Hide unused card slot
        this.slotDeviceMap.delete(i);
        if (cardContainer) {
          cardContainer.setProperties({ display: "none" });
        }
      }
    }

    console.log(
      `[DashboardPanel] Rendered room "${roomMap[roomId]?.roomName ?? this.roomNameById.get(roomId) ?? roomId}" with ${devices.length} device(s)`,
    );
  }

  private hideAllCards(document: UIKitDocument): void {
    this.slotDeviceMap.clear();
    for (let i = 0; i < CARD_SLOT_COUNT; i++) {
      const cardContainer = document.getElementById(
        `device-card-${i}`,
      ) as UIKit.Container;
      if (cardContainer) {
        cardContainer.setProperties({ display: "none" });
      }
    }
  }

  // ── Public-facing helpers ──────────────────────────────────────────────────

  private switchRoom(roomId: string): void {
    if (!this.activeDocument) return;
    console.log(`[DashboardPanel] Switching to room ${roomId}`);
    this.currentRoomId = roomId;
    this.renderRoom(roomId, this.activeDocument);
  }

  private refreshDashboard(): void {
    if (!this.activeDocument) return;
    this.renderCurrentRoom(this.activeDocument);
  }

  private getCurrentRoomDevices(): Device[] {
    if (!this.currentRoomId) {
      console.log(
        "[DashboardPanel][Home] getCurrentRoomDevices: currentRoomId is null",
      );
      return [];
    }
    const store = getStore();
    const roomData = store.getDevicesByRoom()[this.currentRoomId];
    const devicesFromRoom = this.getDevicesForRoomContext(this.currentRoomId);
    if (devicesFromRoom.length === 0) {
      console.log("[DashboardPanel][Home] getCurrentRoomDevices: no roomData", {
        currentRoomId: this.currentRoomId,
        groupedRooms: Object.keys(store.getDevicesByRoom()),
        storeDevices: store.devices.length,
      });
      return devicesFromRoom;
    }
    console.log("[DashboardPanel][Home] getCurrentRoomDevices resolved:", {
      currentRoomId: this.currentRoomId,
      roomName: roomData?.roomName ?? this.roomNameById.get(this.currentRoomId),
      allDevices: devicesFromRoom.length,
      filteredDevices: devicesFromRoom.length,
      filteredDeviceIds: devicesFromRoom.map((d) => d.id),
    });
    return devicesFromRoom;
  }

  private getDevicesForRoomContext(roomId: string): Device[] {
    const store = getStore();
    const roomMap = store.getDevicesByRoom();
    const direct = roomMap[roomId]?.devices ?? store.getDevicesForRoom(roomId);
    const directFiltered = direct.filter((d) => !isFurniture(d));
    if (directFiltered.length > 0) return directFiltered;

    const roomNameHint = this.roomNameById.get(roomId)?.trim().toLowerCase();
    if (!roomNameHint) return directFiltered;

    // Fallback for backends that return room name in device.room instead of room UUID.
    return store.devices.filter(
      (d) =>
        !isFurniture(d) && d.room_name?.trim().toLowerCase() === roomNameHint,
    );
  }

  private showHomeInformation(document: UIKitDocument): void {
    const devices = this.getCurrentRoomDevices();
    const onlineCount = devices.filter((device) => device.is_on).length;
    const store = getStore();
    const roomMap = store.getDevicesByRoom();

    const welcomeText = document.getElementById("welcome-text") as UIKit.Text;
    if (welcomeText) {
      welcomeText.setProperties({
        text: `${this.homeWelcomeText} | Devices: ${devices.length} (${onlineCount} on)`,
      });
    }

    const currentRoomText = document.getElementById(
      "current-room-text",
    ) as UIKit.Text;
    const roomName = this.currentRoomId
      ? (roomMap[this.currentRoomId]?.roomName ??
        this.roomNameById.get(this.currentRoomId) ??
        "Current Room")
      : "No Room";
    console.log("[DashboardPanel][Home] showHomeInformation payload:", {
      currentRoomId: this.currentRoomId,
      roomName,
      devicesCount: devices.length,
      onlineCount,
      welcomeTextExists: !!welcomeText,
      currentRoomTextExists: !!currentRoomText,
      welcomeTextValue: `${this.homeWelcomeText} | Devices: ${devices.length} (${onlineCount} on)`,
      roomTextValue: `${roomName} | ${devices.length} device(s)`,
    });

    if (currentRoomText) {
      currentRoomText.setProperties({
        text: `${roomName} | ${devices.length} device(s)`,
      });
    }
  }

  private async resolveRoomNameById(roomId: string): Promise<void> {
    if (this.roomNameById.has(roomId) || this.roomNameFetchInFlight.has(roomId)) {
      return;
    }
    this.roomNameFetchInFlight.add(roomId);
    try {
      const room = await getApiClient().getRoom(roomId);
      const name = room?.room_name?.trim();
      if (name) {
        this.roomNameById.set(roomId, name);
      }
      if (this.activeDocument && this.currentRoomId === roomId) {
        this.renderCurrentRoom(this.activeDocument);
      }
    } catch (err) {
      console.warn(`[DashboardPanel] Failed to resolve room name for ${roomId}`, err);
    } finally {
      this.roomNameFetchInFlight.delete(roomId);
    }
  }

  // ── Summon in front of camera (XR) ─────────────────────────────────────────

  private summonPanelInFront(): void {
    const entity = (globalThis as any).__dashboardPanelEntity;
    if (!entity?.object3D) {
      console.warn("[DashboardPanel] Dashboard panel entity not found");
      return;
    }

    const camera = (this.world as any).camera;
    if (!camera) return;

    const forward = new Vector3();
    camera.getWorldDirection(forward);

    const targetX = camera.position.x + forward.x * 0.8;
    const targetY = camera.position.y - 0.2;
    const targetZ = camera.position.z + forward.z * 0.8;

    entity.object3D.position.set(targetX, targetY, targetZ);
    entity.object3D.lookAt(camera.position);
    entity.object3D.visible = true;

    console.log("[DashboardPanel] ✅ Dashboard summoned in front of user");
  }

  // ── Frame update – follow camera gently ────────────────────────────────────

  update(dt: number): void {
    const panel = this.dashboardObject3D;
    const camera = (this.world as any).camera;
    if (!panel || !camera || !panel.visible) return;
    if (!this.isHeadFollowEnabled) return;

    const forward = new Vector3();
    camera.getWorldDirection(forward);

    const targetX = camera.position.x + forward.x * 0.85;
    const targetY = camera.position.y - 0.18;
    const targetZ = camera.position.z + forward.z * 0.85;

    const t = Math.min(1, 4.5 * dt);
    panel.position.x += (targetX - panel.position.x) * t;
    panel.position.y += (targetY - panel.position.y) * t;
    panel.position.z += (targetZ - panel.position.z) * t;
    panel.lookAt(camera.position);
  }
}
