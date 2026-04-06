import {
  AssetManifest,
  AssetType,
  SessionMode,
  World,
  AssetManager,
  PanelUI,
  Interactable,
} from "@iwsdk/core";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { getAuth } from "./api/auth";
import { getWebSocketClient } from "./api/WebSocketClient";
import { sceneNotify, SN_ICONS } from "./ui/SceneNotification";
import { getStore } from "./store/DeviceStore";
import { DeviceComponent } from "./components/DeviceComponent";
import { UserControlledAvatarComponent } from "./components/UserControlledAvatarComponent";
import { RobotAssistantComponent } from "./components/RobotAssistantComponent";
import { NPCAvatarComponent } from "./components/NPCAvatarComponent";
import { DeviceRendererSystem } from "./systems/DeviceRendererSystem";
import { DeviceInteractionSystem } from "./systems/DeviceInteractionSystem";
import { UserControlledAvatarSystem } from "./systems/UserControlledAvatarSystem";
import { RPMUserControlledAvatarSystem } from "./systems/RPMUserControlledAvatarSystem";
import { SlimeVRFullBodySystem } from "./systems/SlimeVRFullBodySystem";
import { initBodyTrackingModeFromUrl } from "./slimevr/slimevrState";
import { RobotAssistantSystem } from "./systems/RobotAssistantSystem";
import { NPCAvatarSystem } from "./systems/NPCAvatarSystem";
import { PanelSystem } from "./ui/panel";
import { LightbulbPanelSystem } from "./ui/LightbulbPanelSystem";
import { TelevisionPanelSystem } from "./ui/TelevisionPanelSystem";
import { FanPanelSystem } from "./ui/FanPanelSystem";
import { AirConditionerPanelSystem } from "./ui/AirConditionerPanelSystem";
import { GraphPanelSystem } from "./ui/GraphPanelSystem";
import { SmartMeterPanelSystem } from "./ui/SmartMeterPanelSystem";
import { VoicePanelSystem } from "./ui/VoicePanelSystem";
// import { VoicePanel } from "./ui/VoicePanel"; // Legacy DOM panel
import { RoomScanningSystem } from "./systems/RoomScanningSystem";
import { LegPoseLoggerSystem } from "./systems/LegPoseLoggerSystem";
import { setupPCLegPoseSimulator } from "./utils/pcLegPoseSimulator";
import { DevicePlacementSystem } from "./systems/DevicePlacementSystem";
import { PlacementPanelSystem } from "./ui/PlacementPanelSystem";
import { WelcomePanelGestureSystem } from "./systems/WelcomePanelGestureSystem";
import { XRInstructionSystem } from "./systems/XRInstructionSystem";
import { WallpaperSystem } from "./systems/WallpaperSystem";
import { WallpaperCutoutPanelSystem } from "./ui/WallpaperCutoutPanelSystem";
import { DashboardPanelSystem } from "./ui/DashboardPanelSystem";
import {
  initializeNavMesh,
  getRoomBounds,
  setRoomTransform,
} from "./config/navmesh";
import {
  FLOOR_WALK_COLLISION_ROOT_NAME,
  initializeCollision,
  setRoomARVisualMode,
  updateCollisionTransform,
  wrapRoomInteriorVisual,
} from "./config/collision";
import { config } from "./config/env";
import {
  type ControllableAvatarSystem,
  registerAvatar,
  setAvatarSwitcherCamera,
  setOnAvatarSwitch,
  setupAvatarSwitcherPanel,
} from "./ui/AvatarSwitcherPanel";
import {
  speakGreeting,
  speakSeeYouAgain,
  speakCompletion,
  speakNoMatch,
} from "./utils/VoiceTextToSpeech";
import * as LucideIconsKit from "@pmndrs/uikit-lucide";

