import {
  createSystem,
  Entity,
  AssetManager,
} from "@iwsdk/core";

import {
  AnimationAction,
  AnimationMixer,
  Box3,
  Euler,
  LoopOnce,
  MathUtils,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { SkeletonUtils } from "three-stdlib";
import { UserControlledAvatarComponent } from "../components/UserControlledAvatarComponent";
import { AVATAR_VISUAL_SCALE } from "../config/avatarScale";
import {
  clampToWalkableAreaWorld,
  getRoomBounds,
  getWorldFloorY,
} from "../config/navmesh";
// ============================================================================
// CONFIG (Ready Player Me: forwardOffset = Math.PI so I/K/J/L face movement)
// ============================================================================

const FADE_DURATION = 0.2;
const RUN_VELOCITY = 2.5;
const WALK_VELOCITY = 1.0;
const ROTATE_SPEED = 0.2;
const XR_AVATAR_BACK_OFFSET = 0.12;

// Ready Player Me / test.glb: model forward is opposite; add 180° so avatar faces movement direction
const RPM_FORWARD_OFFSET = Math.PI;

// Keys: I=W, J=A, K=S, L=D
const KEY_FORWARD = "i";
const KEY_BACK = "k";
const KEY_LEFT = "j";
const KEY_RIGHT = "l";
const DIRECTIONS = [KEY_FORWARD, KEY_BACK, KEY_LEFT, KEY_RIGHT];

const _headYawEuler = new Euler(0, 0, 0, "YXZ");

/**
 * World Y of the soles (ground contact). Uses foot/ankle/toe bones when present so
 * the avatar is not placed by AABB min.y alone — that can be the head if the rig
 * pivot is at the head or the bounds are inverted relative to the floor.
 */
function getFootWorldY(model: Object3D, fallbackBox: Box3): number {
  const ys: number[] = [];
  model.traverse((child: any) => {
    if (child.type !== "Bone" && !(child as { isBone?: boolean }).isBone) return;
    const name = child.name;
    if (!/foot|toe|ankle/i.test(name)) return;
    if (/(upleg|leg|thigh|knee|calf|shin)/i.test(name) && !/foot/i.test(name)) return;
    // matrixWorld.elements[13] is world Y; avoids Vector3 type clashes between three builds
    ys.push(child.matrixWorld.elements[13]);
  });
  if (ys.length > 0) return Math.min(...ys);
  return fallbackBox.min.y;
}

// ============================================================================
// AVATAR RECORD
// ============================================================================

interface RPMUserControlledAvatarRecord {
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
  forwardOffset: number;
  isPlayingJump: boolean;
  previousActionBeforeJump: string;
  isPlayingWave: boolean;
  previousActionBeforeWave: string;
  isSitting: boolean;
  previousActionBeforeSit: string;
  isSleeping: boolean;
  previousActionBeforeSleep: string;
  /** World-space: model root Y minus foot sole Y (soles on floor at baseY). */
  rootAboveFootWorld: number;
}

// ============================================================================
// RPM USER CONTROLLED AVATAR SYSTEM (clip-based, for Ready Player Me / test.glb)
// ============================================================================

export class RPMUserControlledAvatarSystem extends createSystem({
  controlledAvatars: {
    required: [UserControlledAvatarComponent],
  },
}) {
  private avatarRecords: Map<string, RPMUserControlledAvatarRecord> = new Map();
  private keyStates: Map<string, boolean> = new Map();
  private currentControlledAvatarId: string | null = null;
  private followCamera: { position: Vector3; getWorldDirection: (target: Vector3) => Vector3; lookAt?: (a: any, b?: any, c?: any) => void } | null = null;
  // When false, this system does not process input or camera (used by avatar switcher)
  private active = true;
  /** Tracks the avatar's previous XR position to compute collision delta each frame. */
  private _prevXRModelPos = new Vector3();


  init() {
    console.log("[RPMUserControlledAvatar] System initialized (Ready Player Me / test.glb, forwardOffset=π)");
    this.setupKeyboardControls();
  }

  setCamera(cam: { position: Vector3; getWorldDirection: (target: Vector3) => Vector3; lookAt?: (a: any, b?: any, c?: any) => void }) {
    this.followCamera = cam;
  }

  /**
   * Desktop / inline view: place the follow camera behind the current avatar and look at torso height,
   * matching the framing used when moving with IJKL. No-op while WebXR is presenting.
   */
  alignFollowCameraToCurrentAvatar(): void {
    if (this.isXRPresenting()) return;
    if (!this.followCamera) return;
    const record = this.currentControlledAvatarId
      ? this.avatarRecords.get(this.currentControlledAvatarId)
      : null;
    if (!record) return;

    const m = record.model.position;
    const lookY = m.y + 1;
    const camY = getWorldFloorY() + 1.6;
    const distanceZ = 2.4;
    this.followCamera.position.set(m.x, camY, m.z + distanceZ);
    record.cameraTarget.set(m.x, lookY, m.z);
    if (this.followCamera.lookAt) {
      this.followCamera.lookAt(record.cameraTarget);
    }
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
      if (key === "u") {
        event.preventDefault();
        this.handleWave();
      }
      if (key === "m") {
        event.preventDefault();
        this.handleSit();
      }
      if (key === "n") {
        event.preventDefault();
        this.handleSleep();
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

  async createRPMUserControlledAvatar(
    avatarId: string,
    avatarName: string,
    modelKey: string,
    position: [number, number, number]
  ): Promise<Entity | null> {
    try {
      const gltf = AssetManager.getGLTF(modelKey);
      if (!gltf) {
        console.error(`[RPMUserControlledAvatar] Model not found: ${modelKey}`);
        return null;
      }

      const avatarModel = SkeletonUtils.clone(gltf.scene) as Object3D;
      avatarModel.scale.setScalar(AVATAR_VISUAL_SCALE);
      avatarModel.position.set(position[0], position[1], position[2]);
      avatarModel.rotation.set(0, 0, 0);

      this.world.scene.add(avatarModel);

      const bounds = getRoomBounds();
      const floorY = bounds?.floorY ?? position[1];
      avatarModel.updateMatrixWorld(true);
      const box = new Box3().setFromObject(avatarModel as any);
      const footWorldY = getFootWorldY(avatarModel, box);
      const feetY = position[1] + (floorY - footWorldY);
      avatarModel.position.y = feetY;

      const clips: unknown[] = Array.isArray(gltf.animations) ? gltf.animations : [];
      const rawClipNames = clips.map((c: any) => c?.name ?? "(no name)");
      console.log(`[RPMUserControlledAvatar] 📋 ${avatarName} (${modelKey}) — clips:`, rawClipNames.length ? rawClipNames : "(none)");

      const mixer = new AnimationMixer(avatarModel);
      const animationsMap = new Map<string, AnimationAction>();
      for (const clip of clips) {
        const c = clip as { name?: string };
        if (!c.name || c.name === "TPose" || c.name.toLowerCase() === "tpose") continue;
        const action = mixer.clipAction(clip as any);
        if (action) {
          if (c.name === "Jump") {
            action.setLoop(LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          animationsMap.set(c.name, action);
        }
      }
      console.log(`[RPMUserControlledAvatar] 🎬 ${avatarName} — animations:`, Array.from(animationsMap.keys()));

      const entity = this.world.createTransformEntity(avatarModel);
      entity.addComponent(UserControlledAvatarComponent, {
        avatarId,
        avatarName,
        baseY: feetY,
        isSelected: this.currentControlledAvatarId === null,
      });

      const currentAction = animationsMap.has("Idle") ? "Idle" : Array.from(animationsMap.keys())[0] || "Idle";
      animationsMap.forEach((action, key) => {
        if (key === currentAction) action.play();
      });

      avatarModel.updateMatrixWorld(true);
      const worldBox = new Box3().setFromObject(avatarModel as any);
      const soleWorldY = getFootWorldY(avatarModel, worldBox);
      const rootAboveFootWorld = avatarModel.position.y - soleWorldY;

      const record: RPMUserControlledAvatarRecord = {
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
        forwardOffset: RPM_FORWARD_OFFSET,
        isPlayingJump: false,
        previousActionBeforeJump: "Idle",
        isPlayingWave: false,
        previousActionBeforeWave: "Idle",
        isSitting: false,
        previousActionBeforeSit: "Idle",
        isSleeping: false,
        previousActionBeforeSleep: "Idle",
        rootAboveFootWorld,
      };
      this.avatarRecords.set(avatarId, record);

      if (this.currentControlledAvatarId === null) {
        this.currentControlledAvatarId = avatarId;
      }

      console.log(`[RPMUserControlledAvatar] ✅ Created: ${avatarName} (animations: ${Array.from(animationsMap.keys()).join(", ")})`);
      return entity;
    } catch (error) {
      console.error(`[RPMUserControlledAvatar] Failed to create ${avatarName}:`, error);
      return null;
    }
  }

  private handleJump(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    if (!record.animationsMap.has("Jump") || record.isPlayingJump) return;
    if (record.isSitting || record.isSleeping) return; // no jump while sitting/sleeping
    record.previousActionBeforeJump = record.currentAction;
    const jumpAction = record.animationsMap.get("Jump")!;
    const current = record.animationsMap.get(record.currentAction);
    if (current) current.fadeOut(FADE_DURATION);
    jumpAction.reset().fadeIn(FADE_DURATION).play();
    record.currentAction = "Jump";
    record.isPlayingJump = true;
    const onJumpFinished = (): void => {
      record.mixer.removeEventListener("finished", onJumpFinished);
      record.isPlayingJump = false;
      jumpAction.fadeOut(FADE_DURATION);
      const restore = record.animationsMap.get(record.previousActionBeforeJump);
      if (restore) {
        restore.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = record.previousActionBeforeJump;
      }
    };
    record.mixer.addEventListener("finished", onJumpFinished);
  }

  private handleWave(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    if (!record.animationsMap.has("Wave") || record.isPlayingWave) return;
    if (record.isSitting || record.isSleeping) return; // no wave while sitting/sleeping
    record.previousActionBeforeWave = record.currentAction;
    const waveAction = record.animationsMap.get("Wave")!;
    waveAction.setLoop(LoopOnce, 1);
    const current = record.animationsMap.get(record.currentAction);
    if (current) current.fadeOut(FADE_DURATION);
    waveAction.reset().fadeIn(FADE_DURATION).play();
    record.currentAction = "Wave";
    record.isPlayingWave = true;
    const onWaveFinished = (): void => {
      record.mixer.removeEventListener("finished", onWaveFinished);
      record.isPlayingWave = false;
      waveAction.fadeOut(FADE_DURATION);
      const restore = record.animationsMap.get(record.previousActionBeforeWave);
      if (restore) {
        restore.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = record.previousActionBeforeWave;
      }
    };
    record.mixer.addEventListener("finished", onWaveFinished);
  }

  private handleSit(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    if (!record.animationsMap.has("Sit")) return;
    if (record.isPlayingJump || record.isPlayingWave) return;

    const sitAction = record.animationsMap.get("Sit")!;

    if (record.isSitting) {
      // Stand up: fade back to previous action
      sitAction.fadeOut(FADE_DURATION);
      const restore = record.animationsMap.get(record.previousActionBeforeSit);
      if (restore) {
        restore.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = record.previousActionBeforeSit;
      }
      record.isSitting = false;
    } else {
      // Sit down: play Sit (looping) and save previous action
      record.previousActionBeforeSit = record.currentAction;
      record.isSleeping = false; // can't sit and sleep at once
      const current = record.animationsMap.get(record.currentAction);
      if (current) current.fadeOut(FADE_DURATION);
      sitAction.reset().fadeIn(FADE_DURATION).play();
      record.currentAction = "Sit";
      record.isSitting = true;
    }
  }

  private handleSleep(): void {
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;
    if (!record.animationsMap.has("Sleep")) return;
    if (record.isPlayingJump || record.isPlayingWave) return;

    const sleepAction = record.animationsMap.get("Sleep")!;

    if (record.isSleeping) {
      // Wake up: fade back to previous action
      sleepAction.fadeOut(FADE_DURATION);
      const restore = record.animationsMap.get(record.previousActionBeforeSleep);
      if (restore) {
        restore.reset().fadeIn(FADE_DURATION).play();
        record.currentAction = record.previousActionBeforeSleep;
      }
      record.isSleeping = false;
    } else {
      // Sleep: play Sleep (looping) and save previous action
      record.previousActionBeforeSleep = record.currentAction;
      record.isSitting = false; // can't sit and sleep at once
      const current = record.animationsMap.get(record.currentAction);
      if (current) current.fadeOut(FADE_DURATION);
      sleepAction.reset().fadeIn(FADE_DURATION).play();
      record.currentAction = "Sleep";
      record.isSleeping = true;
    }
  }

  private isXRPresenting(): boolean {
    return !!(this as { renderer?: { xr?: { isPresenting?: boolean } } }).renderer?.xr
      ?.isPresenting;
  }

  /**
   * In immersive WebXR, the headset drives the world camera. Keep the player avatar
   * under the user (floor-aligned) so it reads as "your" body for FBT / third-person.
   */
  private syncAvatarToXRUser(record: RPMUserControlledAvatarRecord): void {
    if (!this.isXRPresenting()) return;
    if (record.isSitting || record.isSleeping) return;

    const cam = (this.world as unknown as { camera?: { position: Vector3; quaternion: Quaternion } })
      .camera;
    if (!cam?.position || !cam.quaternion) return;

    const camForward = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    camForward.y = 0;
    if (camForward.lengthSq() > 1e-8) camForward.normalize();

    const targetX = cam.position.x - camForward.x * XR_AVATAR_BACK_OFFSET;
    const targetZ = cam.position.z - camForward.z * XR_AVATAR_BACK_OFFSET;
    const [cx, cz] = clampToWalkableAreaWorld(targetX, targetZ);

    record.model.position.x = cx;
    record.model.position.z = cz;

    if (!record.isPlayingJump) {
      const standY = getWorldFloorY() + record.rootAboveFootWorld;
      record.model.position.y = standY;
      record.entity.setValue(UserControlledAvatarComponent, "baseY", standY);
    }

    _headYawEuler.setFromQuaternion(cam.quaternion);
    record.model.rotation.set(0, _headYawEuler.y + record.forwardOffset, 0);
  }

  private updateCameraTarget(record: RPMUserControlledAvatarRecord, moveX: number, moveZ: number): void {
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
    for (const record of this.avatarRecords.values()) {
      record.mixer.update(dt);
    }
    if (!this.active) return;
    if (!this.currentControlledAvatarId) return;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    if (!record) return;


    this.syncAvatarToXRUser(record);

    const directionPressed = DIRECTIONS.some((k) => this.isKeyPressed(k));
    if (!record.isPlayingJump && !record.isPlayingWave && !record.isSitting && !record.isSleeping) {
      let play = "Idle";
      if (
        directionPressed &&
        record.toggleRun &&
        record.animationsMap.has("Run")
      ) {
        play = "Run";
      } else if (
        directionPressed &&
        (record.animationsMap.has("Walk") || record.animationsMap.has("Walking"))
      ) {
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
    }

    // Desktop / non-XR: IJKL moves avatar and orbits camera. In XR the headset moves the camera.
    // Cache followCamera so TypeScript can narrow it as non-null inside conditionals.
    const followCam = this.followCamera;
    const allowKeyboardLocomotion =
      !this.isXRPresenting() &&
      followCam &&
      !record.isPlayingWave &&
      !record.isSitting &&
      !record.isSleeping;

    // Lock movement during Jump/Wave/Sit: IJKL pressed but no position/rotation update
    if (directionPressed && allowKeyboardLocomotion && followCam) {
      const angleYCameraDirection = Math.atan2(
        followCam.position.x - record.model.position.x,
        followCam.position.z - record.model.position.z
      );
      const directionOffset = this.directionOffset();

      record.rotateQuaternion.setFromAxisAngle(record.rotateAngle, angleYCameraDirection + directionOffset + record.forwardOffset);
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
      // Idle (no direction key): body yaw follows camera look on the ground plane (view-aligned).
      followCam.getWorldDirection(record.walkDirection);
      record.walkDirection.y = 0;
      if (record.walkDirection.lengthSq() > 1e-8) {
        record.walkDirection.normalize();
        const lookYaw = Math.atan2(-record.walkDirection.x, -record.walkDirection.z);
        record.rotateQuaternion.setFromAxisAngle(
          record.rotateAngle,
          lookYaw + record.forwardOffset
        );
        (record.model as any).quaternion.rotateTowards(record.rotateQuaternion, ROTATE_SPEED);
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

  getCurrentAvatarModel(): Object3D | null {
    if (!this.currentControlledAvatarId) return null;
    const record = this.avatarRecords.get(this.currentControlledAvatarId);
    return record ? record.model : null;
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
    console.log("[RPMUserControlledAvatar] System destroyed");
  }
}
