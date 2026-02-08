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
import { DeviceRendererSystem } from "./systems/DeviceRendererSystem";
import { DeviceInteractionSystem } from "./systems/DeviceInteractionSystem";
import { PanelSystem } from "./ui/panel";
import { LightbulbPanelSystem } from "./ui/LightbulbPanelSystem";
import { TelevisionPanelSystem } from "./ui/TelevisionPanelSystem";
import { FanPanelSystem } from "./ui/FanPanelSystem";
import { AirConditionerPanelSystem } from "./ui/AirConditionerPanelSystem";
import { VoiceControlSystem } from "./systems/VoiceControlSystem";
import { VoicePanel } from "./ui/VoicePanel";
import { RoomScanningSystem } from "./systems/RoomScanningSystem";
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
  } else {
    console.warn("⚠️ Room scene not available");
  }

  world
    .registerComponent(DeviceComponent)
    .registerSystem(DeviceRendererSystem)
    .registerSystem(DeviceInteractionSystem)
    .registerSystem(PanelSystem)
    .registerSystem(LightbulbPanelSystem)
    .registerSystem(TelevisionPanelSystem)
    .registerSystem(FanPanelSystem)
    .registerSystem(AirConditionerPanelSystem)
    .registerSystem(RoomScanningSystem);

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

  wsClient.subscribe(async (data) => {
    if (data.type === "device_update" && data.device_id) {
      console.log("[WebSocket] Device update notification:", data);
      // Backend sends device_id and action, so we need to refresh the device
      await store.refreshSingleDevice(data.device_id);
    }
  });
  console.log("✅ WebSocket connected for real-time updates");

  const voiceSystem = new VoiceControlSystem();
  new VoicePanel(voiceSystem);
  console.log("✅ Voice Control System initialized");

  console.log("🚀 SmartHome Platform Scene Creator ready!");
  console.log("───────────────────────────────────");
  console.log(`   👤 User: ${user?.email}`);
  console.log(`   📱 Devices: ${store.getDeviceCount()}`);
  console.log(`   🟢 Active: ${store.getActiveDevices().length}`);
  console.log("───────────────────────────────────");
  console.log("💡 Click devices to control");
  console.log("✋ Grab devices to move");
  console.log('🥽 Press "Enter AR" to start');
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
});
