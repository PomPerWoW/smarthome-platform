import {
  AssetManifest,
  AssetType,
  SessionMode,
  World,
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  AssetManager,
  SRGBColorSpace,
  AmbientLight,
  DirectionalLight,
  PanelUI,
  Interactable,
  ScreenSpace,
} from "@iwsdk/core";

import { getAuth } from "./api/auth";
import { getStore, deviceStore } from "./store/DeviceStore";
import { DeviceComponent } from "./components/DeviceComponent";
import { DeviceRendererSystem } from "./systems/DeviceRendererSystem";
import { DeviceInteractionSystem } from "./systems/DeviceInteractionSystem";
import { PanelSystem } from "./ui/panel";
import { DeviceType, Lightbulb } from "./types";

import * as LucideIconsKit from "@pmndrs/uikit-lucide";

// ============================================
// LOCAL TEST FLAG
// Set to true to skip authentication and use mock data
// ============================================
const LOCAL_TEST = false;

// Mock lightbulb device for local testing
const MOCK_LIGHTBULB: Lightbulb = {
  id: "mock-lightbulb-001",
  name: "Test Lightbulb",
  type: DeviceType.Lightbulb,
  is_on: true,
  brightness: 80,
  colour: "#ffffff",
  position: [0, 1.2, -1],
  home_id: "mock-home",
  home_name: "Test Home",
  floor_id: "mock-floor",
  floor_name: "Ground Floor",
  room_id: "mock-room",
  room_name: "Living Room",
};

const assets: AssetManifest = {
  chimeSound: {
    url: "./audio/chime.mp3",
    type: AssetType.Audio,
    priority: "background",
  },
  // webxr: {
  //   url: "./textures/webxr.png",
  //   type: AssetType.Texture,
  //   priority: "critical",
  // },
  lightbulb: {
    url: "/gltf/lightbulb/scene.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  television: {
    url: "/gltf/television/scene.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  fan: {
    url: "/gltf/fan/scene.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
  air_conditioner: {
    url: "/gltf/air_conditioner/scene.gltf",
    type: AssetType.GLTF,
    priority: "critical",
  },
};

async function main(): Promise<void> {
  console.log("🏠 ==========================================");
  console.log("🏠 SmartHomeAR Scene Creator starting...");
  console.log("🏠 ==========================================");

  let user: { email: string } | null = null;

  if (LOCAL_TEST) {
    console.log("\nLOCAL TEST MODE ENABLED");
    console.log("   Skipping authentication, using mock lightbulb data");
    user = { email: "local-test@example.com" };
  } else {
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

  console.log("✅ World created");

  const { camera } = world;

  camera.position.set(0, 1.6, 0.5);

  world
    .registerComponent(DeviceComponent)
    .registerSystem(DeviceRendererSystem)
    .registerSystem(DeviceInteractionSystem)
    .registerSystem(PanelSystem);

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

  if (LOCAL_TEST) {
    console.log("📦 Loading mock lightbulb device...");
    deviceStore.setState({ devices: [MOCK_LIGHTBULB], loading: false });
    console.log("✅ Loaded 1 mock device (lightbulb)");
  } else {
    console.log("📡 Fetching devices from backend...");
    await store.loadAllData();

    if (store.error) {
      console.error("❌ Failed to load devices:", store.error);
    } else {
      console.log(`✅ Loaded ${store.getDeviceCount()} devices`);
    }
  }

  const renderer = world.getSystem(DeviceRendererSystem);
  if (renderer) {
    await renderer.initializeDevices();
    console.log("✅ Devices rendered in scene");
  }

  console.log("🚀 SmartHomeAR Scene Creator ready!");
  console.log("───────────────────────────────────");
  console.log(`   👤 User: ${user?.email}`);
  console.log(`   📱 Devices: ${store.getDeviceCount()}`);
  console.log(`   🟢 Active: ${store.getActiveDevices().length}`);
  console.log("───────────────────────────────────");
  console.log("💡 Click devices to control");
  console.log("✋ Grab devices to move");
  console.log('🥽 Press "Enter AR" to start');

  // Auto-select the first device to show its control panel immediately
  if (LOCAL_TEST && MOCK_LIGHTBULB) {
    setTimeout(() => {
      console.log("🔦 Auto-selecting mock lightbulb to show control panel...");
      store.selectDevice(MOCK_LIGHTBULB.id);
    }, 500);
  }
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
});
