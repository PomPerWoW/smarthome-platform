import { createSystem } from "@iwsdk/core";
import {
  AxesHelper,
  Bone,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";

import { slimeVRPositionToThree, slimeVRRotationToThreeQuaternion, HEAD_Y_OFFSET } from "../slimevr/coords";
import { SlimeVRClient, resolveSlimeVRWebSocketUrl } from "../slimevr/SlimeVRClient";
import { getBodyTrackingMode } from "../slimevr/slimevrState";
import type { SlimeVRFrameMessage } from "../slimevr/types";
import { RPMUserControlledAvatarSystem } from "./RPMUserControlledAvatarSystem";

const SKELETON_EDGES = [
  ["head", "6"],  // Head to chest
  ["6", "7"],     // Chest to left upper arm
  ["6", "8"],     // Chest to right upper arm
  ["6", "1"],     // Chest to waist
  ["1", "4"],     // Waist to left knee
  ["1", "5"],     // Waist to right knee
  ["4", "2"],     // Left knee to left ankle
  ["5", "3"],     // Right knee to right ankle
];

/**
 * Subscribes to the SlimeVR bridge WebSocket and shows world-space tracker markers only.
 * No OSC tracker → avatar bone mapping or IK.
 */
export class SlimeVRFullBodySystem extends createSystem({}) {
  private client: SlimeVRClient | null = null;
  private debugRoot = new Group();
  private markerById = new Map<string, Group>();
  private skeletonGeo = new BufferGeometry();
  private skeletonLines!: LineSegments;

  private trackedModel: Object3D | null = null;
  private boneRestWorldQuat = new Map<string, Quaternion>();

  init(): void {
    this.debugRoot.name = "SlimeVR_Debug";
    this.world.scene.add(this.debugRoot as unknown as Object3D);

    const mat = new LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.7 });
    this.skeletonLines = new LineSegments(this.skeletonGeo, mat);
    this.skeletonLines.name = "skeleton_lines";
    this.debugRoot.add(this.skeletonLines);

    if (getBodyTrackingMode() === "slimevr") {
      this.ensureClientConnected();
    } else {
      console.log("[SlimeVRFullBody] Body tracking mode is off.");
    }
  }

  private ensureClientConnected(): void {
    if (this.client) return;
    const url = resolveSlimeVRWebSocketUrl();
    if (!url) {
      console.log(
        "[SlimeVRFullBody] Mode slimevr but no WebSocket URL (VITE_SLIMEVR_WS)",
      );
      return;
    }
    this.client = new SlimeVRClient(url);
    this.client.connect();
    console.log("[SlimeVRFullBody] WebSocket URL:", url);
  }

  private disconnectClient(): void {
    this.client?.disconnect();
    this.client = null;
    for (const g of this.markerById.values()) g.visible = false;
  }

  private ensureMarker(id: string): Group {
    let g = this.markerById.get(id);
    if (g) return g;

    g = new Group();
    g.name = `slimevr_tracker_${id}`;

    // Axes for rotation debug
    const axes = new AxesHelper(0.15);
    g.add(axes);

    // Check if it's 'head' for color
    const isHead = id.toLowerCase() === "head";
    const boxColor = isHead ? 0xef4444 : 0x22c55e;

    // 3D Box
    const boxGeo = new BoxGeometry(0.1, 0.1, 0.1);
    const boxMat = new MeshBasicMaterial({ color: boxColor, transparent: true, opacity: 0.9 });
    const boxMesh = new Mesh(boxGeo, boxMat);
    g.add(boxMesh);

    // White Box Outline
    const edges = new EdgesGeometry(boxGeo);
    const lineMat = new LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
    const outline = new LineSegments(edges, lineMat);
    g.add(outline);

    // Text Label above the box
    const canvas = window.document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 256, 128);
    // Draw white border for label
    ctx.strokeStyle = "white";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 122);
    // Text
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText(id, 128, 64);

    const texture = new CanvasTexture(canvas);
    const spriteMat = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const labelSprite = new Sprite(spriteMat);
    labelSprite.position.set(0, 0.15, 0); // Position above the box
    labelSprite.scale.set(0.2, 0.1, 1);
    g.add(labelSprite);

    this.debugRoot.add(g);
    this.markerById.set(id, g);
    return g;
  }

  private updateDebugMarkers(frame: SlimeVRFrameMessage): void {
    const seen = new Set<string>();
    for (const [id, pose] of Object.entries(frame.trackers)) {
      if (!pose?.position || pose.position.length < 3) continue;
      seen.add(id);
      const g = this.ensureMarker(id);
      slimeVRPositionToThree(pose.position[0], pose.position[1], pose.position[2], g.position);

      if (pose.rotation && pose.rotation.length >= 3) {
        slimeVRRotationToThreeQuaternion(pose.rotation[0], pose.rotation[1], pose.rotation[2], g.quaternion);
      }
    }
    for (const [id, g] of this.markerById) {
      g.visible = seen.has(id);
    }

    // Update skeleton lines
    const points: number[] = [];
    for (const [id1, id2] of SKELETON_EDGES) {
      const g1 = this.markerById.get(id1);
      const g2 = this.markerById.get(id2);
      if (g1 && g2 && g1.visible && g2.visible) {
        points.push(g1.position.x, g1.position.y, g1.position.z);
        points.push(g2.position.x, g2.position.y, g2.position.z);
      }
    }
    this.skeletonGeo.setAttribute('position', new Float32BufferAttribute(points, 3));
  }

  update(_dt: number): void {
    if (getBodyTrackingMode() === "off") {
      this.disconnectClient();
      return;
    }

    this.ensureClientConnected();

    if (!this.client?.isConnected()) {
      for (const g of this.markerById.values()) g.visible = false;
      return;
    }

    const frame = this.client.getLatestFrame();
    if (!frame || !frame.trackers) {
      return;
    }

    this.updateDebugMarkers(frame);
    this.updateAvatarMapping(frame);
  }

  private updateAvatarMapping(frame: SlimeVRFrameMessage): void {
    const rpmSystem = this.world.getSystem(RPMUserControlledAvatarSystem);
    if (!rpmSystem) return;

    const model = rpmSystem.getCurrentAvatarModel();
    if (!model) return;

    // Initialize rest quaternions once per model
    if (this.trackedModel !== model) {
      this.trackedModel = model;
      this.boneRestWorldQuat.clear();

      const oldQuat = model.quaternion.clone();
      model.quaternion.identity();
      model.updateMatrixWorld(true);

      model.traverse((child: any) => {
        if ((child as any).isBone || child.type === "Bone") {
          const bone = child as unknown as Bone;
          this.boneRestWorldQuat.set(bone.name, bone.getWorldQuaternion(new Quaternion()));
        }
      });

      model.quaternion.copy(oldQuat);
      model.updateMatrixWorld(true);
    }

    const TRACKER_MAP: Record<string, string[]> = {
      "6": ["Spine2", "Head"],  // Tracker 6 drives both chest and head
      "1": ["Hips"],
      "7": ["LeftArm"],
      "8": ["RightArm"],
      "4": ["LeftUpLeg"],
      "5": ["RightUpLeg"],
      "2": ["LeftLeg"],
      "3": ["RightLeg"]
    };

    const bonesByName = new Map<string, Bone>();
    model.traverse((c: any) => {
      if (c.type === "Bone") bonesByName.set(c.name, c as unknown as Bone);
    });

    for (const [id, pose] of Object.entries(frame.trackers)) {
      const boneNames = TRACKER_MAP[id];
      if (!boneNames || !pose.rotation || pose.rotation.length < 3) continue;

      for (const boneName of boneNames) {
        const bone = bonesByName.get(boneName);
        if (!bone) continue;

        const restWorld = this.boneRestWorldQuat.get(bone.name);
        if (!restWorld) continue;

        const rawTrackerWorld = slimeVRRotationToThreeQuaternion(pose.rotation[0], pose.rotation[1], pose.rotation[2]);
        const trackerWorld = new Quaternion(rawTrackerWorld.x, rawTrackerWorld.y, rawTrackerWorld.z, rawTrackerWorld.w);
        const modelQuat = new Quaternion(model.quaternion.x, model.quaternion.y, model.quaternion.z, model.quaternion.w);

        // Virtual_Target = model.quat * Physical_Tracker * restWorld
        const virtualTrackerQuat = trackerWorld.premultiply(modelQuat);
        const targetWorld = virtualTrackerQuat.multiply(restWorld);

        const parentWorldQuat = new Quaternion();
        if (bone.parent) {
          bone.parent.updateWorldMatrix(true, false);
          bone.parent.getWorldQuaternion(parentWorldQuat);
        }
        bone.quaternion.copy(targetWorld).premultiply(parentWorldQuat.invert());
        bone.updateMatrixWorld(true);
      }
    }

    // Apply Crouching (Hips Y sync)
    const hipsPose = frame.trackers["1"];
    const hipsBone = bonesByName.get("Hips");
    if (hipsPose && hipsPose.position && hipsBone) {
      hipsBone.updateWorldMatrix(true, false);
      const currentWorldY = hipsBone.getWorldPosition(new Vector3()).y;

      const floorY = model.position.y;
      const targetWorldY = floorY + hipsPose.position[1] + HEAD_Y_OFFSET;
      const diff = targetWorldY - currentWorldY;

      hipsBone.position.y += diff / model.scale.y;
      hipsBone.updateMatrixWorld(true);
    }
  }

  destroy(): void {
    this.disconnectClient();
    this.world.scene.remove(this.debugRoot as unknown as Object3D);
    this.markerById.clear();
  }
}
