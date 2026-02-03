import {
  createSystem,
  Entity,
  Object3D,
  AssetManager,
  AnimationMixer,
  AnimationAction,
  LoopRepeat,
} from "@iwsdk/core";

import { SkeletonUtils } from "three-stdlib";
import { MathUtils, SkinnedMesh } from "three";
import {
  EntityManager as YukaEntityManager,
  Vehicle,
  WanderBehavior,
} from "yuka";
import { Lipsync, VISEMES } from "wawa-lipsync";

import { ResidentAvatarComponent } from "../components/ResidentAvatarComponent";
import { clampToWalkableArea, getRoomBounds } from "../config/navmesh";

const DEFAULT_MOVEMENT_RANGE = 3;

interface ResidentAvatarRecord {
  entity: Entity;
  model: Object3D;
  rootBone?: Object3D;
  mixer: AnimationMixer;
  animations: Map<string, AnimationAction>;
  availableAnimations: string[];
  agent: Vehicle;
  wanderBehavior: WanderBehavior;
  wanderPauseTimer: number;
  wanderPauseDuration: number;
  isWanderPaused: boolean;
  morphTargetMeshes: SkinnedMesh[];
  isSpeaking: boolean;
}

const LIPSYNC_LERP_SPEED = {
  vowel: 0.15,
  consonant: 0.35,
  reset: 0.1,
};