const assets: AssetManifest = {
  chimeSound: {
    url: "./audio/chime.mp3",
    type: AssetType.Audio,
    priority: "background",
  },
  room_scene: {
    url: `${import.meta.env.BASE_URL}models/scenes/lab_plan/LabPlan.gltf`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  /** Cutout floor only — invisible child under LabPlan; used for walk / hasFloorBelow. */
  room_floor_walk: {
    url: `${import.meta.env.BASE_URL}models/floor_cutout/FloorMesh.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  lightbulb: {
    url: `${import.meta.env.BASE_URL}models/devices/ceiling_lamp/scene.gltf`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  television: {
    url: `${import.meta.env.BASE_URL}models/devices/television/scene.gltf`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  fan: {
    url: `${import.meta.env.BASE_URL}models/devices/fan/scene.gltf`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  air_conditioner: {
    url: `${import.meta.env.BASE_URL}models/devices/air_conditioner/scene.gltf`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  smartmeter: {
    url: `${import.meta.env.BASE_URL}models/devices/smartmeter/scene.gltf`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  soldier_model: {
    url: `${import.meta.env.BASE_URL}models/avatar/resident/Soldier.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  rpmBone_model: {
    url: `${import.meta.env.BASE_URL}models/avatar/resident/RPM_bone.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  rpmClip_model: {
    url: `${import.meta.env.BASE_URL}models/avatar/resident/RPM_clip.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  rpmClip_model1: {
    url: `${import.meta.env.BASE_URL}models/avatar/resident/MediumRes12.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  robot_assistant: {
    url: `${import.meta.env.BASE_URL}models/avatar/assistant/robot_3D_scene.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  npc_1: {
    url: `${import.meta.env.BASE_URL}models/avatar/npc/NPC_4.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  npc_2: {
    url: `${import.meta.env.BASE_URL}models/avatar/npc/NPC_7.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  npc_3: {
    url: `${import.meta.env.BASE_URL}models/avatar/npc/NPC_10.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  npc_4: {
    url: `${import.meta.env.BASE_URL}models/avatar/npc/NPC_11.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair: {
    url: `${import.meta.env.BASE_URL}models/furnitures/chair/chair.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair2: {
    url: `${import.meta.env.BASE_URL}models/furnitures/chair2/B07B4DBBPY.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair3: {
    url: `${import.meta.env.BASE_URL}models/furnitures/chair3/B07B7B244W.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair4: {
    url: `${import.meta.env.BASE_URL}models/furnitures/chair4/B073G6GTKL.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair5: {
    url: `${import.meta.env.BASE_URL}models/furnitures/chair5/B075X33T21.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair6: {
    url: `${import.meta.env.BASE_URL}models/furnitures/chair6/B071W5VD5C.glb`,
    type: AssetType.GLTF,
    priority: "critical",
  },
};

async function main(): Promise<void> {
  const auth = getAuth();
  const isAuthenticated = await auth.initialize();

  if (!isAuthenticated) {
    console.error("❌ Authentication failed");
    return;
  }

  const world = await World.create(
    document.getElementById("scene-container") as HTMLDivElement,
    {
      assets,
      xr: {
        sessionMode: SessionMode.ImmersiveAR,
        offer: "always",
        features: {
          handTracking: true,
          anchors: true,
          hitTest: true,
          planeDetection: true,
          meshDetection: true,
          layers: true,
        },
      },
      features: {
        locomotion: false,
        grabbing: true,
        physics: false,
        sceneUnderstanding: true,
        spatialUI: {
          kits: [LucideIconsKit],
        },
      },
    },
  );

  // --- Quest 3 WebXR Performance Optimizations ---
  try {
    const renderer = (world as any).renderer;
    if (renderer) {
      // 1. Cap pixel ratio to save fill-rate on heavy mobile VR displays
      renderer.setPixelRatio(1);

      // 2. Disable heavy shadow mapping
      if (renderer.shadowMap) {
        renderer.shadowMap.enabled = false;
      }

      // 3. Enable maximum Fixed Foveated Rendering (FFR) for Quest
      if (renderer.xr) {
        // Only works for layers/VR on supported devices
        if (typeof renderer.xr.setFoveation === "function") {
          renderer.xr.setFoveation(1.0);
        }

        // 4. Target 72Hz specifically for Quest 3 to limit instant lag during heavy rendering
        renderer.xr.addEventListener("sessionstart", () => {
          const session = renderer.xr.getSession();
          if (session && session.supportedFrameRates) {
            try {
              // If 72hz is supported (Quest 2/3), specifically request it to save 25% render budget
              if (Array.from(session.supportedFrameRates).includes(72)) {
                session.updateRenderState({ targetFrameRate: 72 });
              }
            } catch (e) {
              console.warn("Failed to set target frame rate", e);
            }
          }
        });
      }
    }
  } catch (err) {
    console.warn("⚠️ Could not apply custom renderer optimizations:", err);
  }
  // -----------------------------------------------

  initBodyTrackingModeFromUrl();

  // On desktop without WebXR (no navigator.xr), start a simple fake leg
  // motion so logging + debug panels can be tested without a headset.
  setupPCLegPoseSimulator();

  const { camera } = world;

  camera.position.set(0, 1.6, 0.5);

  // Room model loading — supports both preloaded assets and dynamically uploaded models
  const ROOM_MODEL_ASSET_MAP: Record<string, string> = {
    LabPlan: "room_scene",
  };

  let currentRoomModel: any = null;

  const buildRoomModelUrlCandidates = (modelFileUrl: string): string[] => {
    const candidates: string[] = [];

    const toAbsoluteUrl = (url: string): string => {
      if (url.startsWith("http://") || url.startsWith("https://")) return url;

      const backendUrl = config.BACKEND_URL.replace(/\/$/, "");
      const normalizedPath = url.startsWith("/") ? url : `/${url}`;
      return `${backendUrl}${normalizedPath}`;
    };

    const absoluteBase = toAbsoluteUrl(modelFileUrl);
    candidates.push(absoluteBase);

    try {
      const parsed = new URL(absoluteBase);
      const path = parsed.pathname;

      // Support deployments that expose media on different prefixes.
      if (path.startsWith("/smarthome/api/media/")) {
        candidates.push(
          `${parsed.origin}${path.replace("/smarthome/api/media/", "/api/media/")}`,
        );
        candidates.push(
          `${parsed.origin}${path.replace("/smarthome/api/media/", "/media/")}`,
        );
      } else if (path.startsWith("/api/media/")) {
        candidates.push(
          `${parsed.origin}${path.replace("/api/media/", "/smarthome/api/media/")}`,
        );
        candidates.push(
          `${parsed.origin}${path.replace("/api/media/", "/media/")}`,
        );
      } else if (path.startsWith("/media/")) {
        candidates.push(
          `${parsed.origin}${path.replace("/media/", "/smarthome/api/media/")}`,
        );
        candidates.push(
          `${parsed.origin}${path.replace("/media/", "/api/media/")}`,
        );
      }
    } catch {
      // Keep only the resolved absolute URL if parsing fails.
    }

    return Array.from(new Set(candidates));
  };

  const loadRoomScene = async (
    modelName: string,
    modelFileUrl?: string | null,
  ) => {
    // Remove existing room model if any
    if (currentRoomModel) {
      world.scene.remove(currentRoomModel);
      currentRoomModel = null;
    }

    let roomModel: any = null;
    let loadedRoomFromManifest = false;
    let manifestRoomAssetKey: string | null = null;

    // If a model file URL is provided, load it dynamically
    if (modelFileUrl) {
      try {
        const candidateUrls = buildRoomModelUrlCandidates(modelFileUrl);

        const loader = new GLTFLoader();
        loader.setCrossOrigin("anonymous");

        let lastError: unknown = null;
        for (const candidateUrl of candidateUrls) {
          try {
            // Best-effort accessibility check (still try loadAsync even if non-OK).
            try {
              const response = await fetch(candidateUrl, { method: "HEAD" });
              if (!response.ok) {
                console.warn(
                  `⚠️ Model URL responded ${response.status}: ${candidateUrl}`,
                );
              }
            } catch (fetchError) {
              console.warn(
                `⚠️ Could not verify model URL (${candidateUrl}): ${fetchError}`,
              );
            }

            const gltf = await loader.loadAsync(candidateUrl);
            roomModel = gltf.scene;
            break;
          } catch (candidateError) {
            lastError = candidateError;
            console.warn(`⚠️ Failed model URL candidate: ${candidateUrl}`);
          }
        }

        if (!roomModel) {
          throw (
            lastError ?? new Error("No room model URL candidates succeeded")
          );
        }
      } catch (error) {
        console.error(
          `❌ Failed to load room model from URL: ${modelFileUrl}`,
          error,
        );
        console.error(
          `   Error details:`,
          error instanceof Error ? error.message : String(error),
        );
        // Fall back to default model
        modelFileUrl = null;
      }
    }

    // If no URL or URL loading failed, try to load from asset manifest
    if (!roomModel) {
      const assetKey =
        ROOM_MODEL_ASSET_MAP[modelName] || ROOM_MODEL_ASSET_MAP["LabPlan"];
      manifestRoomAssetKey = assetKey;
      const roomGltf = AssetManager.getGLTF(assetKey);
      if (roomGltf) {
        roomModel = roomGltf.scene.clone();
        loadedRoomFromManifest = true;
      } else {
        console.warn(`⚠️ Room scene not available for model: ${modelName}`);
        return;
      }
    }

    // Configure the room model
    roomModel.position.set(-5.2, 0, 3);

    let floorWalkRoot: any = null;
    if (loadedRoomFromManifest && manifestRoomAssetKey === "room_scene") {
      const floorWalkGltf = AssetManager.getGLTF("room_floor_walk");
      if (floorWalkGltf) {
        floorWalkRoot = floorWalkGltf.scene.clone();
        floorWalkRoot.name = FLOOR_WALK_COLLISION_ROOT_NAME;
        floorWalkRoot.visible = false;
        roomModel.add(floorWalkRoot);
      } else {
        console.warn(
          "⚠️ room_floor_walk asset missing — using LabPlan floor for walk tests",
        );
      }
    }

    wrapRoomInteriorVisual(roomModel, floorWalkRoot);

    // Disable raycasting on all room model meshes so they don't block
    // device grab/move interactions. The room is visual-only.
    roomModel.traverse((child: any) => {
      if (child.isMesh) {
        child.raycast = () => { };
      }
    });

    world.scene.add(roomModel);
    currentRoomModel = roomModel;

    initializeNavMesh(roomModel, 1.0);

    initializeCollision(roomModel, floorWalkRoot);

    (globalThis as any).__labRoomModel = roomModel;
    setRoomARVisualMode(roomModel, (globalThis as any).__sceneMode === "ar");
    setRoomTransform(
      roomModel.position.x,
      roomModel.position.y,
      roomModel.position.z,
      roomModel.rotation.y,
      roomModel.scale.x,
    );
    updateCollisionTransform();
  };

  // Load room scene with default model (LabPlan) — will be updated after store loads
  await loadRoomScene("LabPlan");

  world
    .registerComponent(DeviceComponent)
    .registerComponent(UserControlledAvatarComponent)
    .registerComponent(RobotAssistantComponent)
    .registerComponent(NPCAvatarComponent)
    .registerSystem(DeviceRendererSystem)
    .registerSystem(DeviceInteractionSystem)
    .registerSystem(UserControlledAvatarSystem)
    .registerSystem(RPMUserControlledAvatarSystem)
    .registerSystem(SlimeVRFullBodySystem)
    .registerSystem(RobotAssistantSystem)
    .registerSystem(NPCAvatarSystem)
    .registerSystem(PanelSystem)
    .registerSystem(LightbulbPanelSystem)
    .registerSystem(TelevisionPanelSystem)
    .registerSystem(FanPanelSystem)
    .registerSystem(AirConditionerPanelSystem)
    .registerSystem(SmartMeterPanelSystem)
    .registerSystem(GraphPanelSystem)
    .registerSystem(RoomScanningSystem)
    .registerSystem(LegPoseLoggerSystem)
    .registerSystem(DevicePlacementSystem)
    .registerSystem(VoicePanelSystem)
    .registerSystem(PlacementPanelSystem)
    .registerSystem(WelcomePanelGestureSystem)
    .registerSystem(XRInstructionSystem)
    .registerSystem(WallpaperSystem)
    .registerSystem(WallpaperCutoutPanelSystem)
    .registerSystem(DashboardPanelSystem);

  // ── Dashboard Panel (new unified layout) ─────────────────────────────
  const dashboardPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/dashboard.json",
      maxHeight: 1.0,
      maxWidth: 1.2,
    })
    .addComponent(Interactable);

  dashboardPanel.object3D!.position.set(0, 1.5, -1.0);

  // Store dashboard panel reference globally (replaces old welcome panel ref)
  (globalThis as any).__dashboardPanelEntity = dashboardPanel;
  (globalThis as any).__welcomePanelEntity = dashboardPanel; // backward compat

  // ── Legacy Welcome Panel (kept for backward compat, hidden) ──────────
  const welcomePanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/welcome.json",
      maxHeight: 0.8,
      maxWidth: 0.5,
    })
    .addComponent(Interactable);

  welcomePanel.object3D!.position.set(0, 1.5, -0.8);
  welcomePanel.object3D!.visible = false; // hidden — dashboard is the primary UI now

  // Placement Panel (3D floating panel, starts hidden)
  // Position relative to welcome panel so it moves with it
  const placementPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/placement-panel.json",
      maxHeight: 0.6,
      maxWidth: 0.5,
    })
    .addComponent(Interactable);

  // Make placement panel a child of dashboard panel so it follows its position
  if (dashboardPanel.object3D && placementPanel.object3D) {
    dashboardPanel.object3D.add(placementPanel.object3D);
    // Right-side slot (shared with alignment panel; only one open at a time)
    placementPanel.object3D.position.set(0.75, 0, 0);
  } else {
    // Fallback to absolute positioning if object3D not available
    placementPanel.object3D!.position.set(0.6, 1.5, -0.8);
  }
  placementPanel.object3D!.visible = false; // Hidden until "Devices" button pressed
  (globalThis as any).__placementPanelEntity = placementPanel;

  // Wallpaper Cutout Panel (hidden; shown optionally after wallpaper is applied in plane mode)
  const cutoutPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/wallpaper-cutout-panel.json",
      maxHeight: 0.6,
      maxWidth: 0.5,
    })
    .addComponent(Interactable);

  cutoutPanel.object3D!.position.set(0.65, 1.5, -0.8);
  cutoutPanel.object3D!.visible = false;
  (globalThis as any).__cutoutPanelEntity = cutoutPanel;

  // Voice assistant UI is embedded in welcome.json (VoicePanelSystem)

  const store = getStore();

  // Check URL params for room-specific loading
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomId = urlParams.get("roomId");
  const urlHomeId = urlParams.get("homeId");

  if (urlRoomId) {
    await store.loadRoomData(urlRoomId);
  } else {
    await store.loadAllData();
  }

  // Get fresh state after loading (Zustand getState() returns current state)
  const currentState = getStore();

  if (currentState.error) {
    console.error("❌ Failed to load data:", currentState.error);
  } else {
    // Reload room scene with the correct model (uploaded file or default)
    if (currentState.roomModelFileUrl) {
      await loadRoomScene(
        currentState.roomModel,
        currentState.roomModelFileUrl,
      );
    } else {
      await loadRoomScene(currentState.roomModel);
    }
  }

  const renderer = world.getSystem(DeviceRendererSystem);
  if (renderer) {
    await renderer.initializeDevices();
  }

  const wsClient = getWebSocketClient();
  const authToken = auth.getToken();
  wsClient.connect(authToken || undefined);

  // ── WebSocket connection notifications ──────────────────────────────────────
  wsClient.onConnect(() => {
    sceneNotify({
      title: "Connected to Smart Home",
      description: "Real-time device sync is active",
      severity: "success",
      icon: SN_ICONS.wifi,
      iconBg: "rgba(34,197,94,0.15)",
      iconFg: "#22c55e",
      duration: 3500,
    });
  });

  wsClient.onDisconnect(() => {
    sceneNotify({
      title: "Connection lost",
      description: "Lost connection to Smart Home hub — reconnecting…",
      severity: "warning",
      icon: SN_ICONS.wifiOff,
      iconBg: "rgba(245,158,11,0.15)",
      iconFg: "#f59e0b",
      duration: 5000,
    });
  });

  wsClient.subscribe(async (data) => {
    if (data.type === "device_update" && data.device_id) {
      // Backend sends device_id and action, so we need to refresh the device
      await store.refreshSingleDevice(data.device_id);
      // Show a subtle notification for externally-triggered device changes
      sceneNotify({
        title: "Device updated remotely",
        description: data.device_name
          ? `'${data.device_name}' state was changed`
          : "A device was updated outside the scene",
        severity: "info",
        icon: SN_ICONS.refresh,
        iconBg: "rgba(99,102,241,0.15)",
        iconFg: "#818cf8",
        duration: 3000,
      });
    }
  });

  setAvatarSwitcherCamera(camera);

  // 1) RPM Avatar + lip sync; SlimeVR bridge optional — debug markers only (?slimevrWs=...)
  const rpmAvatarSystem = world.getSystem(RPMUserControlledAvatarSystem);
  if (rpmAvatarSystem) {
    await rpmAvatarSystem.createRPMUserControlledAvatar(
      "player1",
      "RPM Avatar",
      "rpmClip_model1",
      [-0.2, 0, -1.0],
    );
    registerAvatar(
      rpmAvatarSystem as ControllableAvatarSystem,
      "player1",
      "RPM Avatar",
    );
  }

  // 2) Skeleton-controlled (bone-only) — disabled
  // const skeletonAvatarSystem = world.getSystem(SkeletonControlledAvatarSystem);
  // if (skeletonAvatarSystem) {
  //   await skeletonAvatarSystem.createSkeletonControlledAvatar(
  //     "player2",
  //     "Skeleton Avatar",
  //     "rpmBone_model",
  //     [0, 0, -1.5],
  //   );
  //   registerAvatar(
  //     skeletonAvatarSystem as ControllableAvatarSystem,
  //     "player2",
  //     "Skeleton Avatar",
  //   );
  //   console.log("✅ Skeleton avatar (RPM_bone.glb)");
  // }

  // 3) Soldier avatar — disabled (not rendered in scene)
  // const userAvatarSystem = world.getSystem(UserControlledAvatarSystem);
  // if (userAvatarSystem) {
  //   await userAvatarSystem.createUserControlledAvatar(
  //     "player3",
  //     "Soldier",
  //     "soldier_model",
  //     [-1.2, 0, -1.5],
  //   );
  //   registerAvatar(
  //     userAvatarSystem as ControllableAvatarSystem,
  //     "player3",
  //     "Soldier",
  //   );
  //   console.log("✅ Soldier avatar (soldier_model)");
  // }

  // 3) Robot Assistant
  const robotAssistantSystem = world.getSystem(RobotAssistantSystem);
  if (robotAssistantSystem) {
    await robotAssistantSystem.createRobotAssistant(
      "robot1",
      "Robot Assistant",
      "robot_assistant",
    );
  }

  // 4) NPC RPM Avatars — stationary characters
  const npcAvatarSystem = world.getSystem(NPCAvatarSystem);
  if (npcAvatarSystem) {
    // Math.PI = 180 degrees, Math.PI / 2 = 90 degrees, etc.
    await npcAvatarSystem.createNPCAvatar(
      "npc1",
      "NPC Alice",
      "npc_1",
      [3.0, 0, -3.0],
    );
    await npcAvatarSystem.createNPCAvatar(
      "npc2",
      "NPC Bob",
      "npc_2",
      [-4.0, 0, 4.5],
      Math.PI / 2,
    );
    await npcAvatarSystem.createNPCAvatar(
      "npc3",
      "NPC Carol",
      "npc_3",
      [-3.0, 0, 2.0],
      Math.PI / 2,
    );
  }

  setupAvatarSwitcherPanel();

  if (rpmAvatarSystem) {
    rpmAvatarSystem.alignFollowCameraToCurrentAvatar();
  }
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
});
