import {
  createSystem,
  Entity,
  Object3D,
  AssetManager,
} from "@iwsdk/core";

import { Box3, Quaternion, Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import type { Bone } from "three";
import { SkeletonControlledAvatarComponent } from "../components/SkeletonControlledAvatarComponent";
import { clampToWalkableArea, getRoomBounds } from "../config/navmesh";

// ============================================================================
// CONFIG
// ============================================================================

const RUN_VELOCITY = 5;
const WALK_VELOCITY = 2;
const ROTATE_SPEED = 0.2;

const SKELETON_FORWARD_OFFSET = Math.PI;

const KEY_FORWARD = "i";
const KEY_BACK = "k";
const KEY_LEFT = "j";
const KEY_RIGHT = "l";
const DIRECTIONS = [KEY_FORWARD, KEY_BACK, KEY_LEFT, KEY_RIGHT];

// Ready Player Me bone names
const BONE_NAMES = {
  Hips: "Hips",
  Spine: "Spine",
  Spine1: "Spine1",
  Spine2: "Spine2",
  Neck: "Neck",
  Head: "Head",
  LeftArm: "LeftArm",
  RightArm: "RightArm",
  LeftForeArm: "LeftForeArm",
  RightForeArm: "RightForeArm",
  LeftUpLeg: "LeftUpLeg",
  RightUpLeg: "RightUpLeg",
  LeftLeg: "LeftLeg",
  RightLeg: "RightLeg",
  LeftFoot: "LeftFoot",
  RightFoot: "RightFoot",
} as const;

// Procedural walk: amplitude (rad) and cycle speed
const WALK_LEG_AMPLITUDE = 0.5;
const WALK_ARM_AMPLITUDE = 0.45;
const WALK_CYCLE_SPEED = 8;

// Idle pose: arms slightly down so we don't stay in stiff T-pose (radians)
const IDLE_ARM_DROP_Z = -0.35;

// ============================================================================
// BONE REFS (only bones we drive for walk; rest stay at bind)
// ============================================================================

export interface SkeletonControlledBoneRefs {
  Hips?: Bone;
  LeftUpLeg?: Bone;
  RightUpLeg?: Bone;
  LeftLeg?: Bone;
  RightLeg?: Bone;
  LeftArm?: Bone;
  RightArm?: Bone;
  LeftForeArm?: Bone;
  RightForeArm?: Bone;
}

// ============================================================================
// AVATAR RECORD
// ============================================================================

interface SkeletonControlledAvatarRecord {
  entity: Entity;
  model: Object3D;
  bones: SkeletonControlledBoneRefs;
  walkCycleTime: number;
  toggleRun: boolean;
  walkDirection: Vector3;
  rotateAngle: Vector3;
  rotateQuaternion: Quaternion;
  cameraTarget: Vector3;
  /** Radians to add so model faces movement (RPM model forward is opposite) */
  forwardOffset: number;
}

// ============================================================================
// SKELETON CONTROLLED AVATAR SYSTEM
// ============================================================================

function findBones(model: Object3D): SkeletonControlledBoneRefs {
  const refs: SkeletonControlledBoneRefs = {};
  model.traverse((child: any) => {
    if (!child.isBone) return;
    const name = child.name;
    if (name === BONE_NAMES.Hips) refs.Hips = child as Bone;
    else if (name === BONE_NAMES.LeftUpLeg) refs.LeftUpLeg = child as Bone;
    else if (name === BONE_NAMES.RightUpLeg) refs.RightUpLeg = child as Bone;
    else if (name === BONE_NAMES.LeftLeg) refs.LeftLeg = child as Bone;
    else if (name === BONE_NAMES.RightLeg) refs.RightLeg = child as Bone;
    else if (name === BONE_NAMES.LeftArm) refs.LeftArm = child as Bone;
    else if (name === BONE_NAMES.RightArm) refs.RightArm = child as Bone;
    else if (name === BONE_NAMES.LeftForeArm) refs.LeftForeArm = child as Bone;
    else if (name === BONE_NAMES.RightForeArm) refs.RightForeArm = child as Bone;
  });
  return refs;
}

function applyProceduralWalk(
  bones: SkeletonControlledBoneRefs,
  cycleTime: number,
  isRunning: boolean
): void {
  const speed = isRunning ? 1.4 : 1;
  const t = cycleTime * speed;
  const legA = WALK_LEG_AMPLITUDE * (isRunning ? 1.2 : 1);
  const armA = WALK_ARM_AMPLITUDE * (isRunning ? 1.2 : 1);

  if (bones.LeftUpLeg) {
    bones.LeftUpLeg.rotation.x = legA * Math.sin(t);
  }
  if (bones.RightUpLeg) {
    bones.RightUpLeg.rotation.x = legA * Math.sin(t + Math.PI);
  }
  if (bones.LeftLeg) {
    bones.LeftLeg.rotation.x = 0.2 * Math.sin(t);
  }
  if (bones.RightLeg) {
    bones.RightLeg.rotation.x = 0.2 * Math.sin(t + Math.PI);
  }
  if (bones.LeftArm) {
    bones.LeftArm.rotation.z = IDLE_ARM_DROP_Z + armA * Math.sin(t + Math.PI);
  }
  if (bones.RightArm) {
    bones.RightArm.rotation.z = IDLE_ARM_DROP_Z + armA * Math.sin(t);
  }
}

/** Natural standing pose so we don't stay in stiff T-pose when idle */
function applyIdlePose(bones: SkeletonControlledBoneRefs): void {
  if (bones.LeftUpLeg) bones.LeftUpLeg.rotation.x = 0;
  if (bones.RightUpLeg) bones.RightUpLeg.rotation.x = 0;
  if (bones.LeftLeg) bones.LeftLeg.rotation.x = 0;
  if (bones.RightLeg) bones.RightLeg.rotation.x = 0;
  if (bones.LeftArm) bones.LeftArm.rotation.z = IDLE_ARM_DROP_Z;
  if (bones.RightArm) bones.RightArm.rotation.z = IDLE_ARM_DROP_Z;
}

export class SkeletonControlledAvatarSystem extends createSystem({
  controlledAvatars: {
    required: [SkeletonControlledAvatarComponent],
  },
}) {
  private avatarRecords: Map<string, SkeletonControlledAvatarRecord> = new Map();
  private keyStates: Map<string, boolean> = new Map();
  private currentControlledAvatarId: string | null = null;
  private active = true;
  private followCamera: {
    position: Vector3;
    getWorldDirection: (target: Vector3) => void;
    lookAt?: (a: any, b?: any, c?: any) => void;
  } | null = null;

  init() {
    console.log(
      "[SkeletonControlledAvatar] System initialized (resident3.glb, bone-controlled, no clips)"
    );
    this.setupKeyboardControls();
  }

  setCamera(cam: {
    position: Vector3;
    getWorldDirection: (target: Vector3) => void;
    lookAt?: (a: any, b?: any, c?: any) => void;
  }) {
    this.followCamera = cam;
  }

  setActive(active: boolean): void {
    if (active) this.keyStates.clear();
    this.active = active;
  }

  private setupKeyboardControls(): void {
    window.addEventListener("keydown", (event) => {
      if (!this.active) return;
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      const key = event.key.toLowerCase();
      this.keyStates.set(key, true);
      if (key === "shift" && this.currentControlledAvatarId) {
        const record = this.avatarRecords.get(this.currentControlledAvatarId);
        if (record) record.toggleRun = !record.toggleRun;
        event.preventDefault();
      }
      if (event.key === " ") {
        event.preventDefault();
        this.handleJump();
      }
    });
    window.addEventListener("keyup", (event) => {
      if (!this.active) return;
      this.keyStates.set(event.key.toLowerCase(), false);
    });
  }

  private isKeyPressed(key: string): boolean {
    return this.keyStates.get(key.toLowerCase()) === true;
  }

  private directionOffset(): number {
    const I = this.isKeyPressed(KEY_FORWARD);
    const K = this.isKeyPressed(KEY_BACK);
    const J = this.isKeyPressed(KEY_LEFT);
    const L = this.isKeyPressed(KEY_RIGHT);
    let directionOffset = 0;
    if (I) {
      if (J) directionOffset = Math.PI / 4;
      else if (L) directionOffset = -Math.PI / 4;
    } else if (K) {
      if (J) directionOffset = Math.PI / 4 + Math.PI / 2;
      else if (L) directionOffset = -Math.PI / 4 - Math.PI / 2;
      else directionOffset = Math.PI;
    } else if (J) directionOffset = Math.PI / 2;
    else if (L) directionOffset = -Math.PI / 2;
    return directionOffset;
  }

  async createSkeletonControlledAvatar(
    avatarId: string,
    avatarName: string,
    modelKey: string,
    position: [number, number, number]
  ): Promise<Entity | null> {
    try {
      const gltf = AssetManager.getGLTF(modelKey);
      if (!gltf) {
        console.error(`[SkeletonControlledAvatar] Model not found: ${modelKey}`);
        return null;
      }

      const avatarModel = SkeletonUtils.clone(gltf.scene) as Object3D;
      avatarModel.scale.setScalar(0.5);
      avatarModel.position.set(position[0], position[1], position[2]);
      avatarModel.rotation.set(0, 0, 0);

      this.world.scene.add(avatarModel);

      const bounds = getRoomBounds();
      const floorY = bounds?.floorY ?? position[1];
      const box = new Box3().setFromObject(avatarModel as any);
      const feetY = floorY - box.min.y + position[1];
      avatarModel.position.y = feetY;

      const bones = findBones(avatarModel);
      const found = Object.keys(bones).length;
      console.log(
        `[SkeletonControlledAvatar] ${avatarName} — bones found: ${found}`,
        Object.keys(bones)
      );
      if (found === 0) {
        const allBoneNames: string[] = [];
        avatarModel.traverse((child: any) => {
          if (child.isBone) allBoneNames.push(child.name);
        });
        console.warn(
          "[SkeletonControlledAvatar] No bones matched. Model bone names:",
          allBoneNames
        );
      }

      const entity = this.world.createTransformEntity(avatarModel);
      entity.addComponent(SkeletonControlledAvatarComponent, {
        avatarId,
        avatarName,
        baseY: feetY,
        isSelected: this.currentControlledAvatarId === null,
      });

      const record: SkeletonControlledAvatarRecord = {
        entity,
        model: avatarModel,
        bones,
        walkCycleTime: 0,
        toggleRun: true,
        walkDirection: new Vector3(),
        rotateAngle: new Vector3(0, 1, 0),
        rotateQuaternion: new Quaternion(),
        cameraTarget: new Vector3(),
        forwardOffset: SKELETON_FORWARD_OFFSET,
      };
      this.avatarRecords.set(avatarId, record);

      applyIdlePose(record.bones);
      avatarModel.updateMatrixWorld(true);

      if (this.currentControlledAvatarId === null) {
        this.currentControlledAvatarId = avatarId;
      }

      console.log(
        `[SkeletonControlledAvatar] ✅ Created: ${avatarName} (modelKey: ${modelKey}, bone-controlled)`
      );
      return entity;
    } catch (error) {
      console.error(
        `[SkeletonControlledAvatar] Failed to create ${avatarName}:`,
        error
      );
      return null;
    }
  }

  private handleJump(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    const baseY = record.entity.getValue(
      SkeletonControlledAvatarComponent,
      "baseY"
    ) as number;
    const isJumping = record.entity.getValue(
      SkeletonControlledAvatarComponent,
      "isJumping"
    ) as boolean;
    if (
      !isJumping &&
      Math.abs(record.model.position.y - baseY) < 0.1
    ) {
      record.entity.setValue(
        SkeletonControlledAvatarComponent,
        "isJumping",
        true
      );
      record.entity.setValue(
        SkeletonControlledAvatarComponent,
        "jumpVelocity",
        6
      );
    }
  }

  private updateCameraTarget(
    record: SkeletonControlledAvatarRecord,
    moveX: number,
    moveZ: number
  ): void {
    if (!this.followCamera) return;
    this.followCamera.position.x += moveX;
    this.followCamera.position.z += moveZ;
    record.cameraTarget.x = record.model.position.x;
    record.cameraTarget.y = record.model.position.y + 1;
    record.cameraTarget.z = record.model.position.z;
    if (this.followCamera.lookAt) {
      this.followCamera.lookAt(record.cameraTarget);
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;

    const directionPressed = DIRECTIONS.some((k) => this.isKeyPressed(k));

    if (directionPressed) {
      record.walkCycleTime += dt * WALK_CYCLE_SPEED;
      applyProceduralWalk(
        record.bones,
        record.walkCycleTime,
        record.toggleRun
      );
    } else {
      applyIdlePose(record.bones);
    }

    record.model.updateMatrixWorld(true);

    if (directionPressed && this.followCamera) {
      const angleYCameraDirection = Math.atan2(
        this.followCamera.position.x - record.model.position.x,
        this.followCamera.position.z - record.model.position.z
      );
      const directionOffset = this.directionOffset();

      record.rotateQuaternion.setFromAxisAngle(
        record.rotateAngle,
        angleYCameraDirection + directionOffset + record.forwardOffset
      );
      (record.model as any).quaternion.rotateTowards(
        record.rotateQuaternion,
        ROTATE_SPEED
      );

      this.followCamera.getWorldDirection(record.walkDirection);
      record.walkDirection.y = 0;
      record.walkDirection.normalize();
      record.walkDirection.applyAxisAngle(record.rotateAngle, directionOffset);

      const velocity = record.toggleRun ? RUN_VELOCITY : WALK_VELOCITY;
      const moveX = record.walkDirection.x * velocity * dt;
      const moveZ = record.walkDirection.z * velocity * dt;

      record.model.position.x += moveX;
      record.model.position.z += moveZ;

      const [clampedX, clampedZ] = clampToWalkableArea(
        record.model.position.x,
        record.model.position.z
      );
      record.model.position.x = clampedX;
      record.model.position.z = clampedZ;

      this.updateCameraTarget(record, moveX, moveZ);
    }

    const isJumping = record.entity.getValue(
      SkeletonControlledAvatarComponent,
      "isJumping"
    ) as boolean;
    if (isJumping) {
      let jumpVel = record.entity.getValue(
        SkeletonControlledAvatarComponent,
        "jumpVelocity"
      ) as number;
      const baseY = record.entity.getValue(
        SkeletonControlledAvatarComponent,
        "baseY"
      ) as number;
      jumpVel += -18 * dt;
      record.entity.setValue(
        SkeletonControlledAvatarComponent,
        "jumpVelocity",
        jumpVel
      );
      record.model.position.y += jumpVel * dt;
      if (record.model.position.y <= baseY) {
        record.model.position.y = baseY;
        record.entity.setValue(
          SkeletonControlledAvatarComponent,
          "isJumping",
          false
        );
        record.entity.setValue(
          SkeletonControlledAvatarComponent,
          "jumpVelocity",
          0
        );
      }
    }
  }

  switchToAvatar(avatarId: string): void {
    if (!this.avatarRecords.has(avatarId)) return;
    if (this.currentControlledAvatarId) {
      const r = this.avatarRecords.get(this.currentControlledAvatarId);
      if (r)
        r.entity.setValue(
          SkeletonControlledAvatarComponent,
          "isSelected",
          false
        );
    }
    this.currentControlledAvatarId = avatarId;
    const r = this.avatarRecords.get(avatarId);
    if (r)
      r.entity.setValue(SkeletonControlledAvatarComponent, "isSelected", true);
  }

  getCurrentAvatarId(): string | null {
    return this.currentControlledAvatarId;
  }

  destroy(): void {
    for (const [, record] of this.avatarRecords) {
      applyIdlePose(record.bones);
      const obj = record.entity.object3D;
      if (obj?.parent) obj.parent.remove(obj);
      record.entity.destroy();
    }
    this.avatarRecords.clear();
    this.followCamera = null;
    console.log("[SkeletonControlledAvatar] System destroyed");
  }
}
