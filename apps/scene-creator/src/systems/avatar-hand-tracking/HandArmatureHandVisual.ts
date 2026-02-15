/**
 * HandArmatureHandVisual - Custom hand visual using the hand-only model from
 * https://github.com/Kirilbt/hand-armature (Blender armature + Three.js).
 *
 * The hand.glb has a skinned hand with 22 bones (Hand, Shirt, Vest meshes).
 * Colors are applied in code (like the original demo) - GLB is plain white.
 */

import {
  type Group,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  Group as GroupClass,
  Vector3,
  MeshToonMaterial,
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
 * WebXR joint index (0-24) -> skeleton bone index.
 * Your model: 0:Bone(wrist), 1:Bone001(palm), 2-5:thumb, 6-9:index, 10-13:middle,
 * 14-17:ring, 18-21:pinky (depth-first: Bone002->007->013,012; Bone003->008->015,014; etc.)
 */
const WEBXR_INDEX_TO_BONE_INDEX: number[] = [
  0,   // wrist -> 0 (Bone)
  2, 3, 4, 4,   // thumb -> 2,3,4 (Bone002, Bone007, Bone013)
  6, 7, 8, 8, 8,   // index -> 6,7,8 (Bone003, Bone008, Bone015)
  10, 11, 12, 12, 12,   // middle -> 10,11,12 (Bone004, Bone009, Bone017)
  14, 15, 16, 16, 16,   // ring -> 14,15,16 (Bone005, Bone010, Bone019)
  18, 19, 20, 20, 20,   // pinky -> 18,19,20 (Bone006, Bone011, Bone021)
];

/** Scale - hand-armature model is huge in Blender; VR hand ~0.15m */
const HAND_SCALE = 0.02;

/** Rotation offset (radians) to align hand model with WebXR. Tune if hand points wrong way. */
const HAND_ROTATION_X = 0;
const HAND_ROTATION_Y = 0;
const HAND_ROTATION_Z = 0;

/** Skin tone from hand-armature demo (0xE7A183) */
const HAND_COLOR = 0xe7a183;
const SHIRT_COLOR = 0x303030;
const VEST_COLOR = 0xe7d55c;

const DEBUG = false;

export class HandArmatureHandVisual {
  static assetKeyPrefix = "hand-armature";
  static assetProfileId = "generic-hand";
  static assetPath = "/models/avatar/organs/hand.glb";

  readonly model: Group;
  xrInput?: XRHandVisualAdapterLike;

  private scene: Scene;
  private camera: PerspectiveCamera;
  private layout: InputLayout;
  private joints: (Object3D | undefined)[] = [];
  private enabled = true;
  private handModel!: Group;
  private skeleton: { bones: Object3D[] } | null = null;
  private _wristOffsetApplied = false;

  constructor(
    scene: Scene,
    camera: PerspectiveCamera,
    model: Group,
    layout: InputLayout
  ) {
    this.scene = scene;
    this.camera = camera;
    this.model = new GroupClass();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SkeletonUtils type mismatch
    this.handModel = SkeletonUtils.clone(model as any) as unknown as Group;
    this.model.add(this.handModel);
    this.layout = layout;

    // Find skeleton from Hand mesh (hand-armature uses getObjectByName('Hand'))
    const handMesh = this.handModel.getObjectByName("Hand") as
      | { skeleton?: { bones: Object3D[] } }
      | undefined;
    if (handMesh?.skeleton) {
      this.skeleton = handMesh.skeleton;
    } else {
      this.handModel.traverse((child: Object3D) => {
        const skinned = child as { isSkinnedMesh?: boolean; skeleton?: { bones: Object3D[] } };
        if (skinned.isSkinnedMesh && skinned.skeleton && !this.skeleton) {
          this.skeleton = skinned.skeleton;
        }
      });
    }
    if (DEBUG) console.log("[HandArmatureHandVisual] skeleton:", !!this.skeleton, "bones:", this.skeleton?.bones?.length);
  }

  init(): void {
    this.handModel.scale.setScalar(HAND_SCALE);
    this.handModel.rotation.set(HAND_ROTATION_X, HAND_ROTATION_Y, HAND_ROTATION_Z);
    this.applyMaterials();
    this.handModel.traverse((child: Object3D) => {
      const m = child as { isMesh?: boolean; frustumCulled?: boolean };
      if (m.isMesh) {
        m.frustumCulled = false;
      }
    });
    if (DEBUG) console.log("[HandArmatureHandVisual] init()");
  }

  /** Apply skin-tone materials (GLB is plain white; demo applies colors in code) */
  private applyMaterials(): void {
    const apply = (name: string, color: number, emissive = false) => {
      const obj = this.handModel.getObjectByName(name) as { isMesh?: boolean; material?: unknown } | undefined;
      if (obj?.isMesh) {
        (obj as { material: unknown }).material = new MeshToonMaterial({
          color: new Color(color),
          ...(emissive && {
            emissive: new Color(color),
            emissiveIntensity: 0.2,
          }),
        });
      }
    };
    apply("Hand", HAND_COLOR, true);
    apply("Shirt", SHIRT_COLOR);
    apply("Vest", VEST_COLOR);
  }

  connect(inputSource: XRInputSource, enabled: boolean): void {
    const handedness = inputSource.handedness;
    const hand = inputSource.hand;

    if (DEBUG) {
      console.log("[HandArmatureHandVisual] connect()", handedness, "hasHand=", !!hand);
    }

    this.toggle(enabled);

    // hand-armature model is a RIGHT hand; mirror for left
    if (handedness === "left") {
      this.handModel.scale.set(-HAND_SCALE, HAND_SCALE, HAND_SCALE);
    } else {
      this.handModel.scale.setScalar(HAND_SCALE);
    }

    // Wrist offset: align bone 0 (wrist) with grip origin
    if (!this._wristOffsetApplied && this.skeleton?.bones[0]) {
      const wristPos = new Vector3();
      this.skeleton.bones[0].getWorldPosition(wristPos);
      this.handModel.position.sub(wristPos);
      this._wristOffsetApplied = true;
      if (DEBUG) console.log("[HandArmatureHandVisual] wrist offset:", wristPos.toArray());
    }

    // Build joints array: WebXR order -> skeleton bones
    this.joints = [];
    if (!hand || !this.skeleton) {
      if (DEBUG) console.warn("[HandArmatureHandVisual] no hand or skeleton");
      return;
    }

    let idx = 0;
    hand.forEach(() => {
      const boneIndex = WEBXR_INDEX_TO_BONE_INDEX[idx] ?? 0;
      const bone = this.skeleton!.bones[boneIndex];
      this.joints.push(bone);
      idx++;
    });

    if (DEBUG && this.skeleton) {
      const names = this.skeleton.bones.map((b, i) => `${i}:${b.name}`).join(", ");
      console.log("[HandArmatureHandVisual] bones:", names);
      const found = this.joints.filter((b) => b).length;
      console.log("[HandArmatureHandVisual] connect done:", handedness, "joints=", found, "/", this.joints.length);
    }
  }

  disconnect(): void {
    this.joints = [];
  }

  toggle(enabled: boolean): void {
    if (this.enabled !== enabled) {
      this.model.visible = enabled;
      this.enabled = enabled;
    }
  }

  update(_delta: number): void {
    const jointTransforms = this.xrInput?.jointTransforms;
    if (!this.enabled || !jointTransforms) return;

    // Apply joint transforms directly (iwsdk provides matrices for bone.matrix)
    this.joints.forEach((bone, index) => {
      if (bone) {
        bone.matrix.fromArray(jointTransforms, index * 16);
        bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
      }
    });
  }
}
