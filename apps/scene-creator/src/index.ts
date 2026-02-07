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
import { getStore } from "./store/DeviceStore";
import { DeviceComponent } from "./components/DeviceComponent";
import { ResidentAvatarComponent } from "./components/ResidentAvatarComponent";
import { AssistantAvatarComponent } from "./components/AssistantAvatarComponent";
import { DeviceRendererSystem } from "./systems/DeviceRendererSystem";
import { DeviceInteractionSystem } from "./systems/DeviceInteractionSystem";
import { ResidentAvatarSystem } from "./systems/ResidentAvatarSystem";
import { AssistantAvatarSystem } from "./systems/AssistantAvatarSystem";
import { PanelSystem } from "./ui/panel";
import { LightbulbPanelSystem } from "./ui/LightbulbPanelSystem";
import { TelevisionPanelSystem } from "./ui/TelevisionPanelSystem";
import { FanPanelSystem } from "./ui/FanPanelSystem";
import { AirConditionerPanelSystem } from "./ui/AirConditionerPanelSystem";
import { GraphPanelSystem } from "./ui/GraphPanelSystem";
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
    url: "/models/devices/lightbulb/scene.gltf",
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
  // resident avatars
  resident1: {
    url: "/animations/resident1/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident2: {
    url: "/animations/resident2/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 1 animations
  Idle1: {
    url: "/animations/resident1/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking1: {
    url: "/animations/resident1/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Waving1: {
    url: "/animations/resident1/Waving.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 2 animations
  Idle2: {
    url: "/animations/resident2/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking2: {
    url: "/animations/resident2/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Waving2: {
    url: "/animations/resident2/Waving.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // Robot Assistant
  robot_avatar: {
    url: "/models/avatar/assistant/robot.glb",
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
    roomModel.position.set(0, 0, -3);
    world.scene.add(roomModel);
    console.log("✅ Room scene loaded");
  } else {
    console.warn("⚠️ Room scene not available");
  }

  world
    .registerComponent(DeviceComponent)
    .registerComponent(DeviceComponent)
    .registerComponent(ResidentAvatarComponent)
    .registerComponent(AssistantAvatarComponent)
    .registerSystem(DeviceRendererSystem)
    .registerSystem(DeviceInteractionSystem)
    .registerSystem(ResidentAvatarSystem)
    .registerSystem(AssistantAvatarSystem)
    .registerSystem(PanelSystem)
    .registerSystem(LightbulbPanelSystem)
    .registerSystem(TelevisionPanelSystem)
    .registerSystem(FanPanelSystem)
    .registerSystem(AirConditionerPanelSystem)
    .registerSystem(GraphPanelSystem);

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

  console.log("📱 Fetching devices from backend...");
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

  // ===== INITIALIZE RESIDENT AVATARS =====
  console.log("\n👥 Initializing resident avatars...");

  const residentSystem = world.getSystem(ResidentAvatarSystem);
  if (residentSystem) {

    await residentSystem.createResidentAvatar(
      "1",
      "Mother",
      "resident1",
      [3.7, 0, -7],
      ["Idle1", "Walking1", "Waving1"]
    );

    await residentSystem.createResidentAvatar(
      "2",
      "Father",
      "resident2",
      [1, 0, -3.5],

      ["Idle2", "Walking2", "Waving2"]
    );

    console.log("✅ Resident avatars initialized");
  } else {
    console.warn("⚠️ ResidentAvatarSystem not found");
  }

  // ===== INITIALIZE ASSISTANT AVATAR =====
  const assistantSystem = world.getSystem(AssistantAvatarSystem);
  if (assistantSystem) {
    await assistantSystem.createAssistantAvatar(
      "robot_1",
      "Assistant",
      "robot_avatar",
      [2, 0.3, -4.5]
    );
    console.log("✅ Assistant avatar initialized");
  } else {
    console.warn("⚠️ AssistantAvatarSystem not found");
  }

  console.log("\n🚀 SmartHome Platform Scene Creator ready!");
  console.log("───────────────────────────────────");
  console.log(`   👤 User: ${user?.email}`);
  console.log(`   📱 Devices: ${store.getDeviceCount()}`);
  console.log(`   🟢 Active: ${store.getActiveDevices().length}`);
  console.log(`   👥 Residents: 2 avatars`);
  console.log("───────────────────────────────────");
  console.log("💡 Click devices to control");
  console.log("✋ Grab devices to move");
  console.log("👋 Watch residents do random actions");
  console.log('🥽 Press "Enter AR" to start');
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
});