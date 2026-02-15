/**
 * RPMAvatarHandVisual - Custom hand visual that uses Ready Player Me avatar's hand skin
 * instead of the default generic hand. Maps WebXR hand joint poses to RPM skeleton bones.
 *
 * Based on Ready Player Me RpmHandDriver bone mapping:
 * https://docs.readyplayer.me/ready-player-me/integration-guides/unity/setup-for-xr-beta/setup-xr-hands/rpmhanddriver-script
 *
 * Implements the same interface as iwsdk's BaseHandVisual (which is not exported).
 */

import {
  type Group,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  Group as GroupClass,
  Vector3,
  Mesh,
  SphereGeometry,
  MeshBasicMaterial,
  Color,
} from "three";
import { SkeletonUtils } from "three-stdlib";

/** Minimal InputLayout type for hand visual (matches iwsdk) */
interface InputLayout {
  rootNodeName: string;
  gamepadMapping?: string;
  [key: string]: unknown;
}

/** Adapter interface to access jointTransforms from XRHandVisualAdapter */
interface XRHandVisualAdapterLike {
  jointTransforms?: Float32Array;
}

/**
 * Helper to find a bone by trying multiple possible names (RPM models can vary).
 */
function findBone(model: Object3D, names: string | string[]): Object3D | undefined {
  const arr = Array.isArray(names) ? names : [names];
  for (const name of arr) {
    const bone = model.getObjectByName(name);
    if (bone) return bone;
  }
  return undefined;
}

/**
 * RPM skeleton bones that we keep visible (hand + full chain from root).
 * All other bones are scaled to ~0 to collapse/hide the body mesh.
 * CRITICAL: Must include Hips, Spine, Spine1, Spine2 - scaling Hips would scale the entire skeleton.
 */
const RIGHT_HAND_BONES = new Set([
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "RightShoulder",
  "RightArm",
  "RightForeArm",
  "RightHand",
  "RightHandThumb1",
  "RightHandThumb2",
  "RightHandThumb3",
  "RightHandThumb4",
  "RightHandIndex1",
  "RightHandIndex2",
  "RightHandIndex3",
  "RightHandIndex4",
  "RightHandMiddle1",
  "RightHandMiddle2",
  "RightHandMiddle3",
  "RightHandMiddle4",
  "RightHandRing1",
  "RightHandRing2",
  "RightHandRing3",
  "RightHandRing4",
  "RightHandPinky1",
  "RightHandPinky2",
  "RightHandPinky3",
  "RightHandPinky4",
]);

const LEFT_HAND_BONES = new Set([
  "Hips",
  "Spine",
  "Spine1",
  "Spine2",
  "LeftShoulder",
  "LeftArm",
  "LeftForeArm",
  "LeftHand",
  "LeftHandThumb1",
  "LeftHandThumb2",
  "LeftHandThumb3",
  "LeftHandThumb4",
  "LeftHandIndex1",
  "LeftHandIndex2",
  "LeftHandIndex3",
  "LeftHandIndex4",
  "LeftHandMiddle1",
  "LeftHandMiddle2",
  "LeftHandMiddle3",
  "LeftHandMiddle4",
  "LeftHandRing1",
  "LeftHandRing2",
  "LeftHandRing3",
  "LeftHandRing4",
  "LeftHandPinky1",
  "LeftHandPinky2",
  "LeftHandPinky3",
  "LeftHandPinky4",
]);

/**
 * WebXR joint name -> RPM bone name mapping.
 * Your RPM model uses Index1-4, Middle1-4, Ring1-4, Pinky1-4 (no "0" metacarpal bone).
 * WebXR tip joints map to the last phalanx (Index4 etc.) since RPM has no separate tip bone.
 */
const WEBXR_TO_RPM_RIGHT: Record<string, string | string[]> = {
  wrist: "RightHand",
  "thumb-metacarpal": "RightHandThumb1",
  "thumb-phalanx-proximal": "RightHandThumb2",
  "thumb-phalanx-distal": "RightHandThumb3",
  "thumb-tip": "RightHandThumb4",
  "index-finger-metacarpal": "RightHandIndex1",
  "index-finger-phalanx-proximal": "RightHandIndex2",
  "index-finger-phalanx-intermediate": "RightHandIndex3",
  "index-finger-phalanx-distal": "RightHandIndex4",
  "index-finger-tip": "RightHandIndex4",
  "middle-finger-metacarpal": "RightHandMiddle1",
  "middle-finger-phalanx-proximal": "RightHandMiddle2",
  "middle-finger-phalanx-intermediate": "RightHandMiddle3",
  "middle-finger-phalanx-distal": "RightHandMiddle4",
  "middle-finger-tip": "RightHandMiddle4",
  "ring-finger-metacarpal": "RightHandRing1",
  "ring-finger-phalanx-proximal": "RightHandRing2",
  "ring-finger-phalanx-intermediate": "RightHandRing3",
  "ring-finger-phalanx-distal": "RightHandRing4",
  "ring-finger-tip": "RightHandRing4",
  "pinky-finger-metacarpal": "RightHandPinky1",
  "pinky-finger-phalanx-proximal": "RightHandPinky2",
  "pinky-finger-phalanx-intermediate": "RightHandPinky3",
  "pinky-finger-phalanx-distal": "RightHandPinky4",
  "pinky-finger-tip": "RightHandPinky4",
};

