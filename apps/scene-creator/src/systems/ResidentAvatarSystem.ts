import {
  createSystem,
  Entity,
  Object3D,
  AssetManager,
  AnimationMixer,
  AnimationAction,
  LoopRepeat,
  LoopOnce,
} from "@iwsdk/core";

import { SkeletonUtils } from "three-stdlib";
import { Quaternion, MathUtils, SkinnedMesh } from "three";
import {
  EntityManager as YukaEntityManager,
  Vehicle,
  WanderBehavior,
} from "yuka";
import { Lipsync, VISEMES } from "wawa-lipsync";

import { ResidentAvatarComponent } from "../components/ResidentAvatarComponent";
import { clampToWalkableArea, getRoomBounds } from "../config/navmesh";

const ANIMATION_DURATIONS: Record<string, number> = {
  Idle: 12,
  Waving: 4,
  Walking: 8,
  LeftTurn: 1.5,
  RightTurn: 1.5,
  StandToSit: 2,
  SitToStand: 2,
};

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
  isTurning: boolean;
  turnStartRotation: number;
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
    console.log("[ResidentAvatar] Yuka-powered system initialized (wander + pause mode + lip sync)");
    
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
      console.log(`[ResidentAvatar] Creating Yuka-powered resident: ${avatarName}`);

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
              if (
                /(Hips|mixamorig|Root|Pelvis|Armature|Bip).*\.position$/i.test(track.name)
              ) {
                const values = track.values;
                for (let i = 0; i < values.length / 3; i++) {
                  const idx = i * 3;
                  values[idx] = 0;     // x
                  values[idx + 2] = 0; // z
                }
              }
            });
          }

          const action = mixer.clipAction(clip);
          
          if (baseName === "LeftTurn" || baseName === "RightTurn" || 
              baseName === "StandToSit" || baseName === "SitToStand") {
            action.setLoop(LoopOnce, 1);
            action.clampWhenFinished = true;
          } else {
            action.setLoop(LoopRepeat, Infinity);
          }
          
          animations.set(baseName, action);
          availableAnimations.push(baseName);

          console.log(`[ResidentAvatar] ✅ Loaded animation: ${baseName} (${clip.duration.toFixed(2)}s)`);
        }
      }

      if (availableAnimations.length === 0) {
        console.error(`[ResidentAvatar] No animations available for ${avatarName}`);
        return null;
      }

      let rootBone: Object3D | undefined;
      avatarModel.traverse((child) => {
        if (
          !rootBone &&
          /(Hips|mixamorigHips|Root|Pelvis|Armature|Bip)/i.test(child.name)
        ) {
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
            console.log(`[ResidentAvatar] 🎤 Found lip sync mesh: ${mesh.name}`);
          }
        }
      });

      if (morphTargetMeshes.length === 0) {
        console.warn(`[ResidentAvatar] No lip sync blendshapes found for ${avatarName}. Lip sync will not work.`);
      } else {
        console.log(`[ResidentAvatar] Found ${morphTargetMeshes.length} mesh(es) with lip sync blendshapes`);
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
        const [px, pz] = clampToWalkableArea(yukaEntity.position.x, yukaEntity.position.z);

        if (px !== yukaEntity.position.x || pz !== yukaEntity.position.z) {
          yukaEntity.position.x = px;
          yukaEntity.position.z = pz;
          yukaEntity.velocity.set(0, 0, 0);
        }

        renderComponent.position.set(px, yukaEntity.position.y, pz);

        if (yukaEntity.updateOrientation) {
          const r = yukaEntity.rotation;
          renderComponent.quaternion.set(r.x, r.y, r.z, r.w);
        }
      });

      this.yukaEntityManager.add(agent);

      const wanderPauseTimer = 5 + Math.random() * 5;
      const wanderPauseDuration = 8 + Math.random() * 7;

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
        isTurning: false,
        turnStartRotation: 0,
        morphTargetMeshes,
        isSpeaking: false,
      };
      this.residentRecords.set(avatarId, record);

      this.playAnimation(avatarId, "Idle");
      record.mixer.update(0.016);

      console.log(`[ResidentAvatar] ✅ Created Yuka-powered resident: ${avatarName}`);
      console.log(`[ResidentAvatar]    Animations: ${availableAnimations.join(", ")}`);
      
      const bounds = getRoomBounds();
      if (bounds) {
        console.log(`[ResidentAvatar]    Wander area: X[${bounds.minX.toFixed(2)}, ${bounds.maxX.toFixed(2)}] Z[${bounds.minZ.toFixed(2)}, ${bounds.maxZ.toFixed(2)}]`);
      } else {
        console.log(`[ResidentAvatar]    Wander range: [-${DEFAULT_MOVEMENT_RANGE}, ${DEFAULT_MOVEMENT_RANGE}] (NavMesh not initialized)`);
      }

      return entity;
    } catch (error) {
      console.error(`[ResidentAvatar] Failed to create resident ${avatarName}:`, error);
      return null;
    }
  }

  playAnimation(avatarId: string, animationName: string): void {
    const record = this.residentRecords.get(avatarId);
    if (!record) return;

    const newAction = record.animations.get(animationName);
    if (!newAction) {
      console.warn(`[ResidentAvatar] Animation not found: ${animationName}`);
      return;
    }

    let currentAction: AnimationAction | null = null;
    record.animations.forEach((action) => {
      if (action.isRunning() && action !== newAction) {
        currentAction = action;
      }
    });

    if (currentAction) {
      newAction.reset();
      newAction.play();
      (currentAction as AnimationAction).crossFadeTo(newAction, 0.3, true);
    } else {
      newAction.reset().play();
    }

    record.entity.setValue(ResidentAvatarComponent, "currentAnimation", animationName);
    console.log(`[ResidentAvatar] 🎭 ${avatarId} → ${animationName}`);
  }

  private getRandomIdleAnimation(record: ResidentAvatarRecord): string {
    const idleOptions: string[] = ["Idle"];
    
    if (record.availableAnimations.includes("Waving")) {
      idleOptions.push("Waving");
    }
    if (record.availableAnimations.includes("LeftTurn")) {
      idleOptions.push("LeftTurn");
    }
    if (record.availableAnimations.includes("RightTurn")) {
      idleOptions.push("RightTurn");
    }

    const weights = idleOptions.map(anim => anim === "Idle" ? 3 : 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < idleOptions.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return idleOptions[i];
      }
    }
    
    return "Idle";
  }

  speak(avatarId: string, audioUrl: string): void {
    const record = this.residentRecords.get(avatarId);
    if (!record) {
      console.warn(`[ResidentAvatar] Cannot speak: Avatar ${avatarId} not found`);
      return;
    }

    if (record.morphTargetMeshes.length === 0) {
      console.warn(`[ResidentAvatar] Cannot speak: Avatar ${avatarId} has no lip sync blendshapes`);
      return;
    }

    if (this.currentSpeakingAvatarId) {
      this.stopSpeaking();
    }

    console.log(`[ResidentAvatar] ${avatarId} starting to speak: ${audioUrl}`);

    this.audioElement.src = audioUrl;
    this.lipsyncManager.connectAudio(this.audioElement);
    this.currentSpeakingAvatarId = avatarId;

    record.isSpeaking = true;
    record.entity.setValue(ResidentAvatarComponent, "isSpeaking", true);
    record.wanderBehavior.active = false;
    record.agent.velocity.set(0, 0, 0);
    record.isWanderPaused = true;

    const currentAnimation = record.entity.getValue(
      ResidentAvatarComponent,
      "currentAnimation"
    ) as string;

    if (currentAnimation === "Walking") {
      this.playAnimation(avatarId, "Idle");
    }
    this.audioElement.play().catch((error) => {
      console.error(`[ResidentAvatar] Failed to play audio: ${error}`);
      this.onSpeechEnded();
    });
  }

  stopSpeaking(): void {
    if (!this.currentSpeakingAvatarId) return;

    const record = this.residentRecords.get(this.currentSpeakingAvatarId);
    if (record) {
      record.isSpeaking = false;
      record.entity.setValue(ResidentAvatarComponent, "isSpeaking", false);
      
      this.resetAllVisemes(record);
    }

    this.audioElement.pause();
    this.audioElement.currentTime = 0;
    
    this.currentSpeakingAvatarId = null;
    console.log(`[ResidentAvatar] Speech stopped`);
  }

  private onSpeechEnded(): void {
    if (!this.currentSpeakingAvatarId) return;

    const avatarId = this.currentSpeakingAvatarId;
    const record = this.residentRecords.get(avatarId);
    
    console.log(`[ResidentAvatar] 🔇 ${avatarId} finished speaking`);

    if (record) {
      record.isSpeaking = false;
      record.entity.setValue(ResidentAvatarComponent, "isSpeaking", false);
      
      this.resetAllVisemes(record);

      record.wanderPauseTimer = 2;
    }

    this.currentSpeakingAvatarId = null;
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

  getTestAudioFiles(): string[] {
    return [
      "/audio/script/test1.mp3",
      "/audio/script/test2.mp3",
      "/audio/script/hello.mp3",
    ];
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

      if (record.isSpeaking) {
        continue;
      }

      const currentAnimation = record.entity.getValue(
        ResidentAvatarComponent,
        "currentAnimation"
      ) as string;

      const isTurning = currentAnimation === "LeftTurn" || currentAnimation === "RightTurn";
      
      if (isTurning && !record.isTurning) {
        record.isTurning = true;
        record.turnStartRotation = record.model.rotation.y;
        record.agent.updateOrientation = false;
        record.agent.velocity.set(0, 0, 0);
        record.wanderBehavior.active = false;
        console.log(`[ResidentAvatar] 🔄 ${avatarId} turning - Yuka orientation disabled`);
      }

      if (record.isTurning) {
        const turnAction = record.animations.get(currentAnimation);
        if (turnAction && !turnAction.isRunning()) {
          record.isTurning = false;
          
          const modelQuat = record.model.quaternion;
          record.agent.rotation.set(modelQuat.x, modelQuat.y, modelQuat.z, modelQuat.w);
          
          record.agent.updateOrientation = true;
          
          console.log(`[ResidentAvatar] ${avatarId} turn complete - Yuka orientation re-enabled`);
          
          this.playAnimation(avatarId, "Idle");
        }
        continue;
      }

      record.wanderPauseTimer -= dt;

      if (!record.isWanderPaused && record.wanderPauseTimer <= 0) {
        record.isWanderPaused = true;
        record.wanderBehavior.active = false;
        record.agent.velocity.set(0, 0, 0);
        record.wanderPauseTimer = record.wanderPauseDuration;

        const idleAnim = this.getRandomIdleAnimation(record);
        this.playAnimation(avatarId, idleAnim);
        
        console.log(`[ResidentAvatar] ${avatarId} paused wandering for ${record.wanderPauseDuration.toFixed(1)}s`);
      } else if (record.isWanderPaused && record.wanderPauseTimer <= 0) {
        record.isWanderPaused = false;
        record.wanderBehavior.active = true;
        record.wanderPauseTimer = 5 + Math.random() * 5;
        record.wanderPauseDuration = 8 + Math.random() * 7;
        
        this.playAnimation(avatarId, "Walking");
        
        console.log(`[ResidentAvatar] ▶️ ${avatarId} resumed wandering`);
      }

      if (!record.isWanderPaused) {
        const yukaSpeed = record.agent.getSpeed();
        const isMoving = yukaSpeed > 0.05;

        if (isMoving && currentAnimation !== "Walking") {
          this.playAnimation(avatarId, "Walking");
        } else if (!isMoving && currentAnimation === "Walking") {
          this.playAnimation(avatarId, "Idle");
        }
      }
    }
  }

  destroy(): void {
    this.stopSpeaking();
    
    this.audioElement.pause();
    this.audioElement.src = "";
    
    for (const [avatarId, record] of this.residentRecords) {
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
    console.log("[ResidentAvatar] Yuka-powered system destroyed");
  }
}
