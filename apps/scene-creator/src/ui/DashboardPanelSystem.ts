import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
  Entity,
  VisibilityState,
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
import { setRoomARVisualMode, updateCollisionTransform } from "../config/collision";
import {
  applyColorWallpaper,
  pickAndApplyWallpaper,
  removeAllWallpaper,
} from "../systems/WallpaperSystem";
import { WALLPAPER_PRESETS } from "../utils/wallDetection";
import {
  getBodyTrackingMode,
  setBodyTrackingMode,
} from "../slimevr/slimevrState";
import {
  invalidateUIKitInteractableBVHSchedule,
  scheduleUIKitInteractableBVHRefresh,
} from "./uikitRaycastBVH";

// ── Constants ──────────────────────────────────────────────────────────────────

const CARD_SLOT_COUNT = 8;
/** Slot 0 is the XR quick card; slots 1..7 show room devices (max 7). */
const FIRST_DEVICE_SLOT = 1;

/** Dashboard panel depth in front of the camera (meters). Summon + head-follow use this. */
const DASHBOARD_PANEL_DISTANCE_M = 1.4;
const DASHBOARD_PANEL_Y_OFFSET_SUMMON = -0.2;
const DASHBOARD_PANEL_Y_OFFSET_FOLLOW = -0.18;
/** Index–thumb tip distance below this (meters) counts as a pinch (hand tracking). */
const HAND_PINCH_DISTANCE_M = 0.042;
const MAX_DEVICE_CARD_SLOTS = 7;

const FURNITURE_TYPES = new Set<string>([
  DeviceType.Chair,
  DeviceType.Chair2,
  DeviceType.Chair3,
  DeviceType.Chair4,
  DeviceType.Chair5,
  DeviceType.Chair6,
]);

const COLOR_ON = "#22c55e";
const COLOR_OFF = "#64748b";
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
      return `Vol`;
    case DeviceType.Fan:
      return `Speed`;
    case DeviceType.AirConditioner:
      return `${(device as AirConditioner).temperature} C`;
    case DeviceType.SmartMeter:
      return device.is_on ? "Active" : "Idle";
    default:
      return device.is_on ? "On" : "Off";
  }
}

function getDeviceStatusText(device: Device): string {
  return device.is_on ? "On" : "Off";
}

/** Lucide icon layers in each device card (see dashboard.uikitml ids `card-icon-{slot}-{suffix}`). */
type DeviceCardIconSuffix = "lb" | "tv" | "fan" | "ac" | "meter";

const DEVICE_CARD_ICON_SUFFIXES: DeviceCardIconSuffix[] = [
  "lb",
  "tv",
  "fan",
  "ac",
  "meter",
];

function deviceTypeToCardIconSuffix(type: DeviceType): DeviceCardIconSuffix {
  switch (type) {
    case DeviceType.Lightbulb:
      return "lb";
    case DeviceType.Television:
      return "tv";
    case DeviceType.Fan:
      return "fan";
    case DeviceType.AirConditioner:
      return "ac";
    case DeviceType.SmartMeter:
      return "meter";
    default:
      return "lb";
  }
}

function getDeviceIconWrapStyle(device: Device): {
  backgroundColor: string;
  borderColor: string;
} {
  const offPalette: Partial<
    Record<DeviceType, { backgroundColor: string; borderColor: string }>
  > = {
    [DeviceType.Lightbulb]: {
      backgroundColor: "rgba(234, 179, 8, 0.16)",
      borderColor: "rgba(234, 179, 8, 0.3)",
    },
    [DeviceType.Television]: {
      backgroundColor: "rgba(59, 130, 246, 0.16)",
      borderColor: "rgba(59, 130, 246, 0.3)",
    },
    [DeviceType.Fan]: {
      backgroundColor: "rgba(6, 182, 212, 0.16)",
      borderColor: "rgba(6, 182, 212, 0.3)",
    },
    [DeviceType.AirConditioner]: {
      backgroundColor: "rgba(14, 165, 233, 0.16)",
      borderColor: "rgba(14, 165, 233, 0.3)",
    },
    [DeviceType.SmartMeter]: {
      backgroundColor: "rgba(16, 185, 129, 0.16)",
      borderColor: "rgba(16, 185, 129, 0.3)",
    },
  };
  const fallback = {
    backgroundColor: "rgba(99, 102, 241, 0.12)",
    borderColor: "rgba(99, 102, 241, 0.28)",
  };
  if (device.is_on) {
    return {
      backgroundColor: "rgba(34, 197, 94, 0.18)",
      borderColor: "rgba(34, 197, 94, 0.42)",
    };
  }
  return offPalette[device.type] ?? fallback;
}