const WEBXR_TO_RPM_LEFT: Record<string, string | string[]> = {
  wrist: "LeftHand",
  "thumb-metacarpal": "LeftHandThumb1",
  "thumb-phalanx-proximal": "LeftHandThumb2",
  "thumb-phalanx-distal": "LeftHandThumb3",
  "thumb-tip": "LeftHandThumb4",
  "index-finger-metacarpal": "LeftHandIndex1",
  "index-finger-phalanx-proximal": "LeftHandIndex2",
  "index-finger-phalanx-intermediate": "LeftHandIndex3",
  "index-finger-phalanx-distal": "LeftHandIndex4",
  "index-finger-tip": "LeftHandIndex4",
  "middle-finger-metacarpal": "LeftHandMiddle1",
  "middle-finger-phalanx-proximal": "LeftHandMiddle2",
  "middle-finger-phalanx-intermediate": "LeftHandMiddle3",
  "middle-finger-phalanx-distal": "LeftHandMiddle4",
  "middle-finger-tip": "LeftHandMiddle4",
  "ring-finger-metacarpal": "LeftHandRing1",
  "ring-finger-phalanx-proximal": "LeftHandRing2",
  "ring-finger-phalanx-intermediate": "LeftHandRing3",
  "ring-finger-phalanx-distal": "LeftHandRing4",
  "ring-finger-tip": "LeftHandRing4",
  "pinky-finger-metacarpal": "LeftHandPinky1",
  "pinky-finger-phalanx-proximal": "LeftHandPinky2",
  "pinky-finger-phalanx-intermediate": "LeftHandPinky3",
  "pinky-finger-phalanx-distal": "LeftHandPinky4",
  "pinky-finger-tip": "LeftHandPinky4",
};

/** Scale factor for hand - RPM model is full body, scale down so hand is life-sized */
const HAND_SCALE = 0.25;

/** Set false to hide body and show only arm+hand */
const SKIP_HIDE_BODY = false;

/** Red sphere at wrist - helps verify placement when body hiding is off */
const SHOW_DEBUG_SPHERE = false;

/** Scale for bones we want to hide (collapse the body mesh) */
const HIDE_BONE_SCALE = 0.0001;

/** Set to true to log debug info to console */
const DEBUG = true;

export class RPMAvatarHandVisual {
  static assetKeyPrefix = "rpm-avatar-hand";
  static assetProfileId = "generic-hand";
  static assetPath = "/models/avatar/resident/RPM_clip.glb";

  /** Wrapper Group - positioned at grip by iwsdk. Contains avatarModel with offset. */
  readonly model: Group;
  xrInput?: XRHandVisualAdapterLike;

