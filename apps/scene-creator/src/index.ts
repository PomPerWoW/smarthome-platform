import {
  AssetManifest,
  AssetType,
  SessionMode,
  World,
  AssetManager,
  PanelUI,
  Interactable,
  ScreenSpace,
  Follower,
  FollowBehavior,
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
import { RobotAssistantSystem } from "./systems/RobotAssistantSystem";
import { NPCAvatarSystem } from "./systems/NPCAvatarSystem";
import { PanelSystem } from "./ui/panel";
import { LightbulbPanelSystem } from "./ui/LightbulbPanelSystem";
import { TelevisionPanelSystem } from "./ui/TelevisionPanelSystem";
import { FanPanelSystem } from "./ui/FanPanelSystem";
import { AirConditionerPanelSystem } from "./ui/AirConditionerPanelSystem";
import { GraphPanelSystem } from "./ui/GraphPanelSystem";
import { SmartMeterPanelSystem } from "./ui/SmartMeterPanelSystem";
import { VoiceControlSystem } from "./systems/VoiceControlSystem";
import { VoicePanelSystem } from "./ui/VoicePanelSystem";
// import { VoicePanel } from "./ui/VoicePanel"; // Legacy DOM panel
import { RoomScanningSystem } from "./systems/RoomScanningSystem";
import { LegPoseLoggerSystem } from "./systems/LegPoseLoggerSystem";
import { setupPCLegPoseSimulator } from "./utils/pcLegPoseSimulator";
import { LegPosePanelSystem } from "./ui/LegPosePanelSystem";
import { RoomAlignmentSystem } from "./systems/RoomAlignmentSystem";
import { DevicePlacementSystem } from "./systems/DevicePlacementSystem";
import { PlacementPanelSystem } from "./ui/PlacementPanelSystem";
import { RoomAlignmentPanelSystem } from "./ui/RoomAlignmentPanelSystem";
import { WelcomePanelGestureSystem } from "./systems/WelcomePanelGestureSystem";
import { XRInstructionSystem } from "./systems/XRInstructionSystem";
import { WallpaperSystem } from "./systems/WallpaperSystem";
import { WallSelectionPanelSystem } from "./ui/WallSelectionPanelSystem";
import { WallpaperCutoutPanelSystem } from "./ui/WallpaperCutoutPanelSystem";

import { initializeNavMesh, getRoomBounds } from "./config/navmesh";
import { initializeCollision } from "./config/collision";
import { config } from "./config/env";
import {
  type ControllableAvatarSystem,
  getAvatarCount,
  registerAvatar,
  setAvatarSwitcherCamera,
  setOnAvatarSwitch,
  setupAvatarSwitcherPanel,
} from "./ui/AvatarSwitcherPanel";
import { setupLipSyncControlPanel } from "./ui/LipSyncPanel";
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
  console.log("🏠 ==========================================");
  console.log("🏠 SmartHome Platform Scene Creator starting...");
  console.log("🏠 ==========================================");

  let user: { email: string } | null = null;

  console.log("\n📋 Step 1: Authentication");

  const auth = getAuth();
  const isAuthenticated = await auth.initialize();

  console.log("[Main] Authentication result:", isAuthenticated);

  if (!isAuthenticated) {
    console.error("❌ Authentication failed");
    return;
  }

  user = auth.getUser();
  console.log(`✅ Authenticated as: ${user?.email}`);

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

  console.log("✅ World created");

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

    // If a model file URL is provided, load it dynamically
    if (modelFileUrl) {
      console.log(`📦 Loading room model from URL: ${modelFileUrl}`);
      try {
        // Ensure URL is absolute - if relative, prepend backend URL
        let absoluteUrl = modelFileUrl;
        if (
          !modelFileUrl.startsWith("http://") &&
          !modelFileUrl.startsWith("https://")
        ) {
          // Get backend URL from config
          const backendUrl = config.BACKEND_URL;
          // Remove trailing slash from backend URL and leading slash from modelFileUrl
          const cleanBackendUrl = backendUrl.replace(/\/$/, "");
          const cleanModelUrl = modelFileUrl.startsWith("/")
            ? modelFileUrl
            : `/${modelFileUrl}`;
          absoluteUrl = `${cleanBackendUrl}${cleanModelUrl}`;
          console.log(`🔗 Converted relative URL to absolute: ${absoluteUrl}`);
        }

        // Log the URL we're trying to load
        console.log(`🔍 Attempting to load model from: ${absoluteUrl}`);

        // Verify URL is accessible (optional check - will fail gracefully if not)
        try {
          const response = await fetch(absoluteUrl, { method: "HEAD" });
          if (!response.ok) {
            console.warn(
              `⚠️ Model file returned status ${response.status}, but attempting to load anyway...`,
            );
          } else {
            console.log(`✅ Model file is accessible (${response.status})`);
          }
        } catch (fetchError) {
          console.warn(
            `⚠️ Could not verify model file accessibility: ${fetchError}, but attempting to load anyway...`,
          );
        }

        const loader = new GLTFLoader();
        // Configure loader to handle CORS if needed
        loader.setCrossOrigin("anonymous");

        const gltf = await loader.loadAsync(absoluteUrl);
        roomModel = gltf.scene;
        console.log(`✅ Room model loaded from URL: ${absoluteUrl}`);
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
      const roomGltf = AssetManager.getGLTF(assetKey);
      if (roomGltf) {
        roomModel = roomGltf.scene.clone();
        console.log(`✅ Room scene loaded from assets: ${modelName}`);
      } else {
        console.warn(`⚠️ Room scene not available for model: ${modelName}`);
        return;
      }
    }

    // Configure the room model
    roomModel.position.set(0, 0, 0);

    // Disable raycasting on all room model meshes so they don't block
    // device grab/move interactions. The room is visual-only.
    roomModel.traverse((child: any) => {
      if (child.isMesh) {
        child.raycast = () => { };
      }
    });

    world.scene.add(roomModel);
    currentRoomModel = roomModel;

    console.log(
      `✅ Room scene loaded: ${modelName} (1:1 scale, raycast disabled)`,
    );

    initializeNavMesh(roomModel, 1.0);
    console.log("✅ NavMesh initialized for room");

    initializeCollision(roomModel);
    console.log("✅ Collision initialized from room model meshes");

    (globalThis as any).__labRoomModel = roomModel;
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
    .registerSystem(RobotAssistantSystem)
    .registerSystem(NPCAvatarSystem)
    .registerSystem(PanelSystem)
    .registerSystem(LegPosePanelSystem)
    .registerSystem(LightbulbPanelSystem)
    .registerSystem(TelevisionPanelSystem)
    .registerSystem(FanPanelSystem)
    .registerSystem(AirConditionerPanelSystem)
    .registerSystem(SmartMeterPanelSystem)
    .registerSystem(GraphPanelSystem)
    .registerSystem(RoomScanningSystem)
    .registerSystem(RoomAlignmentSystem)
    .registerSystem(RoomAlignmentPanelSystem)
    .registerSystem(LegPoseLoggerSystem)
    .registerSystem(DevicePlacementSystem)
    .registerSystem(VoicePanelSystem)
    .registerSystem(PlacementPanelSystem)
    .registerSystem(WelcomePanelGestureSystem)
    .registerSystem(XRInstructionSystem)
    .registerSystem(WallpaperSystem)
    .registerSystem(WallSelectionPanelSystem)
    .registerSystem(WallpaperCutoutPanelSystem);

  console.log("✅ Systems registered");

  const welcomePanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/welcome.json",
      maxHeight: 0.8,
      maxWidth: 0.5,
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      top: "20px",
      left: "20px",
      height: "50%",
    });

  welcomePanel.object3D!.position.set(0, 1.5, -0.8);

  // Store welcome panel reference globally for gesture system
  (globalThis as any).__welcomePanelEntity = welcomePanel;

  console.log("✅ Welcome panel created");

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

  // Make placement panel a child of welcome panel so it follows its position
  if (welcomePanel.object3D && placementPanel.object3D) {
    welcomePanel.object3D.add(placementPanel.object3D);
    // Position relative to welcome panel (to the left, closer)
    placementPanel.object3D.position.set(-0.6, 0, 0);
  } else {
    // Fallback to absolute positioning if object3D not available
    placementPanel.object3D!.position.set(-0.6, 1.5, -0.8);
  }
  placementPanel.object3D!.visible = false; // Hidden until "Devices" button pressed
  (globalThis as any).__placementPanelEntity = placementPanel;
  console.log("✅ Placement panel created (hidden, relative to welcome panel)");

  // Wall Selection Panel (hidden until wallpaper placement starts)
  const wallSelectionPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/wall-selection-panel.json",
      maxHeight: 0.6,
      maxWidth: 0.5,
    })
    .addComponent(Interactable);

  wallSelectionPanel.object3D!.position.set(0, 1.5, -0.8);
  wallSelectionPanel.object3D!.visible = false;
  (globalThis as any).__wallSelectionPanelEntity = wallSelectionPanel;
  console.log("✅ Wall selection panel created (hidden)");

  // Wallpaper Cutout Panel (hidden until a wallpaper is placed)
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
  console.log("✅ Wallpaper cutout panel created (hidden)");

  const legPosePanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/legpose-logger.json",
      maxHeight: 0.22,
      maxWidth: 0.4,
    })
    .addComponent(Interactable)
    .addComponent(Follower, {
      // Follow the camera / HMD so the panel feels like a HUD
      target: world.camera,
      // Slightly below and to the left, in front of the view
      offsetPosition: [-0.3, -0.25, -0.8],
      behavior: FollowBehavior.PivotY,
      speed: 5,
      tolerance: 0.3,
      maxAngle: 35,
    });
  console.log("✅ Leg pose logger panel created (camera-follow HUD)");

  // Voice Panel (3D)
  const voice3DPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/voice_panel.json",
      maxHeight: 0.2, // Small panel
      maxWidth: 0.3,
    })
    .addComponent(Interactable); // No ScreenSpace, so it renders in 3D

  voice3DPanel.object3D!.position.set(0, 1.4, -0.4); // Initial position
  console.log("✅ Voice 3D Panel created");

  // Room Alignment Panel (3D floating panel, starts hidden)
  // Position relative to welcome panel so it moves with it
  const alignmentPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/room-alignment-panel.json",
      maxHeight: 0.45,
      maxWidth: 0.45,
    })
    .addComponent(Interactable);

  // Make alignment panel a child of welcome panel so it follows its position
  if (welcomePanel.object3D && alignmentPanel.object3D) {
    welcomePanel.object3D.add(alignmentPanel.object3D);
    // Position relative to welcome panel (to the right, closer)
    alignmentPanel.object3D.position.set(0.6, 0, 0);
  } else {
    // Fallback to absolute positioning if object3D not available
    alignmentPanel.object3D!.position.set(0.6, 1.5, -0.8);
  }
  alignmentPanel.object3D!.visible = false; // Hidden until "Align Room" button pressed
  (globalThis as any).__alignmentPanelEntity = alignmentPanel;
  console.log(
    "✅ Room Alignment panel created (hidden, relative to welcome panel)",
  );

  const store = getStore();

  // Check URL params for room-specific loading
  const urlParams = new URLSearchParams(window.location.search);
  const urlRoomId = urlParams.get("roomId");
  const urlHomeId = urlParams.get("homeId");

  console.log(" Fetching data from backend...");
  if (urlRoomId) {
    console.log(
      `📦 Loading room-specific data: roomId=${urlRoomId}, homeId=${urlHomeId}`,
    );
    await store.loadRoomData(urlRoomId);
  } else {
    console.log("📦 No room specified, loading all data...");
    await store.loadAllData();
  }

  // Get fresh state after loading (Zustand getState() returns current state)
  const currentState = getStore();

  // Debug: Log the entire state to see what we have
  console.log("[Debug] Current store state:", {
    roomModel: currentState.roomModel,
    roomModelFileUrl: currentState.roomModelFileUrl,
    roomId: currentState.roomId,
  });

  if (currentState.error) {
    console.error("❌ Failed to load data:", currentState.error);
  } else {
    console.log(
      `✅ Loaded ${currentState.getDeviceCount()} devices, room model: ${currentState.roomModel}`,
    );
    console.log(
      `📋 Room model file URL: ${currentState.roomModelFileUrl || "none (using default)"}`,
    );

    // Reload room scene with the correct model (uploaded file or default)
    if (currentState.roomModelFileUrl) {
      console.log(
        `🔄 Reloading room model from uploaded file: ${currentState.roomModelFileUrl}`,
      );
      await loadRoomScene(
        currentState.roomModel,
        currentState.roomModelFileUrl,
      );
    } else {
      console.log(
        `🔄 Reloading room model from assets: ${currentState.roomModel}`,
      );
      await loadRoomScene(currentState.roomModel);
    }
  }

  const renderer = world.getSystem(DeviceRendererSystem);
  if (renderer) {
    await renderer.initializeDevices();
    console.log("✅ Devices rendered in scene");
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

  console.log("\n👥 Initializing resident avatars...");

  wsClient.subscribe(async (data) => {
    if (data.type === "device_update" && data.device_id) {
      console.log("[WebSocket] Device update notification:", data);
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
  console.log("✅ WebSocket connected for real-time updates");

  // VoiceControlSystem is now a singleton managed by VoicePanelSystem
  console.log("✅ Voice Control System initialized (Singleton)");

  setAvatarSwitcherCamera(camera);

  // 1) RPM Avatar — disabled (not rendered in scene)
  // const rpmAvatarSystem = world.getSystem(RPMUserControlledAvatarSystem);
  // if (rpmAvatarSystem) {
  //   await rpmAvatarSystem.createRPMUserControlledAvatar("player1", "RPM Avatar", "rpmClip_model1", [-0.6, 0, -1.5]);
  //   registerAvatar(rpmAvatarSystem as ControllableAvatarSystem, "player1", "RPM Avatar");
  //   console.log("✅ RPM avatar (RPM_clip.glb)");
  // }

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
    console.log(
      "✅ Robot Assistant (robot_3D_scene.glb) - autonomous behavior",
    );
  }

  // 4) NPC RPM Avatars — stationary characters
  const npcAvatarSystem = world.getSystem(NPCAvatarSystem);
  if (npcAvatarSystem) {
    // Math.PI = 180 degrees, Math.PI / 2 = 90 degrees, etc.
    await npcAvatarSystem.createNPCAvatar("npc1", "NPC Alice", "npc_1", [3.0, 0, -3.5], -Math.PI / 4);
    await npcAvatarSystem.createNPCAvatar("npc2", "NPC Bob", "npc_2", [4.0, 0, 4.5], Math.PI);
    await npcAvatarSystem.createNPCAvatar("npc3", "NPC Carol", "npc_3", [-3.5, 0, 2.5], Math.PI / 2);
    await npcAvatarSystem.createNPCAvatar("npc4", "NPC Mike", "npc_4", [-3.5, 0, -5.0], 0);
    console.log("✅ 4 NPC RPM Avatars (npc/RPM_clip.glb) - stationary");
  }

  setupAvatarSwitcherPanel();
  // setOnAvatarSwitch((entry) => {
  //   if (entry?.avatarId !== "player1" && rpmAvatarSystem) {
  //     rpmAvatarSystem.setMicrophoneMode(false);
  //     rpmAvatarSystem.stopSpeaking();
  //   }
  //   setLipSyncEnabled(entry?.avatarId === "player1");
  // });

  console.log(
    "🎮 Controls: I/K/J/L = Move, Shift = Run, SPACE = Jump. O = switch avatar (when 2+ avatars).",
  );

  console.log("\n🚀 SmartHome Platform Scene Creator ready!");

  // Get fresh state for final summary
  const finalState = getStore();
  console.log("───────────────────────────────────");
  console.log(`   👤 User: ${user?.email}`);
  console.log(`   📱 Devices: ${finalState.getDeviceCount()}`);
  console.log(`   🟢 Active: ${finalState.getActiveDevices().length}`);
  console.log(`   🎮 Controlled Avatars: ${getAvatarCount()} (O = switch)`);
  console.log("───────────────────────────────────");
  console.log("💡 Click devices to control");
  console.log("✋ Grab devices to move");
  console.log(
    "🎮 Use IJKL + SPACE to control avatar. O = switch avatar (when 2+).",
  );
  console.log('🥽 Press "Enter AR" to start');
  console.log("───────────────────────────────────");
  // console.log("🎤 Lip Sync: 1 = Speak, 2 = Stop, 3 = Mic mode");
  // console.log("───────────────────────────────────");
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
});