/**
 * Apply icon layers with caching to avoid unnecessary setProperties calls
 * that would trigger mesh geometry rebuilds and invalidate the BVH.
 */
function applyDeviceCardIconLayers(
  document: UIKitDocument,
  slotIndex: number,
  device: Device,
  cache: Map<string, any>,
): boolean {
  let changed = false;
  const active = deviceTypeToCardIconSuffix(device.type);
  const cacheKeyType = `icon-type-${slotIndex}`;
  if (cache.get(cacheKeyType) !== active) {
    for (const v of DEVICE_CARD_ICON_SUFFIXES) {
      const layer = document.getElementById(`card-icon-${slotIndex}-${v}`);
      layer?.setProperties?.({
        display: v === active ? "flex" : "none",
        pointerEvents: "none"
      });
    }
    cache.set(cacheKeyType, active);
    changed = true;
  }

  const style = getDeviceIconWrapStyle(device);
  const cacheKeyWrapBg = `icon-wrap-bg-${slotIndex}`;
  const cacheKeyWrapBorder = `icon-wrap-border-${slotIndex}`;
  if (
    cache.get(cacheKeyWrapBg) !== style.backgroundColor ||
    cache.get(cacheKeyWrapBorder) !== style.borderColor
  ) {
    const wrap = document.getElementById(
      `card-icon-wrap-${slotIndex}`,
    ) as UIKit.Container | null;
    if (wrap) {
      wrap.setProperties({ ...style, pointerEvents: "none" });
    }
    cache.set(cacheKeyWrapBg, style.backgroundColor);
    cache.set(cacheKeyWrapBorder, style.borderColor);
    // wrap background color change doesn't need layout rebuild, but we return true just in case the active changes too
  }
  return changed;
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
  private voiceStatus: string = "Idle";
  /** Avoid BVH refresh spam when voice hooks repeat the same status string. */
  private lastVoiceStatusLabelApplied = "";
  private lastVoiceStatusDotColorApplied = "";
  private homeWelcomeText = "Welcome, User";
  private unsubscribeVisibility?: () => void;
  private refreshDashboardXRSectionUI?: () => void;
  private uiPropertyCache = new Map<string, any>();

  // Map card slot index → device id for click handling
  private slotDeviceMap: Map<number, string> = new Map();

  /** Meta Quest 3 (Touch) WebXR gamepad: 0 trigger, 1 squeeze/grip, 3 thumbstick press */
  private xrSession: XRSession | null = null;
  private xrFrameCallbackId: number | null = null;
  private lastXRGripPressed = new Map<XRInputSource, boolean>();
  private lastXRThumbstickPressed = new Map<XRInputSource, boolean>();
  /** Per hand input source: previous frame pinch (index+thumb) state for edge detection */
  private lastXRHandPinchPressed = new Map<XRInputSource, boolean>();
  private xrGripCooldown = 0;
  private xrThumbstickCooldown = 0;
  private readonly XR_INPUT_COOLDOWN_SEC = 0.45;

  private readonly onXRSessionStart = (): void => {
    console.log(
      "[DashboardPanel] XR session started — Meta Quest 3 dashboard controls (grip: follow, thumbstick: hide/show)",
    );
    const session = this.renderer.xr.getSession();
    if (!session) return;
    this.xrSession = session;
    this.xrGripCooldown = 0;
    this.xrThumbstickCooldown = 0;
    this.lastXRGripPressed.clear();
    this.lastXRThumbstickPressed.clear();
    this.lastXRHandPinchPressed.clear();
    this.startXRInputFrameLoop();
    this.scheduleDashboardBVHRefresh();
  };

  private readonly onXRSessionEnd = (): void => {
    if (this.xrFrameCallbackId !== null && this.xrSession) {
      this.xrSession.cancelAnimationFrame(this.xrFrameCallbackId);
      this.xrFrameCallbackId = null;
    }
    this.xrSession = null;
    this.lastXRGripPressed.clear();
    this.lastXRThumbstickPressed.clear();
    this.lastXRHandPinchPressed.clear();
    this.xrGripCooldown = 0;
    this.xrThumbstickCooldown = 0;
    console.log("[DashboardPanel] XR session ended — dashboard controller input stopped");
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init(): void {
    console.log("[DashboardPanel] System initialized");

    this.renderer.xr.addEventListener("sessionstart", this.onXRSessionStart);
    this.renderer.xr.addEventListener("sessionend", this.onXRSessionEnd);
    if (this.renderer.xr.isPresenting) {
      queueMicrotask(() => this.onXRSessionStart());
    }

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
    this.renderer.xr.removeEventListener("sessionstart", this.onXRSessionStart);
    this.renderer.xr.removeEventListener("sessionend", this.onXRSessionEnd);
    this.onXRSessionEnd();

    invalidateUIKitInteractableBVHSchedule(this.dashboardObject3D);

    this.unsubscribeDevices?.();
    this.unsubscribeDevices = undefined;
    this.unsubscribeVisibility?.();
    this.unsubscribeVisibility = undefined;
    this.refreshDashboardXRSectionUI = undefined;
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
        if (!isVisible) {
          this.scheduleDashboardBVHRefresh();
        }
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
    this.setupXRSection(document);
    this.setupVoiceAssistantPanel(document);
    this.setupPlacementSection(document);
    this.setupWallpaperSection(document);

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

  /**
   * Hand tracking: index–thumb pinch. Mirrors controllers — left hand → follow toggle,
   * right hand → dashboard visibility (requires `hand-tracking` and `frame.getHandPose`, as in WelcomePanelGestureSystem).
   */
  private processHandPinchForDashboard(frame: XRFrame): void {
    if (!this.xrSession) return;
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    if (!referenceSpace) return;

    const getHandPose = (frame as XRFrame & { getHandPose?: (h: XRHand) => { joints: Map<string, { transform: XRRigidTransform }> } | null }).getHandPose;
    if (!getHandPose) return;

    for (const inputSource of this.xrSession.inputSources) {
      const hand = (inputSource as XRInputSource & { hand?: XRHand }).hand;
      if (!hand) continue;

      const handedness = inputSource.handedness;
      if (handedness !== "left" && handedness !== "right") continue;

      const handPose = getHandPose.call(frame, hand);
      if (!handPose?.joints) continue;

      const thumbTip = handPose.joints.get("thumb-tip");
      const indexTip = handPose.joints.get("index-finger-tip");
      if (!thumbTip || !indexTip) continue;

      try {
        const thumbPose = frame.getPose(
          thumbTip.transform as unknown as XRSpace,
          referenceSpace,
        );
        const indexPose = frame.getPose(
          indexTip.transform as unknown as XRSpace,
          referenceSpace,
        );
        if (!thumbPose || !indexPose) continue;

        const tx = thumbPose.transform.position.x - indexPose.transform.position.x;
        const ty = thumbPose.transform.position.y - indexPose.transform.position.y;
        const tz = thumbPose.transform.position.z - indexPose.transform.position.z;
        const dist = Math.sqrt(tx * tx + ty * ty + tz * tz);
        const pinching = dist < HAND_PINCH_DISTANCE_M;

        const was = this.lastXRHandPinchPressed.get(inputSource) ?? false;
        if (pinching && !was) {
          if (handedness === "left" && this.xrGripCooldown <= 0) {
            this.toggleFollowMode();
            this.xrGripCooldown = this.XR_INPUT_COOLDOWN_SEC;
            console.log("[DashboardPanel] Left hand pinch — follow toggle");
          } else if (handedness === "right" && this.xrThumbstickCooldown <= 0) {
            this.toggleDashboardVisibilityFromXR();
            this.xrThumbstickCooldown = this.XR_INPUT_COOLDOWN_SEC;
            console.log("[DashboardPanel] Right hand pinch — dashboard visibility");
          }
        }
        this.lastXRHandPinchPressed.set(inputSource, pinching);
      } catch {
        // Hand API may be partially unavailable
      }
    }
  }

  private startXRInputFrameLoop(): void {
    if (!this.xrSession) return;
    if (this.xrFrameCallbackId !== null) {
      this.xrSession.cancelAnimationFrame(this.xrFrameCallbackId);
      this.xrFrameCallbackId = null;
    }

    const onFrame = (_time: number, frame: XRFrame) => {
      if (!this.xrSession) return;

      const frameDt = 1 / 72;
      if (this.xrGripCooldown > 0) {
        this.xrGripCooldown -= frameDt;
        if (this.xrGripCooldown < 0) this.xrGripCooldown = 0;
      }
      if (this.xrThumbstickCooldown > 0) {
        this.xrThumbstickCooldown -= frameDt;
        if (this.xrThumbstickCooldown < 0) this.xrThumbstickCooldown = 0;
      }

      try {
        for (const inputSource of this.xrSession.inputSources) {
          if (inputSource.hand) continue;
          const gamepad = inputSource.gamepad;
          if (!gamepad?.buttons?.length) continue;

          const gripBtn = gamepad.buttons[1];
          const thumbBtn = gamepad.buttons[3];
          if (gripBtn) {
            const pressed = gripBtn.pressed;
            const was = this.lastXRGripPressed.get(inputSource) ?? false;
            if (pressed && !was && this.xrGripCooldown <= 0) {
              this.toggleFollowMode();
              this.xrGripCooldown = this.XR_INPUT_COOLDOWN_SEC;
              console.log(
                `[DashboardPanel] Grip (squeeze) — follow toggle (${inputSource.handedness || "?"})`,
              );
            }
            this.lastXRGripPressed.set(inputSource, pressed);
          }
          if (thumbBtn) {
            const pressed = thumbBtn.pressed;
            const was = this.lastXRThumbstickPressed.get(inputSource) ?? false;
            if (pressed && !was && this.xrThumbstickCooldown <= 0) {
              this.toggleDashboardVisibilityFromXR();
              this.xrThumbstickCooldown = this.XR_INPUT_COOLDOWN_SEC;
              console.log(
                `[DashboardPanel] Thumbstick click — dashboard visibility (${inputSource.handedness || "?"})`,
              );
            }
            this.lastXRThumbstickPressed.set(inputSource, pressed);
          }
        }
      } catch (e) {
        console.debug("[DashboardPanel] XR controller poll error:", e);
      }

      try {
        this.processHandPinchForDashboard(frame);
      } catch (e) {
        console.debug("[DashboardPanel] XR hand pinch error:", e);
      }

      if (this.xrSession) {
        this.xrFrameCallbackId = this.xrSession.requestAnimationFrame(onFrame);
      }
    };

    this.xrFrameCallbackId = this.xrSession.requestAnimationFrame(onFrame);
    console.log(
      "[DashboardPanel] Controllers: squeeze/grip = head-follow · thumbstick click = show/hide · Hands: left pinch = follow · right pinch = show/hide",
    );
  }

  /** Same as keyboard U / __toggleDashboardPanel — works before PanelDocument qualifies. */
  private toggleDashboardVisibilityFromXR(): void {
    const entity =
      this.activeEntity ?? (globalThis as any).__dashboardPanelEntity;
    if (entity?.object3D) {
      entity.object3D.visible = !entity.object3D.visible;
      console.log(
        `[DashboardPanel] Dashboard ${entity.object3D.visible ? "shown" : "hidden"}`,
      );
    }
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
    // User settings – decorative for now
  }

  // ── Sidebar Rail ───────────────────────────────────────────────────────────

  private setupSidebarRail(document: UIKitDocument): void {
    const railIds = [
      "rail-home-btn",
      "rail-devices-btn",
      "rail-wallpaper-btn",
      "rail-mic-btn",
      "rail-xr-btn",
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
      // Match welcome panel: style updates can rebuild UIKit meshes — refresh BVH so the XR hit dot stays valid.
      this.scheduleDashboardBVHRefresh();
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

    const railWallpaperBtn = document.getElementById("rail-wallpaper-btn");
    if (railWallpaperBtn) {
      railWallpaperBtn.addEventListener("click", () => {
        setActiveRail("rail-wallpaper-btn");
        this.showDashboardWallpaperSection(document);
        const placementEntity = (globalThis as any).__placementPanelEntity;
        if (placementEntity?.object3D) placementEntity.object3D.visible = false;
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

    // AR / VR → open XR controls (mode + enter / exit immersive)
    const railXrBtn = document.getElementById("rail-xr-btn");
    if (railXrBtn) {
      railXrBtn.addEventListener("click", () => {
        setActiveRail("rail-xr-btn");
        this.showDashboardXRSection(document);
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
      // Mirror voice dialogue into the 3D dashboard voice section.
      onUserMessage: (text: string) => {
        this.setVoiceDialogueLine(document, "You", text);
      },
      onAssistantMessage: (text: string) => {
        this.setVoiceDialogueLine(document, "Assistant", text);
      },
      onSystemMessage: (text: string) => {
        this.setVoiceDialogueLine(document, "System", text);
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
  }

  private showDashboardHomeSection(document: UIKitDocument): void {
    this.showDashboardSection(document, "home");
  }

  private showDashboardPlacementSection(document: UIKitDocument): void {
    this.showDashboardSection(document, "placement");
  }

  private showDashboardWallpaperSection(document: UIKitDocument): void {
    this.showDashboardSection(document, "wallpaper");
  }

  private showDashboardAlignmentSection(document: UIKitDocument): void {
    this.showDashboardSection(document, "alignment");
  }

  private showDashboardXRSection(document: UIKitDocument): void {
    this.showDashboardSection(document, "xr");
    this.refreshDashboardXRSectionUI?.();
  }

  private showDashboardSection(
    document: UIKitDocument,
    section: "home" | "voice" | "placement" | "alignment" | "xr" | "wallpaper",
  ): void {
    const deviceGrid = document.getElementById("device-grid") as UIKit.Container;
    if (deviceGrid) {
      deviceGrid.setProperties({ display: section === "home" ? "flex" : "none" });
    }

    const voiceSection = document.getElementById("voice-section") as UIKit.Container;
    if (voiceSection) {
      voiceSection.setProperties({ display: section === "voice" ? "flex" : "none" });
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

    const xrSection = document.getElementById("xr-section") as UIKit.Container;
    if (xrSection) {
      xrSection.setProperties({
        display: section === "xr" ? "flex" : "none",
      });
    }

    const wallpaperSection = document.getElementById(
      "wallpaper-section",
    ) as UIKit.Container;
    if (wallpaperSection) {
      wallpaperSection.setProperties({
        display: section === "wallpaper" ? "flex" : "none",
      });
    }

    this.scheduleDashboardBVHRefresh();
  }

  /** AR/VR mode + immersive enter/exit (aligned with welcome `panel.ts`). */
  private setupXRSection(document: UIKitDocument): void {
    const vrBtn = document.getElementById("dash-vr-mode-btn") as UIKit.Container;
    const arBtn = document.getElementById("dash-ar-mode-btn") as UIKit.Container;
    const primaryBtn = document.getElementById("dash-xr-primary-btn");
    const primaryText = document.getElementById(
      "dash-xr-primary-text",
    ) as UIKit.Text;
    const xrCardPrimaryBtn = document.getElementById("xr-card-primary-btn");
    const xrCardPrimaryText = document.getElementById(
      "xr-card-primary-text",
    ) as UIKit.Text;

    const readARPreference = (): boolean =>
      (globalThis as any).__sceneMode === "ar";

    const updateModeChrome = () => {
      const ar = readARPreference();
      // Match `.xr-mode-btn-on` / `.xr-mode-btn-off` in dashboard.uikitml: inactive uses a
      // light surface so `.xr-mode-btn-text` (#1e293b) stays readable (dark-on-dark was
      // nearly invisible).
      const activeBg = "rgba(124, 58, 237, 0.84)";
      const activeBorder = "rgba(124, 58, 237, 1)";
      const inactiveBg = "rgba(255, 255, 255, 0.24)";
      const inactiveBorder = "rgba(255, 255, 255, 0.36)";
      if (vrBtn) {
        vrBtn.setProperties({
          backgroundColor: ar ? inactiveBg : activeBg,
          borderColor: ar ? inactiveBorder : activeBorder,
        });
      }
      if (arBtn) {
        arBtn.setProperties({
          backgroundColor: ar ? activeBg : inactiveBg,
          borderColor: ar ? activeBorder : inactiveBorder,
        });
      }
    };

    const updatePrimaryLabels = () => {
      const welcomeXrText = document.getElementById(
        "xr-button-text",
      ) as UIKit.Text;
      const ar = readARPreference();
      const nonImmersive =
        this.world.visibilityState.value === VisibilityState.NonImmersive;
      const label = nonImmersive
        ? ar
          ? "Enter AR"
          : "Enter VR"
        : ar
          ? "Exit AR"
          : "Exit VR";
      primaryText?.setProperties?.({ text: label });
      xrCardPrimaryText?.setProperties?.({ text: label });
      welcomeXrText?.setProperties?.({ text: label });
    };

    const applyMode = (ar: boolean) => {
      (globalThis as any).__sceneMode = ar ? "ar" : "vr";

      const roomModel = (globalThis as any).__labRoomModel;
      setRoomARVisualMode(roomModel, ar);

      updateModeChrome();
      updatePrimaryLabels();
      this.scheduleDashboardBVHRefresh();
      console.log(`[DashboardPanel] XR mode preference: ${ar ? "AR" : "VR"}`);
    };

    if ((globalThis as any).__sceneMode === undefined) {
      (globalThis as any).__sceneMode = "vr";
    }
    updateModeChrome();
    updatePrimaryLabels();
    this.scheduleDashboardBVHRefresh();

    vrBtn?.addEventListener("click", () => applyMode(false));
    arBtn?.addEventListener("click", () => applyMode(true));

    const handleXrClick = async () => {
      if (this.world.visibilityState.value === VisibilityState.NonImmersive) {
        if (!navigator.xr) {
          console.warn(
            "[DashboardPanel] WebXR not available (HTTPS / compatible browser required).",
          );
          return;
        }
        const sessionMode = readARPreference() ? "immersive-ar" : "immersive-vr";
        try {
          const supported = await navigator.xr.isSessionSupported(sessionMode);
          if (!supported) {
            console.warn(
              `[DashboardPanel] Session mode "${sessionMode}" is not supported.`,
            );
            return;
          }
        } catch (e) {
          console.warn("[DashboardPanel] isSessionSupported failed:", e);
        }
        try {
          await this.world.launchXR();
        } catch (err) {
          console.error("[DashboardPanel] launchXR failed:", err);
        }
      } else {
        this.world.exitXR();
      }
    };

    primaryBtn?.addEventListener("click", () => {
      void handleXrClick();
    });
    xrCardPrimaryBtn?.addEventListener("click", () => {
      void handleXrClick();
    });

    this.refreshDashboardXRSectionUI = () => {
      updateModeChrome();
      updatePrimaryLabels();
      this.scheduleDashboardBVHRefresh();
    };

    const sub = this.world.visibilityState.subscribe(() => {
      updatePrimaryLabels();
      this.scheduleDashboardBVHRefresh();
    });
    if (typeof sub === "function") {
      this.unsubscribeVisibility = sub;
    }

    this.setupBodyTrackingToggle(document);
  }

  /** SlimeVR WebSocket debug markers vs off (see SlimeVRFullBodySystem). */
  private setupBodyTrackingToggle(document: UIKitDocument): void {
    const slimevrBtn = document.getElementById(
      "dash-body-slimevr-btn",
    ) as UIKit.Container;
    const offBtn = document.getElementById(
      "dash-body-off-btn",
    ) as UIKit.Container;

    const activeBg = "rgba(124, 58, 237, 0.84)";
    const activeBorder = "rgba(124, 58, 237, 1)";
    const inactiveBg = "rgba(255, 255, 255, 0.24)";
    const inactiveBorder = "rgba(255, 255, 255, 0.36)";

    const updateBodyTrackingChrome = () => {
      const slimevr = getBodyTrackingMode() === "slimevr";
      slimevrBtn?.setProperties({
        backgroundColor: slimevr ? activeBg : inactiveBg,
        borderColor: slimevr ? activeBorder : inactiveBorder,
      });
      offBtn?.setProperties({
        backgroundColor: !slimevr ? activeBg : inactiveBg,
        borderColor: !slimevr ? activeBorder : inactiveBorder,
      });
      this.scheduleDashboardBVHRefresh();
    };

    updateBodyTrackingChrome();

    slimevrBtn?.addEventListener("click", () => {
      setBodyTrackingMode("slimevr");
      updateBodyTrackingChrome();
      console.log("[DashboardPanel] Body tracking: SlimeVR");
    });
    offBtn?.addEventListener("click", () => {
      setBodyTrackingMode("off");
      updateBodyTrackingChrome();
      console.log("[DashboardPanel] Body tracking: off (animated legs only)");
    });
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
  }

  private setupWallpaperSection(document: UIKitDocument): void {
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
    this.scheduleDashboardBVHRefresh();
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

    this.setVoiceStatus(document, "Not ready — try again in a moment.");
  }

  private setVoiceStatus(document: UIKitDocument, text: string): void {
    this.voiceStatus = text;
    const label = document.getElementById("voice-status-inline") as UIKit.Text;
    if (label) {
      label.setProperties({ text });
    }
    // Update status dot color to give visual feedback
    const dot = document.getElementById("voice-status-dot") as UIKit.Container;
    let dotColor = "";
    if (dot) {
      const lower = text.toLowerCase();
      dotColor = "#64748b"; // Idle — slate
      if (lower.includes("listen") || lower.includes("active")) {
        dotColor = "#7c3aed"; // Listening / Active — purple
      } else if (lower === "active") {
        dotColor = "#22c55e"; // Active — green
      }
      dot.setProperties({ backgroundColor: dotColor });
    }
    const labelChanged = text !== this.lastVoiceStatusLabelApplied;
    const dotChanged =
      dotColor !== "" && dotColor !== this.lastVoiceStatusDotColorApplied;
    if (labelChanged || dotChanged) {
      this.lastVoiceStatusLabelApplied = text;
      if (dotColor !== "") this.lastVoiceStatusDotColorApplied = dotColor;
      this.scheduleDashboardBVHRefresh();
    }
  }

  private setVoiceDialogueLine(
    document: UIKitDocument,
    speaker: "You" | "Assistant" | "System",
    message: string,
  ): void {
    const clean = message.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const short =
      clean.length > 68 ? `${clean.slice(0, 65).trimEnd()}...` : clean;
    this.setVoiceStatus(document, `${speaker}: ${short}`);
  }

  // ── Card Interactions ──────────────────────────────────────────────────────

  private setupCardInteractions(document: UIKitDocument): void {
    for (let i = FIRST_DEVICE_SLOT; i < CARD_SLOT_COUNT; i++) {
      const slotIndex = i;

      // Power toggle
      const toggleBtn = document.getElementById(`toggle-wrap-${i}`) || document.getElementById(`card-toggle-${i}`);
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
    if (import.meta.env.DEV) {
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
    }

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

    // Track whether any UI property actually changed — only refresh BVH if so.
    let anyPropertyChanged = false;
    let anyLayoutPropertyChanged = false;

    // Slot 0: XR quick card (always visible when the grid is shown)
    const xrCard = document.getElementById("device-card-0") as UIKit.Container;
    if (xrCard) {
      if (this.uiPropertyCache.get("xr-card-display") !== "flex") {
        xrCard.setProperties({ display: "flex" });
        this.uiPropertyCache.set("xr-card-display", "flex");
        anyLayoutPropertyChanged = true;
      }
    }

    for (let i = FIRST_DEVICE_SLOT; i < CARD_SLOT_COUNT; i++) {
      const deviceIndex = i - FIRST_DEVICE_SLOT;
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
      if (deviceIndex < devices.length && deviceIndex < MAX_DEVICE_CARD_SLOTS) {
        const device = devices[deviceIndex];
        this.slotDeviceMap.set(i, device.id);

        if (cardContainer) {
          const displayKey = `container-display-${i}`;
          if (this.uiPropertyCache.get(displayKey) !== "flex") {
            cardContainer.setProperties({ display: "flex" });
            this.uiPropertyCache.set(displayKey, "flex");
            anyLayoutPropertyChanged = true;
          }
        }

        if (cardName) {
          const val = device.name;
          if (this.uiPropertyCache.get(`name-${i}`) !== val) {
            cardName.setProperties({ text: val, pointerEvents: "none" });
            this.uiPropertyCache.set(`name-${i}`, val);
            anyLayoutPropertyChanged = true;
          }
        }

        if (cardStatus) {
          const val = getDeviceStatusText(device);
          if (this.uiPropertyCache.get(`status-${i}`) !== val) {
            cardStatus.setProperties({ text: val, pointerEvents: "none" });
            this.uiPropertyCache.set(`status-${i}`, val);
            anyLayoutPropertyChanged = true;
          }
        }

        if (cardValue) {
          const val = getDeviceValueText(device);
          if (this.uiPropertyCache.get(`value-${i}`) !== val) {
            cardValue.setProperties({ text: val, pointerEvents: "none" });
            this.uiPropertyCache.set(`value-${i}`, val);
            anyLayoutPropertyChanged = true;
          }
        }

        if (cardToggle) {
          const val = device.is_on ? COLOR_ON : COLOR_OFF;
          if (this.uiPropertyCache.get(`toggle-${i}`) !== val) {
            cardToggle.setProperties({ backgroundColor: val });
            this.uiPropertyCache.set(`toggle-${i}`, val);
            anyPropertyChanged = true;
          }
        }

        if (applyDeviceCardIconLayers(document, i, device, this.uiPropertyCache)) {
          anyLayoutPropertyChanged = true;
        }
      } else {
        this.slotDeviceMap.delete(i);
        if (cardContainer) {
          const displayKey = `container-display-${i}`;
          if (this.uiPropertyCache.get(displayKey) !== "none") {
            cardContainer.setProperties({ display: "none" });
            this.uiPropertyCache.set(displayKey, "none");
            anyLayoutPropertyChanged = true;
          }
        }
      }
    }

    if (import.meta.env.DEV) {
      console.log(
        `[DashboardPanel] Rendered room "${roomMap[roomId]?.roomName ?? this.roomNameById.get(roomId) ?? roomId}" with ${devices.length} device(s) (max ${MAX_DEVICE_CARD_SLOTS} shown in grid)${anyLayoutPropertyChanged ? " [Layout updated]" : anyPropertyChanged ? " [Props updated]" : " [no change]"}`,
      );
    }

    // UIKit may rebuild glyph/mesh buffers on text *or* color updates. A stale
    // three-mesh-bVH tree yields ray misses and hides the XR pointer dot.
    if (anyLayoutPropertyChanged || anyPropertyChanged) {
      this.scheduleDashboardBVHRefresh();
    }
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
    this.scheduleDashboardBVHRefresh();
  }

  /** After UIKit DOM-style updates, rebuild BVHs so XR laser hits match the new layout. */
  private scheduleDashboardBVHRefresh(): void {
    scheduleUIKitInteractableBVHRefresh(this.dashboardObject3D);
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
      if (import.meta.env.DEV) {
        console.log(
          "[DashboardPanel][Home] getCurrentRoomDevices: currentRoomId is null",
        );
      }
      return [];
    }
    const store = getStore();
    const roomData = store.getDevicesByRoom()[this.currentRoomId];
    const devicesFromRoom = this.getDevicesForRoomContext(this.currentRoomId);
    if (devicesFromRoom.length === 0) {
      if (import.meta.env.DEV) {
        console.log(
          "[DashboardPanel][Home] getCurrentRoomDevices: no roomData",
          {
            currentRoomId: this.currentRoomId,
            groupedRooms: Object.keys(store.getDevicesByRoom()),
            storeDevices: store.devices.length,
          },
        );
      }
      return devicesFromRoom;
    }
    if (import.meta.env.DEV) {
      console.log("[DashboardPanel][Home] getCurrentRoomDevices resolved:", {
        currentRoomId: this.currentRoomId,
        roomName: roomData?.roomName ?? this.roomNameById.get(this.currentRoomId),
        allDevices: devicesFromRoom.length,
        filteredDevices: devicesFromRoom.length,
        filteredDeviceIds: devicesFromRoom.map((d) => d.id),
      });
    }
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
    if (import.meta.env.DEV) {
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
    }

    if (currentRoomText) {
      currentRoomText.setProperties({
        text: `${roomName} | ${devices.length} device(s)`,
      });
    }
    this.scheduleDashboardBVHRefresh();
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

    const targetX = camera.position.x + forward.x * DASHBOARD_PANEL_DISTANCE_M;
    const targetY = camera.position.y + DASHBOARD_PANEL_Y_OFFSET_SUMMON;
    const targetZ = camera.position.z + forward.z * DASHBOARD_PANEL_DISTANCE_M;

    entity.object3D.position.set(targetX, targetY, targetZ);
    entity.object3D.lookAt(camera.position);
    entity.object3D.visible = true;

    this.scheduleDashboardBVHRefresh();

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

    const targetX = camera.position.x + forward.x * DASHBOARD_PANEL_DISTANCE_M;
    const targetY = camera.position.y + DASHBOARD_PANEL_Y_OFFSET_FOLLOW;
    const targetZ = camera.position.z + forward.z * DASHBOARD_PANEL_DISTANCE_M;

    const t = Math.min(1, 4.5 * dt);
    panel.position.x += (targetX - panel.position.x) * t;
    panel.position.y += (targetY - panel.position.y) * t;
    panel.position.z += (targetZ - panel.position.z) * t;
    panel.lookAt(camera.position);
  }
}