export class ResidentAvatarSystem extends createSystem({
  residents: {
    required: [ResidentAvatarComponent],
  },
}) {
  private residentRecords: Map<string, ResidentAvatarRecord> = new Map();
  private yukaEntityManager: YukaEntityManager = new YukaEntityManager();
  private lipsyncManager: Lipsync = new Lipsync();
  private audioElement: HTMLAudioElement = new Audio();
  private currentSpeakingAvatarId: string | null = null;

  init() {
    console.log("[ResidentAvatar] System initialized (Walk + Idle + Wave + Lip Sync)");
    
    this.audioElement.crossOrigin = "anonymous";
    this.audioElement.addEventListener("ended", () => {
      this.onSpeechEnded();
    });
  }

  async createResidentAvatar(
    avatarId: string,
    avatarName: string,
    modelKey: string,
    position: [number, number, number],
    animationKeys: string[]
  ): Promise<Entity | null> {
    try {
      console.log(`[ResidentAvatar] Creating resident: ${avatarName}`);

      const gltf = AssetManager.getGLTF(modelKey);
      if (!gltf) {
        console.error(`[ResidentAvatar] Model not found: ${modelKey}`);
        return null;
      }

      const avatarModel = SkeletonUtils.clone(gltf.scene);
      avatarModel.scale.setScalar(0.5);
      avatarModel.position.set(position[0], position[1], position[2]);
      avatarModel.rotation.set(0, 0, 0);

      this.world.scene.add(avatarModel);
      const entity = this.world.createTransformEntity(avatarModel);

      entity.addComponent(ResidentAvatarComponent, {
        avatarId,
        avatarName,
        currentAnimation: "Idle",
        currentState: "idle",
        maxSpeed: 0.8,
        wanderRadius: DEFAULT_MOVEMENT_RANGE,
        originX: position[0],
        originZ: position[2],
      });

      const mixer = new AnimationMixer(avatarModel);
      const animations = new Map<string, AnimationAction>();
      const availableAnimations: string[] = [];

      for (const animKey of animationKeys) {
        const baseName = animKey.replace(/\d+$/, "");
        
        if (!["Idle", "Walking", "Waving"].includes(baseName)) {
          console.log(`[ResidentAvatar] Skipping ${animKey} (not needed)`);
          continue;
        }

        const animGltf = AssetManager.getGLTF(animKey);

        if (animGltf && animGltf.animations && animGltf.animations.length > 0) {
          let bestClip = animGltf.animations[0];
          if (animGltf.animations.length > 1) {
            bestClip = animGltf.animations.reduce((prev, current) =>
              prev.duration > current.duration ? prev : current
            );
          }

          const clip = bestClip.clone();
          clip.name = baseName;

          clip.tracks.forEach((track) => {
            track.name = track.name.replace(/^mixamorig:?/, "");
          });

          if (baseName === "Walking") {
            clip.tracks.forEach((track) => {
              if (/(Hips|mixamorig|Root|Pelvis|Armature|Bip).*\.position$/i.test(track.name)) {
                const values = track.values;
                for (let i = 0; i < values.length / 3; i++) {
                  const idx = i * 3;
                  values[idx] = 0;
                  values[idx + 2] = 0;
                }
              }
            });
          }

          const action = mixer.clipAction(clip);
          action.setLoop(LoopRepeat, Infinity);
          animations.set(baseName, action);
          availableAnimations.push(baseName);

          console.log(`[ResidentAvatar] ✅ Loaded: ${baseName} (${clip.duration.toFixed(2)}s)`);
        }
      }

      if (availableAnimations.length === 0) {
        console.error(`[ResidentAvatar] No animations available for ${avatarName}`);
        return null;
      }

      let rootBone: Object3D | undefined;
      avatarModel.traverse((child) => {
        if (!rootBone && /(Hips|mixamorigHips|Root|Pelvis|Armature|Bip)/i.test(child.name)) {
          rootBone = child;
        }
      });

      const morphTargetMeshes: SkinnedMesh[] = [];
      avatarModel.traverse((child) => {
        const maybeSkinnedMesh = child as any;
        if (
          maybeSkinnedMesh.isSkinnedMesh &&
          maybeSkinnedMesh.morphTargetDictionary &&
          maybeSkinnedMesh.morphTargetInfluences
        ) {
          const mesh = maybeSkinnedMesh as SkinnedMesh;
          if (mesh.morphTargetDictionary!["viseme_aa"] !== undefined) {
            morphTargetMeshes.push(mesh);
          }
        }
      });

      if (morphTargetMeshes.length > 0) {
        console.log(`[ResidentAvatar] 🎤 Lip sync ready for ${avatarName}`);
      }

      const agent = new Vehicle();
      agent.position.set(position[0], position[1], position[2]);
      agent.maxSpeed = 0.8;
      agent.maxForce = 1.5;
      agent.mass = 1;
      agent.updateOrientation = true;

      const wanderBehavior = new WanderBehavior(0.5, 2, 0.3);
      wanderBehavior.active = true;
      agent.steering.add(wanderBehavior);

      agent.setRenderComponent(avatarModel, (yukaEntity: any, renderComponent: any) => {
        const bounds = getRoomBounds();
        const currentX = yukaEntity.position.x;
        const currentZ = yukaEntity.position.z;

        if (wanderBehavior.active && bounds) {
          const margin = 0.4;
          let steerX = 0, steerZ = 0;
          
          if (currentX - bounds.minX < margin) steerX = (margin - (currentX - bounds.minX)) * 2;
          else if (bounds.maxX - currentX < margin) steerX = -(margin - (bounds.maxX - currentX)) * 2;
          
          if (currentZ - bounds.minZ < margin) steerZ = (margin - (currentZ - bounds.minZ)) * 2;
          else if (bounds.maxZ - currentZ < margin) steerZ = -(margin - (bounds.maxZ - currentZ)) * 2;
          
          if (steerX !== 0 || steerZ !== 0) {
            yukaEntity.velocity.x += steerX * 0.15;
            yukaEntity.velocity.z += steerZ * 0.15;
            
            const speed = Math.sqrt(yukaEntity.velocity.x ** 2 + yukaEntity.velocity.z ** 2);
            if (speed > yukaEntity.maxSpeed) {
              yukaEntity.velocity.x = (yukaEntity.velocity.x / speed) * yukaEntity.maxSpeed;
              yukaEntity.velocity.z = (yukaEntity.velocity.z / speed) * yukaEntity.maxSpeed;
            }
          }
        }
        
        if (!wanderBehavior.active) {
          yukaEntity.velocity.set(0, 0, 0);
        }

        const [px, pz] = clampToWalkableArea(currentX, currentZ);
        if (px !== currentX || pz !== currentZ) {
          yukaEntity.position.x = px;
          yukaEntity.position.z = pz;
          if (wanderBehavior.active) {
            yukaEntity.velocity.x *= 0.5;
            yukaEntity.velocity.z *= 0.5;
          }
        }

        renderComponent.position.set(px, yukaEntity.position.y, pz);
        
        const r = yukaEntity.rotation;
        renderComponent.quaternion.set(r.x, r.y, r.z, r.w);
      });

      this.yukaEntityManager.add(agent);

      const wanderPauseTimer = 8 + Math.random() * 7;
      const wanderPauseDuration = 5 + Math.random() * 5;

      const record: ResidentAvatarRecord = {
        entity,
        model: avatarModel,
        rootBone,
        mixer,
        animations,
        availableAnimations,
        agent,
        wanderBehavior,
        wanderPauseTimer,
        wanderPauseDuration,
        isWanderPaused: false,
        morphTargetMeshes,
        isSpeaking: false,
      };
      this.residentRecords.set(avatarId, record);

      this.playAnimation(avatarId, "Walking");
      record.mixer.update(0.016);

      console.log(`[ResidentAvatar] ✅ Created: ${avatarName}`);
      console.log(`[ResidentAvatar]    Animations: ${availableAnimations.join(", ")}`);

      return entity;
    } catch (error) {
      console.error(`[ResidentAvatar] Failed to create ${avatarName}:`, error);
      return null;
    }
  }

  private playAnimation(avatarId: string, animationName: string): void {
    const record = this.residentRecords.get(avatarId);
    if (!record) return;

    const newAction = record.animations.get(animationName);
    if (!newAction) return;

    let currentAction: AnimationAction | null = null;
    record.animations.forEach((action) => {
      if (action.isRunning() && action !== newAction) {
        currentAction = action;
      }
    });

    if (currentAction) {
      newAction.reset().play();
      (currentAction as AnimationAction).crossFadeTo(newAction, 0.3, true);
    } else {
      newAction.reset().play();
    }

    record.entity.setValue(ResidentAvatarComponent, "currentAnimation", animationName);
  }

  private getRandomIdleAnimation(record: ResidentAvatarRecord): string {
    if (record.availableAnimations.includes("Waving") && Math.random() < 0.3) {
      return "Waving";
    }
    return "Idle";
  }

  speak(avatarId: string, audioUrl: string): void {
    const record = this.residentRecords.get(avatarId);
    if (!record || record.morphTargetMeshes.length === 0) return;

    if (this.currentSpeakingAvatarId) {
      this.stopSpeaking();
    }

    console.log(`[ResidentAvatar] 🗣️ ${avatarId} speaking: ${audioUrl}`);

    this.audioElement.src = audioUrl;
    this.lipsyncManager.connectAudio(this.audioElement);
    
    this.currentSpeakingAvatarId = avatarId;
    record.isSpeaking = true;

    record.wanderBehavior.active = false;
    record.agent.velocity.set(0, 0, 0);
    record.isWanderPaused = true;

    const currentAnim = record.entity.getValue(ResidentAvatarComponent, "currentAnimation") as string;
    if (currentAnim === "Walking") {
      this.playAnimation(avatarId, "Idle");
    }

    this.audioElement.play().catch((error) => {
      console.error(`[ResidentAvatar] Audio error:`, error);
      this.onSpeechEnded();
    });
  }

  stopSpeaking(): void {
    if (!this.currentSpeakingAvatarId) return;

    const record = this.residentRecords.get(this.currentSpeakingAvatarId);
    if (record) {
      record.isSpeaking = false;
      this.resetAllVisemes(record);
    }

    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    this.currentSpeakingAvatarId = null;
  }

  private onSpeechEnded(): void {
    if (!this.currentSpeakingAvatarId) return;

    const record = this.residentRecords.get(this.currentSpeakingAvatarId);
    if (record) {
      record.isSpeaking = false;
      this.resetAllVisemes(record);
      record.wanderPauseTimer = 2;
    }

    this.currentSpeakingAvatarId = null;
    console.log(`[ResidentAvatar] 🔇 Speech ended`);
  }

  private applyViseme(record: ResidentAvatarRecord, visemeName: string, weight: number, speed: number): void {
    for (const mesh of record.morphTargetMeshes) {
      const index = mesh.morphTargetDictionary![visemeName];
      if (index !== undefined && mesh.morphTargetInfluences) {
        mesh.morphTargetInfluences[index] = MathUtils.lerp(
          mesh.morphTargetInfluences[index],
          weight,
          speed
        );
      }
    }
  }

  private resetAllVisemes(record: ResidentAvatarRecord): void {
    const allVisemes = Object.values(VISEMES);
    for (const mesh of record.morphTargetMeshes) {
      for (const viseme of allVisemes) {
        const index = mesh.morphTargetDictionary![viseme];
        if (index !== undefined && mesh.morphTargetInfluences) {
          mesh.morphTargetInfluences[index] = 0;
        }
      }
    }
  }

  private processLipSync(): void {
    if (!this.currentSpeakingAvatarId) return;

    const record = this.residentRecords.get(this.currentSpeakingAvatarId);
    if (!record || !record.isSpeaking) return;

    this.lipsyncManager.processAudio();
    const currentViseme = this.lipsyncManager.viseme;
    
    const isVowel = ["viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U"].includes(currentViseme);
    const lerpSpeed = isVowel ? LIPSYNC_LERP_SPEED.vowel : LIPSYNC_LERP_SPEED.consonant;

    this.applyViseme(record, currentViseme, 1, lerpSpeed);

    const allVisemes = Object.values(VISEMES);
    for (const viseme of allVisemes) {
      if (viseme !== currentViseme) {
        this.applyViseme(record, viseme, 0, LIPSYNC_LERP_SPEED.reset);
      }
    }
  }

  update(dt: number): void {
    this.yukaEntityManager.update(dt);
    this.processLipSync();

    for (const [avatarId, record] of this.residentRecords) {
      record.mixer.update(dt);

      if (record.rootBone) {
        record.rootBone.position.x = 0;
        record.rootBone.position.z = 0;
      }

      if (record.isSpeaking) continue;

      const currentAnimation = record.entity.getValue(ResidentAvatarComponent, "currentAnimation") as string;

      record.wanderPauseTimer -= dt;

      if (!record.isWanderPaused && record.wanderPauseTimer <= 0) {
        record.isWanderPaused = true;
        record.wanderBehavior.active = false;
        record.agent.velocity.set(0, 0, 0);
        record.wanderPauseTimer = record.wanderPauseDuration;
        
        const idleAnim = this.getRandomIdleAnimation(record);
        this.playAnimation(avatarId, idleAnim);
        
      } else if (record.isWanderPaused && record.wanderPauseTimer <= 0) {
        record.isWanderPaused = false;
        record.wanderBehavior.active = true;
        record.wanderPauseTimer = 8 + Math.random() * 7;
        record.wanderPauseDuration = 5 + Math.random() * 5;
        
        this.playAnimation(avatarId, "Walking");
      }
      
      if (!record.isWanderPaused && record.wanderBehavior.active && currentAnimation !== "Walking") {
        this.playAnimation(avatarId, "Walking");
      }
    }
  }

  destroy(): void {
    this.stopSpeaking();
    this.audioElement.src = "";
    
    for (const [, record] of this.residentRecords) {
      this.yukaEntityManager.remove(record.agent);
      record.mixer.stopAllAction();
      const obj = record.entity.object3D;
      if (obj?.parent) {
        obj.parent.remove(obj);
      }
      record.entity.destroy();
    }
    this.residentRecords.clear();
    this.yukaEntityManager.clear();
    console.log("[ResidentAvatar] System destroyed");
  }
}
