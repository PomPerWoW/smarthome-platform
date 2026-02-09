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
import { ResidentAvatarSystem } from "./systems/ResidentAvatarSystem";
import { initializeNavMesh } from "./config/navmesh";
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
  resident3: {
    url: "/animations/resident3/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident4: {
    url: "/animations/resident4/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident5: {
    url: "/animations/resident5/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident6: {
    url: "/animations/resident6/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident7: {
    url: "/animations/resident7/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident8: {
    url: "/animations/resident8/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident9: {
    url: "/animations/resident9/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident10: {
    url: "/animations/resident10/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident11: {
    url: "/animations/resident11/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  resident12: {
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
  // resident 3 animations
  Idle3: {
    url: "/animations/resident3/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking3: {
    url: "/animations/resident3/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Waving3: {
    url: "/animations/resident3/Waving.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  LeftTurn3: {
    url: "/animations/resident3/LeftTurn.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  RighTurn3: {
    url: "/animations/resident3/RightTurn.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  StandToSit3: {
    url: "/animations/resident3/StandToSit.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  SitToStand3: {
    url: "/animations/resident3/SitToStand.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 4 animations
  Idle4: {
    url: "/animations/resident4/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking4: {
    url: "/animations/resident4/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 5 animations
  Idle5: {
    url: "/animations/resident5/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking5: {
    url: "/animations/resident5/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 6 animations
  Idle6: {
    url: "/animations/resident6/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking6: {
    url: "/animations/resident6/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 7 animations
  Idle7: {
    url: "/animations/resident7/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking7: {
    url: "/animations/resident7/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 8 animations
  Idle8: {
    url: "/animations/resident8/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking8: {
    url: "/animations/resident8/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 9 animations
  Idle9: {
    url: "/animations/resident9/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking9: {
    url: "/animations/resident9/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 10 animations
  Idle10: {
    url: "/animations/resident10/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking10: {
    url: "/animations/resident10/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 11 animations
  Idle11: {
    url: "/animations/resident11/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking11: {
    url: "/animations/resident11/Walking.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  // resident 12 animations
  Idle12: {
    url: "/animations/resident12/Idle.glb",
    type: AssetType.GLTF,
    priority: "critical",
  },
  Walking12: {
    url: "/animations/resident12/Walking.glb",
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
    .registerSystem(DeviceRendererSystem)
    .registerSystem(DeviceInteractionSystem)
    .registerSystem(PanelSystem)
    .registerSystem(LightbulbPanelSystem)
    .registerSystem(TelevisionPanelSystem)
    .registerSystem(FanPanelSystem)
    .registerSystem(AirConditionerPanelSystem)
    .registerSystem(RoomScanningSystem)
    .registerSystem(ResidentAvatarSystem);

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
  new VoicePanel(voiceSystem);
  console.log("✅ Voice Control System initialized");

  console.log("🚀 SmartHome Platform Scene Creator ready!");

  const residentSystem = world.getSystem(ResidentAvatarSystem);
  if (residentSystem) {
    await residentSystem.createResidentAvatar(
      "3",
      "Father",
      "resident3",
      [3.7, 0, -7],
      ["Idle3", "Walking3", "Waving3"],
    );

    await residentSystem.createResidentAvatar(
      "4",
      "Mother",
      "resident4",
      [1, 0, -3.5],
      ["Idle4", "Walking4"],
    );

    console.log("✅ Resident avatars initialized");
  } else {
    console.warn("⚠️ ResidentAvatarSystem not found");
  }

  // TODO: AssistantAvatarSystem is missing from the codebase.
  // const assistantSystem = world.getSystem(AssistantAvatarSystem);
  // if (assistantSystem) {
  //   await assistantSystem.createAssistantAvatar(
  //     "robot_1",
  //     "Assistant",
  //     "robot_avatar",
  //     [2, 0.3, -4.5]
  //   );
  //   console.log("✅ Assistant avatar initialized");
  // } else {
  //   console.warn("⚠️ AssistantAvatarSystem not found");
  // }

  console.log("\n🚀 SmartHome Platform Scene Creator ready!");
  console.log("───────────────────────────────────");
  console.log(`   👤 User: ${user?.email}`);
  console.log(`   📱 Devices: ${store.getDeviceCount()}`);
  console.log(`   🟢 Active: ${store.getActiveDevices().length}`);
  console.log("───────────────────────────────────");
  console.log("💡 Click devices to control");
  console.log("✋ Grab devices to move");
  console.log('🥽 Press "Enter AR" to start');
  console.log("───────────────────────────────────");
  console.log("🎤 LIP SYNC TEST CONTROLS:");
  console.log("   Press '1' - Make Mother (avatar 3) speak");
  console.log("   Press '2' - Make Father (avatar 4) speak");
  console.log("   Press 'S' - Stop current speech");
  console.log("───────────────────────────────────");

  setupLipSyncTestControls(residentSystem ?? null);
}

function setupLipSyncTestControls(
  residentSystem: ResidentAvatarSystem | null,
): void {
  if (!residentSystem) {
    console.warn(
      "⚠️ ResidentAvatarSystem not available for lip sync test controls",
    );
    return;
  }

  const testPanel = document.createElement("div");
  testPanel.id = "lipsync-test-panel";
  testPanel.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.85);
      padding: 15px 20px;
      border-radius: 12px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      z-index: 9999;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      min-width: 220px;
    ">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center; gap: 8px;">
        Lip Sync Test
      </h3>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button id="speak-mother" style="
          padding: 10px 16px;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        ">
          Mother Speak (1)
        </button>
        <button id="speak-father" style="
          padding: 10px 16px;
          background: #2196F3;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        ">
          Father Speak (2)
        </button>
        <button id="stop-speech" style="
          padding: 10px 16px;
          background: #f44336;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        ">
          Stop Speech (3)
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(testPanel);

  const testAudioPathResident3 = "/audio/script/hello_male.mp3";
  const testAudioPathResident4 = "/audio/script/hello_male.mp3";

  document.getElementById("speak-mother")?.addEventListener("click", () => {
    console.log("[LipSync Test] 👩 Mother speaking...");
    residentSystem.speak("3", testAudioPathResident3);
  });

  document.getElementById("speak-father")?.addEventListener("click", () => {
    console.log("[LipSync Test] 👨 Father speaking...");
    residentSystem.speak("4", testAudioPathResident4);
  });

  document.getElementById("stop-speech")?.addEventListener("click", () => {
    console.log("[LipSync Test] 🔇 Stopping speech...");
    residentSystem.stopSpeaking();
  });

  window.addEventListener("keydown", (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (event.key) {
      case "1":
        console.log("[LipSync Test] 👩 Mother speaking (key 1)...");
        residentSystem.speak("3", testAudioPathResident3);
        break;
      case "2":
        console.log("[LipSync Test] 👨 Father speaking (key 2)...");
        residentSystem.speak("4", testAudioPathResident4);
        break;
      case "3":
        console.log("[LipSync Test] 🔇 Stopping speech (key S)...");
        residentSystem.stopSpeaking();
        break;
    }
  });

  console.log("✅ Lip sync test controls initialized");
}

main().catch((error) => {
  console.error("💥 Fatal error:", error);
});
