import {
  AssetManifest,
  AssetType,
  SessionMode,
  World,
  AssetManager,
  PanelUI,
  Interactable,
  ScreenSpace,
} from "@iwsdk/core";

import { getAuth } from "./api/auth";
import { getWebSocketClient } from "./api/WebSocketClient";
import { getStore } from "./store/DeviceStore";
import { DeviceComponent } from "./components/DeviceComponent";
import { UserControlledAvatarComponent } from "./components/UserControlledAvatarComponent";
import { RobotAssistantComponent } from "./components/RobotAssistantComponent";
import { DeviceRendererSystem } from "./systems/DeviceRendererSystem";
import { DeviceInteractionSystem } from "./systems/DeviceInteractionSystem";
import { UserControlledAvatarSystem } from "./systems/UserControlledAvatarSystem";
import { RPMUserControlledAvatarSystem } from "./systems/RPMUserControlledAvatarSystem";
import { RobotAssistantSystem } from "./systems/RobotAssistantSystem";
import { PanelSystem } from "./ui/panel";
import { LightbulbPanelSystem } from "./ui/LightbulbPanelSystem";
import { TelevisionPanelSystem } from "./ui/TelevisionPanelSystem";
import { FanPanelSystem } from "./ui/FanPanelSystem";
import { AirConditionerPanelSystem } from "./ui/AirConditionerPanelSystem";
import { GraphPanelSystem } from "./ui/GraphPanelSystem";
import { VoiceControlSystem } from "./systems/VoiceControlSystem";
import { VoicePanelSystem } from "./ui/VoicePanelSystem";
// import { VoicePanel } from "./ui/VoicePanel"; // Legacy DOM panel
import { RoomScanningSystem } from "./systems/RoomScanningSystem";
import { RoomAlignmentSystem } from "./systems/RoomAlignmentSystem";
import { PhysicsSystem } from "./systems/PhysicsSystem";
import { RoomColliderSystem } from "./systems/RoomColliderSystem";
import { DevicePlacementSystem } from "./systems/DevicePlacementSystem";
import { PlacementPanelSystem } from "./ui/PlacementPanelSystem";
import { RoomAlignmentPanelSystem } from "./ui/RoomAlignmentPanelSystem";