  private scene: Scene;
  private camera: PerspectiveCamera;
  private layout: InputLayout;
  private joints: (Object3D | undefined)[] = [];
  private enabled = true;
  private handBones: Set<string> = new Set();
  private _updateLogCount = 0;
  /** The actual avatar clone - offset so the wrist is at model origin */
  private avatarModel!: Group;
  private _wristOffsetApplied = false;

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    model: Group,
    layout: InputLayout
  ) {
    this.scene = scene;
    this.camera = camera;
    // Wrapper gets positioned at grip; avatarModel is offset so the hand is at wrapper origin
    this.model = new GroupClass();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SkeletonUtils type mismatch
    this.avatarModel = SkeletonUtils.clone(model as any) as unknown as Group;
    this.model.add(this.avatarModel);
    this.layout = layout;
    if (DEBUG) console.log("[RPMAvatarHandVisual] constructor called");
  }

  init(): void {
    if (DEBUG) console.log("[RPMAvatarHandVisual] init() called");
    // Scale the avatar so the hand is approximately life-sized
    this.avatarModel.scale.setScalar(HAND_SCALE);
    // Disable frustum culling for hand meshes
    this.avatarModel.traverse((child: Object3D) => {
      const m = child as { isMesh?: boolean; frustumCulled?: boolean };
      if (m.isMesh) {
        m.frustumCulled = false;
      }
    });
    if (SHOW_DEBUG_SPHERE) {
      const sphere = new Mesh(
        new SphereGeometry(0.05, 16, 16),
        new MeshBasicMaterial({ color: new Color(1, 0, 0) })
      );
      sphere.name = "debug-sphere";
      this.model.add(sphere);
    }
  }

  /**
   * Hide the body by scaling non-hand bones to ~0.
   * Vertices skinned to those bones will collapse, leaving only the hand visible.
   */
  private hideBody(handBones: Set<string>): void {
    this.avatarModel.traverse((child: Object3D) => {
      const bone = child as { isBone?: boolean };
      if (bone.isBone && child.name) {
        if (!handBones.has(child.name)) {
          child.scale.setScalar(HIDE_BONE_SCALE);
        }
      }
    });
  }

  connect(inputSource: XRInputSource, enabled: boolean): void {
    const handedness = inputSource.handedness;
    const hand = inputSource.hand;
    if (DEBUG) {
      console.log(
        "[RPMAvatarHandVisual] connect()",
        handedness,
        "enabled=",
        enabled,
        "hasHand=",
        !!hand,
        "hand?.size=",
        hand?.size
      );
    }
    this.toggle(enabled);
    const mapping =
      handedness === "right" ? WEBXR_TO_RPM_RIGHT : WEBXR_TO_RPM_LEFT;
    this.handBones =
      handedness === "right" ? RIGHT_HAND_BONES : LEFT_HAND_BONES;

    // Offset avatar so the wrist (hand) is at the grip position (only on first connect, not reconnect)
    if (!this._wristOffsetApplied) {
      const wristBoneName = handedness === "right" ? "RightHand" : "LeftHand";
      const wristBone = findBone(this.avatarModel, wristBoneName);
      if (wristBone) {
        const wristPos = new Vector3();
        wristBone.getWorldPosition(wristPos);
        this.avatarModel.position.sub(wristPos);
        this._wristOffsetApplied = true;
        if (DEBUG) console.log("[RPMAvatarHandVisual] wrist offset:", wristPos.toArray());
      }
    }

    // Hide the body - scale non-hand bones to ~0 so only the hand mesh shows
    if (!SKIP_HIDE_BODY) {
      this.hideBody(this.handBones);
    }

    // Build joint array in WebXR order, mapping to RPM bone names
    this.joints = [];
    if (!hand) {
      if (DEBUG) console.warn("[RPMAvatarHandVisual] connect() - no hand, skipping");
      return;
    }

    hand.forEach((jointSpace) => {
      const webxrName = jointSpace.jointName;
      const rpmBoneNames = mapping[webxrName];
      const bone = rpmBoneNames
        ? findBone(this.avatarModel, rpmBoneNames)
        : undefined;
      this.joints.push(bone);
      if (!bone && rpmBoneNames) {
        const names = Array.isArray(rpmBoneNames)
          ? rpmBoneNames.join(", ")
          : rpmBoneNames;
        console.warn(
          `[RPMAvatarHandVisual] Bone not found: ${names} (${handedness})`
        );
      }
    });
    const foundCount = this.joints.filter((b) => b).length;
    if (DEBUG) {
      console.log(
        "[RPMAvatarHandVisual] connect() done:",
        handedness,
        "joints found=",
        foundCount,
        "/",
        this.joints.length,
        "model.visible=",
        this.model.visible
      );
    }
  }

  disconnect(): void {
    this.joints = [];
    // Note: do NOT reset _wristOffsetApplied - the cached visual is reused on reconnect
  }

  toggle(enabled: boolean): void {
    if (this.enabled !== enabled) {
      this.model.visible = enabled;
      this.enabled = enabled;
    }
  }

  update(_delta: number): void {
    const jointTransforms = this.xrInput?.jointTransforms;
    if (DEBUG && this._updateLogCount < 3) {
      this._updateLogCount++;
      console.log(
        "[RPMAvatarHandVisual] update()",
        this._updateLogCount,
        "enabled=",
        this.enabled,
        "hasJointTransforms=",
        !!jointTransforms,
        "joints.length=",
        this.joints.length,
        "model.visible=",
        this.model.visible
      );
    }
    if (this.enabled && jointTransforms) {
      this.joints.forEach((bone, index) => {
        if (bone) {
          bone.matrix.fromArray(jointTransforms, index * 16);
          bone.matrix.decompose(
            bone.position,
            bone.quaternion,
            bone.scale
          );
        }
      });
    }
  }
}

