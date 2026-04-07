import {
  createSystem,
  Entity,
  Object3D,
  AssetManager,
  AnimationMixer,
  AnimationAction,
} from "@iwsdk/core";

import { Box3, Euler, Quaternion, Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import { UserControlledAvatarComponent } from "../components/UserControlledAvatarComponent";
import { clampToWalkableAreaWorld, getRoomBounds, getWorldFloorY } from "../config/navmesh";
import { AVATAR_VISUAL_SCALE } from "../config/avatarScale";

// ============================================================================
// CONFIG
// ============================================================================

const FADE_DURATION = 0.2;
const RUN_VELOCITY = 2.5;
const WALK_VELOCITY = 1.0;
const ROTATE_SPEED = 0.2;

// Keys: I=W, J=A, K=S, L=D
const KEY_FORWARD = "i";
const KEY_BACK = "k";
const KEY_LEFT = "j";
const KEY_RIGHT = "l";
const DIRECTIONS = [KEY_FORWARD, KEY_BACK, KEY_LEFT, KEY_RIGHT];

// Soldier.glb forward vs movement: matches spawn rotation.set(0, Math.PI, 0)
const USER_AVATAR_FORWARD_OFFSET = Math.PI;

const _headYawEuler = new Euler(0, 0, 0, "YXZ");

// ============================================================================
// AVATAR RECORD
// ============================================================================

interface UserControlledAvatarRecord {
  entity: Entity;
  model: Object3D;
  mixer: AnimationMixer;
  animationsMap: Map<string, AnimationAction>;
  currentAction: string;
  toggleRun: boolean;
  walkDirection: Vector3;
  rotateAngle: Vector3;
  rotateQuaternion: Quaternion;
  cameraTarget: Vector3;
  /** World-space: model root Y minus lowest point of bounds (feet on floor in XR). */
  rootAboveFootWorld: number;
}

// ============================================================================
// USER CONTROLLED AVATAR SYSTEM (CharacterControls-style)
// ============================================================================

export class UserControlledAvatarSystem extends createSystem({
  controlledAvatars: {
    required: [UserControlledAvatarComponent],
  },
}) {
  private avatarRecords: Map<string, UserControlledAvatarRecord> = new Map();
  private keyStates: Map<string, boolean> = new Map();
  private currentControlledAvatarId: string | null = null;
  private followCamera: { position: Vector3; getWorldDirection: (target: Vector3) => Vector3; lookAt?: (a: any, b?: any, c?: any) => void } | null = null;
  // When false, this system does not process input or camera (used by avatar switcher)
  private active = true;

  init() {
    console.log("[UserControlledAvatar] System initialized (Soldier.glb, Idle/Walk/Run, camera-relative)");
    this.setupKeyboardControls();
  }

  setCamera(cam: { position: Vector3; getWorldDirection: (target: Vector3) => Vector3; lookAt?: (a: any, b?: any, c?: any) => void }) {
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
      ) return;
      const key = event.key.toLowerCase();
      this.keyStates.set(key, true);
      if (key === "h" && this.currentControlledAvatarId) {
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

  async createUserControlledAvatar(
    avatarId: string,
    avatarName: string,
    modelKey: string,
    position: [number, number, number]
  ): Promise<Entity | null> {
    try {
      const gltf = AssetManager.getGLTF(modelKey);
      if (!gltf) {
        console.error(`[UserControlledAvatar] Model not found: ${modelKey}`);
        return null;
      }

      const avatarModel = SkeletonUtils.clone(gltf.scene) as Object3D;
      avatarModel.scale.setScalar(AVATAR_VISUAL_SCALE);
      avatarModel.position.set(position[0], position[1], position[2]);
      avatarModel.rotation.set(0, Math.PI, 0);

      this.world.scene.add(avatarModel);

      const bounds = getRoomBounds();
      const floorY = bounds?.floorY ?? position[1];
      const box = new Box3().setFromObject(avatarModel as any);
      const feetY = floorY - box.min.y + position[1];
      avatarModel.position.y = feetY;

      const clips: unknown[] = Array.isArray(gltf.animations) ? gltf.animations : [];
      const rawClipNames = clips.map((c: any) => c?.name ?? "(no name)");
      console.log(`[UserControlledAvatar] 📋 ${avatarName} (${modelKey}) — raw animation clips from GLB:`, rawClipNames.length ? rawClipNames : "(none)");

      const boneNames: string[] = [];
      avatarModel.traverse((child: any) => {
        if (child.isBone) boneNames.push(child.name);
      });
      console.log(`[UserControlledAvatar] 🦴 ${avatarName} — skeleton bones (${boneNames.length}):`, boneNames);

      const mixer = new AnimationMixer(avatarModel);
      const animationsMap = new Map<string, AnimationAction>();
      for (const clip of clips) {
        const c = clip as { name?: string };
        if (!c.name || c.name === "TPose" || c.name.toLowerCase() === "tpose") continue;
        const action = mixer.clipAction(clip as any);
        if (action) animationsMap.set(c.name, action);
      }
      console.log(`[UserControlledAvatar] 🎬 ${avatarName} — animations we can use (Idle/Walk/Run):`, Array.from(animationsMap.keys()));
      if (animationsMap.size === 0) {
        console.warn(`[UserControlledAvatar] ⚠️ ${avatarName} has no Idle/Walk/Run clips — movement uses these. Without them, character will not move.`);
      }

      const entity = this.world.createTransformEntity(avatarModel);
      entity.addComponent(UserControlledAvatarComponent, {
        avatarId,
        avatarName,
        baseY: feetY,
        isSelected: this.currentControlledAvatarId === null,
      });

      avatarModel.updateMatrixWorld(true);
      const worldBox = new Box3().setFromObject(avatarModel as any);
      const rootAboveFootWorld = avatarModel.position.y - worldBox.min.y;

      const currentAction = animationsMap.has("Idle") ? "Idle" : Array.from(animationsMap.keys())[0] || "Idle";
      animationsMap.forEach((action, key) => {
        if (key === currentAction) action.play();
      });

      const record: UserControlledAvatarRecord = {
        entity,
        model: avatarModel,
        mixer,
        animationsMap,
        currentAction,
        toggleRun: false,
        walkDirection: new Vector3(),
        rotateAngle: new Vector3(0, 1, 0),
        rotateQuaternion: new Quaternion(),
        cameraTarget: new Vector3(),
        rootAboveFootWorld,
      };
      this.avatarRecords.set(avatarId, record);

      if (this.currentControlledAvatarId === null) {
        this.currentControlledAvatarId = avatarId;
      }

      console.log(`[UserControlledAvatar] ✅ Created: ${avatarName} (animations: ${Array.from(animationsMap.keys()).join(", ")})`);
      return entity;
    } catch (error) {
      console.error(`[UserControlledAvatar] Failed to create ${avatarName}:`, error);
      return null;
    }
  }

  private handleJump(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    const baseY = record.entity.getValue(UserControlledAvatarComponent, "baseY") as number;
    const isJumping = record.entity.getValue(UserControlledAvatarComponent, "isJumping") as boolean;
    if (!isJumping && Math.abs(record.model.position.y - baseY) < 0.1) {
      record.entity.setValue(UserControlledAvatarComponent, "isJumping", true);
      record.entity.setValue(UserControlledAvatarComponent, "jumpVelocity", 6);
    }
  }

  private isXRPresenting(): boolean {
    return !!(this as { renderer?: { xr?: { isPresenting?: boolean } } }).renderer?.xr
      ?.isPresenting;
  }

  private syncAvatarToXRUser(record: UserControlledAvatarRecord): void {
    if (!this.isXRPresenting()) return;

    const cam = (this.world as { camera?: { position: Vector3; quaternion: Quaternion } })
      .camera;
    if (!cam?.position || !cam.quaternion) return;

    const [cx, cz] = clampToWalkableAreaWorld(cam.position.x, cam.position.z);
    record.model.position.x = cx;
    record.model.position.z = cz;

    const isJumping = record.entity.getValue(UserControlledAvatarComponent, "isJumping") as boolean;
    if (!isJumping) {
      const standY = getWorldFloorY() + record.rootAboveFootWorld;
      record.model.position.y = standY;
      record.entity.setValue(UserControlledAvatarComponent, "baseY", standY);
    }

    _headYawEuler.setFromQuaternion(cam.quaternion);
    record.model.rotation.set(0, _headYawEuler.y + USER_AVATAR_FORWARD_OFFSET, 0);
  }

  private updateCameraTarget(record: UserControlledAvatarRecord, moveX: number, moveZ: number): void {
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
    // Always advance all avatar mixers so inactive avatars keep playing Idle
    for (const record of this.avatarRecords.values()) {
      record.mixer.update(dt);
    }
    if (!this.active) return;
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;

    const directionPressed = DIRECTIONS.some((k) => this.isKeyPressed(k));
    let play = "Idle";
    if (directionPressed && record.toggleRun && record.animationsMap.has("Run")) {
      play = "Run";
    } else if (directionPressed && (record.animationsMap.has("Walk") || record.animationsMap.has("Walking"))) {
      play = record.animationsMap.has("Walk") ? "Walk" : "Walking";
    } else if (record.animationsMap.has("Idle")) {
      play = "Idle";
    } else {
      play = record.currentAction;
    }

    if (record.animationsMap.has(play) && record.currentAction !== play) {
      const toPlay = record.animationsMap.get(play)!;
      const current = record.animationsMap.get(record.currentAction);
      if (current) {
        current.fadeOut(FADE_DURATION);
      }
      toPlay.reset().fadeIn(FADE_DURATION).play();
      record.currentAction = play;
    }

    this.syncAvatarToXRUser(record);

    const followCam = this.followCamera;
    const allowKeyboardLocomotion = !this.isXRPresenting() && !!followCam;

    // Move when any direction key is pressed (desktop only).
    if (directionPressed && allowKeyboardLocomotion && followCam) {
      const angleYCameraDirection = Math.atan2(
        followCam.position.x - record.model.position.x,
        followCam.position.z - record.model.position.z
      );
      const directionOffset = this.directionOffset();

      record.rotateQuaternion.setFromAxisAngle(
        record.rotateAngle,
        angleYCameraDirection + directionOffset + USER_AVATAR_FORWARD_OFFSET
      );
      (record.model as any).quaternion.rotateTowards(record.rotateQuaternion, ROTATE_SPEED);

      followCam.getWorldDirection(record.walkDirection);
      record.walkDirection.y = 0;
      record.walkDirection.normalize();
      record.walkDirection.applyAxisAngle(record.rotateAngle, directionOffset);

      const velocity =
        record.currentAction === "Run" ? RUN_VELOCITY : WALK_VELOCITY;
      const moveX = record.walkDirection.x * velocity * dt;
      const moveZ = record.walkDirection.z * velocity * dt;

      const oldX = record.model.position.x;
      const oldZ = record.model.position.z;
      record.model.position.x += moveX;
      record.model.position.z += moveZ;

      // Use world-space clamp (accounts for room alignment transform)
      const [clampedX, clampedZ] = clampToWalkableAreaWorld(
        record.model.position.x,
        record.model.position.z
      );
      record.model.position.x = clampedX;
      record.model.position.z = clampedZ;

      this.updateCameraTarget(record, record.model.position.x - oldX, record.model.position.z - oldZ);
    } else if (allowKeyboardLocomotion && followCam) {
      followCam.getWorldDirection(record.walkDirection);
      record.walkDirection.y = 0;
      if (record.walkDirection.lengthSq() > 1e-8) {
        record.walkDirection.normalize();
        const lookYaw = Math.atan2(-record.walkDirection.x, -record.walkDirection.z);
        record.rotateQuaternion.setFromAxisAngle(
          record.rotateAngle,
          lookYaw + USER_AVATAR_FORWARD_OFFSET
        );
        (record.model as any).quaternion.rotateTowards(record.rotateQuaternion, ROTATE_SPEED);
      }
    }

    const isJumping = record.entity.getValue(UserControlledAvatarComponent, "isJumping") as boolean;
    if (isJumping) {
      let jumpVel = record.entity.getValue(UserControlledAvatarComponent, "jumpVelocity") as number;
      const baseY = record.entity.getValue(UserControlledAvatarComponent, "baseY") as number;
      jumpVel += -18 * dt;
      record.entity.setValue(UserControlledAvatarComponent, "jumpVelocity", jumpVel);
      record.model.position.y += jumpVel * dt;
      if (record.model.position.y <= baseY) {
        record.model.position.y = baseY;
        record.entity.setValue(UserControlledAvatarComponent, "isJumping", false);
        record.entity.setValue(UserControlledAvatarComponent, "jumpVelocity", 0);
      }
    }
  }

  switchToAvatar(avatarId: string): void {
    if (!this.avatarRecords.has(avatarId)) return;
    if (this.currentControlledAvatarId) {
      const r = this.avatarRecords.get(this.currentControlledAvatarId);
      if (r) r.entity.setValue(UserControlledAvatarComponent, "isSelected", false);
    }
    this.currentControlledAvatarId = avatarId;
    const r = this.avatarRecords.get(avatarId);
    if (r) r.entity.setValue(UserControlledAvatarComponent, "isSelected", true);
  }

  getCurrentAvatarId(): string | null {
    return this.currentControlledAvatarId;
  }

  destroy(): void {
    for (const [, record] of this.avatarRecords) {
      record.mixer.stopAllAction();
      const obj = record.entity.object3D;
      if (obj?.parent) obj.parent.remove(obj);
      record.entity.destroy();
    }
    this.avatarRecords.clear();
    this.followCamera = null;
    console.log("[UserControlledAvatar] System destroyed");
  }
}
