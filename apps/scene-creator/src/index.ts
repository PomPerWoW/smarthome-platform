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
import { VoicePanel } from "./ui/VoicePanel";
import { RoomScanningSystem } from "./systems/RoomScanningSystem";
import { initializeNavMesh } from "./config/navmesh";
import {
  type ControllableAvatarSystem,
  getAvatarCount,
  registerAvatar,
  setAvatarSwitcherCamera,
  setOnAvatarSwitch,
  setupAvatarSwitcherPanel,
} from "./ui/AvatarSwitcherPanel";
import { setupLipSyncControlPanel } from "./ui/LipSyncPanel";
import { speakGreeting, speakSeeYouAgain } from "./utils/VoiceTextToSpeech";
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
    roomModel.scale.setScalar(0.5);
    roomModel.position.set(-4.2, 0.8, 0.8);
    world.scene.add(roomModel);
    console.log("✅ Room scene loaded");

    initializeNavMesh(roomModel, 0.5);
    console.log("✅ NavMesh initialized for lab room");
  } else {
    console.warn("⚠️ Room scene not available");
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
  wsClient.connect();

  console.log("\n👥 Initializing resident avatars...");

  wsClient.subscribe(async (data) => {
    if (data.type === "device_update" && data.device_id) {
      console.log("[WebSocket] Device update notification:", data);
      // Backend sends device_id and action, so we need to refresh the device
      await store.refreshSingleDevice(data.device_id);
    }
  });
  console.log("✅ WebSocket connected for real-time updates");

  const voiceSystem = new VoiceControlSystem();

  setAvatarSwitcherCamera(camera);

  // 1) RPM (Ready Player Me with clip-based) – lip sync available
  const rpmAvatarSystem = world.getSystem(RPMUserControlledAvatarSystem);
  let setLipSyncEnabled: (enabled: boolean) => void = () => { };
  if (rpmAvatarSystem) {
    await rpmAvatarSystem.createRPMUserControlledAvatar("player1", "RPM Avatar", "rpmClip_model1", [-0.6, 0, -1.5]);
    registerAvatar(rpmAvatarSystem as ControllableAvatarSystem, "player1", "RPM Avatar");
    setLipSyncEnabled = setupLipSyncControlPanel(rpmAvatarSystem);
    console.log("✅ RPM avatar (RPM_clip.glb)");
  }

  // 2) User-controlled (clip-based)
  const userAvatarSystem = world.getSystem(UserControlledAvatarSystem);
  if (userAvatarSystem) {
    await userAvatarSystem.createUserControlledAvatar("player2", "Soldier", "soldier_model", [-1.2, 0, -1.5]);
    registerAvatar(userAvatarSystem as ControllableAvatarSystem, "player2", "Soldier");
    console.log("✅ Soldier avatar (soldier_model)");
  }

  // 3) Robot Assistant
  const robotAssistantSystem = world.getSystem(RobotAssistantSystem);
  if (robotAssistantSystem) {
    await robotAssistantSystem.createRobotAssistant("robot1", "Robot Assistant", "robot_assistant", [0.6, 0, -1.5]);
    console.log("✅ Robot Assistant (robot_3D_scene.glb) - autonomous behavior");
  }

  // Voice panel: wire status to robot (listening → Standing; idle → success: Yes+ThumbsUp, failure: No, cancelled: Jump)
  new VoicePanel(voiceSystem, (status, payload) => {
    if (!robotAssistantSystem) return;
    if (status === "listening") {
      robotAssistantSystem.setVoiceListening(true);
      speakGreeting();
    } else if (status === "idle" && payload !== undefined) {
      if (payload.cancelled) {
        speakSeeYouAgain();
        robotAssistantSystem.playEmoteSequence(["Jump"], () => robotAssistantSystem.setVoiceListening(false));
      } else if (payload.success === false) {
        robotAssistantSystem.playEmoteSequence(["No"], () => robotAssistantSystem.setVoiceListening(false));
      } else if (payload.success === true) {
        robotAssistantSystem.playEmoteSequence(["Yes", "ThumbsUp"], () => robotAssistantSystem.setVoiceListening(false));
      }
      // If payload exists but has no known flag, do nothing (robot stays Standing; user can cancel with mic).
    }
    // If payload is undefined (e.g. recognition onerror): do nothing — robot stays Standing.
  });
  console.log("✅ Voice Control System initialized");

  setupAvatarSwitcherPanel();
  setOnAvatarSwitch((entry) => {
    if (entry?.avatarId !== "player1" && rpmAvatarSystem) {
      rpmAvatarSystem.setMicrophoneMode(false);
      rpmAvatarSystem.stopSpeaking();
    }
    setLipSyncEnabled(entry?.avatarId === "player1");
  });

  console.log("🎮 Controls: I/K/J/L = Move, Shift = Run, SPACE = Jump. O = switch avatar (when 2+ avatars).");

  console.log("\n🚀 SmartHome Platform Scene Creator ready!");

  console.log("───────────────────────────────────");
  console.log(`   👤 User: ${user?.email}`);
  console.log(`   📱 Devices: ${store.getDeviceCount()}`);
  console.log(`   🟢 Active: ${store.getActiveDevices().length}`);
  console.log(`   🎮 Controlled Avatars: ${getAvatarCount()} (O = switch)`);
  console.log("───────────────────────────────────");
  console.log("💡 Click devices to control");
  console.log("✋ Grab devices to move");
  console.log("🎮 Use IJKL + SPACE to control avatar. O = switch avatar (when 2+).");
  console.log('🥽 Press "Enter AR" to start');
  console.log("───────────────────────────────────");
  console.log("🎤 Lip Sync: 1 = Speak, 2 = Stop, 3 = Mic mode");
  console.log("───────────────────────────────────");
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
});