import { initializeNavMesh, getRoomBounds } from "./config/navmesh";
import { initializeCollision } from "./config/collision";
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
    url: "/models/scenes/lab_plan/LabPlan.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  lightbulb: {
    url: "/models/devices/ceiling_lamp/scene.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  television: {
    url: "/models/devices/television/scene.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  fan: {
    url: "/models/devices/fan/scene.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  air_conditioner: {
    url: "/models/devices/air_conditioner/scene.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  soldier_model: {
    url: "/models/avatar/resident/Soldier.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  rpmBone_model: {
    url: "/models/avatar/resident/RPM_bone.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  rpmClip_model: {
    url: "/models/avatar/resident/RPM_clip.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  rpmClip_model1: {
    url: "/models/avatar/resident/MediumRes12.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  robot_assistant: {
    url: "/models/avatar/assistant/robot_3D_scene.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair: {
    url: "/models/furnitures/chair/chair.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair2: {
    url: "/models/furnitures/chair2/B07B4DBBPY.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair3: {
    url: "/models/furnitures/chair3/B07B7B244W.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair4: {
    url: "/models/furnitures/chair4/B073G6GTKL.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair5: {
    url: "/models/furnitures/chair5/B075X33T21.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  chair6: {
    url: "/models/furnitures/chair6/B071W5VD5C.glb",
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

  const { camera } = world;

  camera.position.set(0, 1.6, 0.5);

  const roomGltf = AssetManager.getGLTF("room_scene");
  if (roomGltf) {
    const roomModel = roomGltf.scene;
    // No scaling — LabPlan renders at real-world size (9m × 10.5m × 2.78m)
    roomModel.position.set(0, 0, 0);
    world.scene.add(roomModel as any);
    console.log("✅ Room scene loaded (1:1 scale)");

    initializeNavMesh(roomModel as any, 1.0);
    console.log("✅ NavMesh initialized for lab room");

    initializeCollision(roomModel as any);
    console.log("✅ Collision meshes initialized for lab room");

    (globalThis as any).__labRoomModel = roomModel;
  } else {
    console.warn("⚠️ Room scene not available");
  }

  // Chair on lab room floor: no scaling, real-world size
  // LabPlan floor Y=0 at 1:1 scale
  const labFloorY = 0;
  const chairGltf = AssetManager.getGLTF("chair");
  if (chairGltf) {
    const bounds = getRoomBounds();
    const chairModel = chairGltf.scene.clone();
    // No scaling — chairs at real-world size
    chairModel.rotation.set(0, Math.PI, 0);
    let x: number, z: number;
    if (bounds) {
      x = (bounds.minX + bounds.maxX) * 0.5 - 1.0;
      z = (bounds.minZ + bounds.maxZ) * 0.5 - 0.6;
    } else {
      x = 3.5;
      z = -5.0;
    }
    chairModel.position.set(x, labFloorY, z);
    world.scene.add(chairModel);
    console.log("✅ Chair placed inside room (floor-aligned)");

    // Second chair
    const chairModel2 = chairGltf.scene.clone();
    chairModel2.rotation.set(0, 0, 0);
    const x2 = 5.0;
    const z2 = -5.0;
    chairModel2.position.set(x2, labFloorY, z2);
    world.scene.add(chairModel2);
    console.log("✅ Second chair placed inside room (floor-aligned)");
  } else {
    console.warn("⚠️ Chair model not available");
  }

  world
    .registerComponent(DeviceComponent)
    .registerComponent(UserControlledAvatarComponent)
    .registerComponent(RobotAssistantComponent)
    .registerSystem(DeviceRendererSystem)
    .registerSystem(DeviceInteractionSystem)
    .registerSystem(UserControlledAvatarSystem)
    .registerSystem(RPMUserControlledAvatarSystem)
    .registerSystem(RobotAssistantSystem)
    .registerSystem(PanelSystem)
    .registerSystem(LightbulbPanelSystem)
    .registerSystem(TelevisionPanelSystem)
    .registerSystem(FanPanelSystem)
    .registerSystem(AirConditionerPanelSystem)
    .registerSystem(GraphPanelSystem)
    .registerSystem(RoomScanningSystem)
    .registerSystem(RoomAlignmentSystem)
    .registerSystem(RoomAlignmentPanelSystem)
    .registerSystem(PhysicsSystem)
    .registerSystem(RoomColliderSystem)
    .registerSystem(DevicePlacementSystem)
    .registerSystem(VoicePanelSystem)
    .registerSystem(PlacementPanelSystem);

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

  console.log("✅ Welcome panel created");

  // Placement Panel (3D floating panel, starts hidden)
  const placementPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/placement-panel.json",
      maxHeight: 0.6,
      maxWidth: 0.5,
    })
    .addComponent(Interactable);

  placementPanel.object3D!.position.set(-0.6, 1.5, -0.8);
  placementPanel.object3D!.visible = false; // Hidden until "Devices" button pressed
  console.log("✅ Placement panel created (hidden)");

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
  const alignmentPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "./ui/room-alignment-panel.json",
      maxHeight: 0.6,
      maxWidth: 0.5,
    })
    .addComponent(Interactable);

  alignmentPanel.object3D!.position.set(0.6, 1.5, -0.8);
  alignmentPanel.object3D!.visible = false; // Hidden until "Align Room" button pressed
  (globalThis as any).__alignmentPanelEntity = alignmentPanel;
  console.log("✅ Room Alignment panel created (hidden)");

  const store = getStore();

  console.log(" Fetching devices from backend...");
  await store.loadAllData();

  if (store.error) {
    console.error("❌ Failed to load devices:", store.error);
  } else {
    console.log(`✅ Loaded ${store.getDeviceCount()} devices`);
  }

  const renderer = world.getSystem(DeviceRendererSystem);
  if (renderer) {
    await renderer.initializeDevices();
    console.log("✅ Devices rendered in scene");
  }

  const wsClient = getWebSocketClient();
  const authToken = auth.getToken();
  wsClient.connect(authToken || undefined);

  console.log("\n👥 Initializing resident avatars...");

  wsClient.subscribe(async (data) => {
    if (data.type === "device_update" && data.device_id) {
      console.log("[WebSocket] Device update notification:", data);
      // Backend sends device_id and action, so we need to refresh the device
      await store.refreshSingleDevice(data.device_id);
    }
  });
  console.log("✅ WebSocket connected for real-time updates");

  // VoiceControlSystem is now a singleton managed by VoicePanelSystem
  console.log("✅ Voice Control System initialized (Singleton)");

  setAvatarSwitcherCamera(camera);

  // 1) RPM (Ready Player Me with clip-based) – lip sync available
  const rpmAvatarSystem = world.getSystem(RPMUserControlledAvatarSystem);
  let setLipSyncEnabled: (enabled: boolean) => void = () => {};
  if (rpmAvatarSystem) {
    await rpmAvatarSystem.createRPMUserControlledAvatar(
      "player1",
      "RPM Avatar",
      "rpmClip_model",
      [-0.6, 0, -1.5],
    );
    registerAvatar(
      rpmAvatarSystem as ControllableAvatarSystem,
      "player1",
      "RPM Avatar",
    );
    setLipSyncEnabled = setupLipSyncControlPanel(rpmAvatarSystem);
    console.log("✅ RPM avatar (RPM_clip.glb)");
  }

  // 2) Skeleton-controlled (bone-only)
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

  // 3) User-controlled (clip-based)
  const userAvatarSystem = world.getSystem(UserControlledAvatarSystem);
  if (userAvatarSystem) {
    await userAvatarSystem.createUserControlledAvatar(
      "player3",
      "Soldier",
      "soldier_model",
      [-1.2, 0, -1.5],
    );
    registerAvatar(
      userAvatarSystem as ControllableAvatarSystem,
      "player3",
      "Soldier",
    );
    console.log("✅ Soldier avatar (soldier_model)");
  }

  // 3) Robot Assistant
  const robotAssistantSystem = world.getSystem(RobotAssistantSystem);
  if (robotAssistantSystem) {
    await robotAssistantSystem.createRobotAssistant(
      "robot1",
      "Robot Assistant",
      "robot_assistant",
      [0.6, 0, -1.5],
    );
    console.log(
      "✅ Robot Assistant (robot_3D_scene.glb) - autonomous behavior",
    );
  }

  setupAvatarSwitcherPanel();
  setOnAvatarSwitch((entry) => {
    if (entry?.avatarId !== "player1" && rpmAvatarSystem) {
      rpmAvatarSystem.setMicrophoneMode(false);
      rpmAvatarSystem.stopSpeaking();
    }
    setLipSyncEnabled(entry?.avatarId === "player1");
  });

  console.log(
    "🎮 Controls: I/K/J/L = Move, Shift = Run, SPACE = Jump. O = switch avatar (when 2+ avatars).",
  );

  console.log("\n🚀 SmartHome Platform Scene Creator ready!");

  console.log("───────────────────────────────────");
  console.log(`   👤 User: ${user?.email}`);
  console.log(`   📱 Devices: ${store.getDeviceCount()}`);
  console.log(`   🟢 Active: ${store.getActiveDevices().length}`);
  console.log(`   🎮 Controlled Avatars: ${getAvatarCount()} (O = switch)`);
  console.log("───────────────────────────────────");
  console.log("💡 Click devices to control");
  console.log("✋ Grab devices to move");
  console.log(
    "🎮 Use IJKL + SPACE to control avatar. O = switch avatar (when 2+).",
  );
  console.log('🥽 Press "Enter AR" to start');
  console.log("───────────────────────────────────");
  console.log("🎤 Lip Sync: 1 = Speak, 2 = Stop, 3 = Mic mode");
  console.log("───────────────────────────────────");
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
});
