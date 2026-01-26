import {
  createSystem,
  Entity,
  Object3D,
  AssetManager,
  AnimationMixer,
  AnimationClip,
  AnimationAction,
  LoopRepeat,
} from "@iwsdk/core";

import { SkeletonUtils } from "three-stdlib";

import { ResidentAvatarComponent } from "../components/ResidentAvatarComponent";

interface ResidentAvatarRecord {
  entity: Entity;
  model: Object3D;
  rootBone?: Object3D;
  mixer: AnimationMixer;
  animations: Map<string, AnimationAction>;
  availableAnimations: string[];
}

const ANIMATION_DURATIONS = {
  Idle: 8,
  Waving: 4,
  Walking: 6,
};

export class ResidentAvatarSystem extends createSystem({
  residents: {
    required: [ResidentAvatarComponent],
  },
}) {
  private residentRecords: Map<string, ResidentAvatarRecord> = new Map();

  init() {
    console.log("[ResidentAvatar] System initialized");
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
        timeSinceLastChange: 0,
      });

      const mixer = new AnimationMixer(avatarModel);
      const animations = new Map<string, AnimationAction>();
      const availableAnimations: string[] = [];

      console.log(`[ResidentAvatar] 🦴 Avatar skeleton bones (first 10):`,
        avatarModel.children.filter((c: any) => c.isBone || c.type === 'Bone')
          .slice(0, 10)
          .map((b: any) => b.name)
      );

      for (const animKey of animationKeys) {
        const animGltf = AssetManager.getGLTF(animKey);

        if (animGltf && animGltf.animations && animGltf.animations.length > 0) {
          let bestClip = animGltf.animations[0];
          if (animGltf.animations.length > 1) {
            bestClip = animGltf.animations.reduce((prev, current) =>
              (prev.duration > current.duration) ? prev : current
            );
            console.log(`[ResidentAvatar] 🎬 Selected longest animation: "${bestClip.name}" (${bestClip.duration.toFixed(2)}s) from ${animGltf.animations.length} clips`);
          }

          const clip = bestClip.clone();
          const baseName = animKey.replace(/\d+$/, '');
          clip.name = baseName;

          console.log(`[ResidentAvatar] 📊 Animation ${animKey}:`, {
            name: clip.name,
            duration: clip.duration,
            tracks: clip.tracks.length,
          });

          if (clip.tracks.length === 0) {
            console.warn(`[ResidentAvatar] ⚠️ Animation ${animKey} has NO tracks! GLB conversion failed.`);
            continue;
          }

          console.log(`[ResidentAvatar] 🎯 Original track names (first 5):`,
            clip.tracks.slice(0, 5).map(t => t.name)
          );

          clip.tracks.forEach((track) => {
            const originalName = track.name;
            track.name = track.name.replace(/^mixamorig:?/, '');

            if (originalName !== track.name && Math.random() < 0.05) {
              console.log(`[ResidentAvatar]   ${originalName} → ${track.name}`);
            }
          });

          if (baseName === "Walking") {
            clip.tracks.forEach((track) => {
              if (/(Hips|mixamorig|Root|Pelvis|Armature|Bip).*\.position$/i.test(track.name)) {
                const values = track.values;
                const times = track.times;

                for (let i = 0; i < times.length; i++) {
                  const idx = i * 3;
                  values[idx] = 0;
                  values[idx + 2] = 0;
                }
                console.log(`[ResidentAvatar] 🧹 Stripped Root Motion from ${baseName} (${track.name})`);
              }
            });

            let isLoopGlitch = false;
            const testTrack = clip.tracks.find(t => /(Hips|mixamorig|Root|Pelvis|Armature|Bip).*\.quaternion$/i.test(t.name));

            if (testTrack) {
              const values = testTrack.values;
              const first = [values[0], values[1], values[2], values[3]];
              const lastIndex = values.length - 4;
              const last = [values[lastIndex], values[lastIndex + 1], values[lastIndex + 2], values[lastIndex + 3]];

              const diff = first.map((v, i) => Math.abs(v - last[i])).reduce((a, b) => a + b, 0);
              if (diff < 0.01) {
                isLoopGlitch = true;
                console.log(`[ResidentAvatar] 🔄 Loop glitch detected in ${baseName} (diff=${diff.toFixed(5)}). Fixing...`);
              }
            }

            if (isLoopGlitch) {
              clip.tracks.forEach((track) => {
                const itemSize = track.getValueSize();
                const numKeys = track.times.length;

                if (numKeys > 1) {
                  // Create new arrays without the last keyframe
                  track.times = track.times.slice(0, numKeys - 1);
                  track.values = track.values.slice(0, (numKeys - 1) * itemSize);
                }
              });

              if (clip.tracks[0].times.length > 0) {
                const newDuration = clip.tracks[0].times[clip.tracks[0].times.length - 1];
                console.log(`[ResidentAvatar] ✂️ Smart-Trimmed Duplicate Last Frame: ${clip.duration.toFixed(3)}s -> ${newDuration.toFixed(3)}s`);
                clip.duration = newDuration;
              }
            }
          }

          console.log(`[ResidentAvatar] 🔧 Retargeted ${clip.tracks.length} tracks for ${baseName}`);

          const action = mixer.clipAction(clip);
          action.setLoop(LoopRepeat, Infinity);
          animations.set(baseName, action);
          availableAnimations.push(baseName);

          console.log(`[ResidentAvatar] ✅ Added animation: ${baseName} (from ${animKey}) - ${clip.duration.toFixed(2)}s`);
        } else {
          console.warn(`[ResidentAvatar] Animation not found or has no clips: ${animKey}`);
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
          console.log(`[ResidentAvatar] 🔒 Found root bone for locking: ${child.name}`);
        }
      });

      const record: ResidentAvatarRecord = {
        entity,
        model: avatarModel,
        rootBone,
        mixer,
        animations,
        availableAnimations,
      };
      this.residentRecords.set(avatarId, record);
      const currentAnimation = record.entity.getValue(ResidentAvatarComponent, "currentAnimation") as string;
      this.playAnimation(avatarId, currentAnimation);

      record.mixer.update(0.016);

      console.log(`[ResidentAvatar] ✅ Created resident: ${avatarName} with ${availableAnimations.length} animations`);
      return entity;
    } catch (error) {
      console.error(`[ResidentAvatar] Failed to create resident ${avatarName}:`, error);
      return null;
    }
  }

  private playAnimation(avatarId: string, animationName: string): void {
    const record = this.residentRecords.get(avatarId);
    if (!record) return;

    const newAction = record.animations.get(animationName);

    if (!newAction) {
      console.warn(`[ResidentAvatar] Animation not found: ${animationName}`);
      return;
    }
    let currentAction: any = null;
    record.animations.forEach((action) => {
      if (action.isRunning() && action !== newAction) {
        currentAction = action;
      }
    });
    if (currentAction) {
      newAction.reset();
      newAction.play();
      currentAction.crossFadeTo(newAction, 0.5, true);

      console.log(`[ResidentAvatar] 🔄 Crossfading from ${currentAction.getClip().name} to ${animationName}`);
    } else {
      newAction.reset().play();
      console.log(`[ResidentAvatar] ▶️ Starting ${animationName} (no previous animation)`);
    }

    setTimeout(() => {
      const isPlaying = newAction.isRunning();
      const weight = newAction.getEffectiveWeight();
      const time = newAction.time;
      console.log(`[ResidentAvatar] 🔍 Animation ${animationName} status:`, {
        isRunning: isPlaying,
        weight: weight.toFixed(2),
        time: time.toFixed(2),
        paused: newAction.paused
      });
    }, 100);

    record.entity.setValue(ResidentAvatarComponent, "currentAnimation", animationName);
    record.entity.setValue(ResidentAvatarComponent, "timeSinceLastChange", 0);

    console.log(`[ResidentAvatar] 🎭 Playing animation: ${animationName} for ${avatarId}`);
  }

  private getRandomAnimation(record: ResidentAvatarRecord, currentAnimation: string): string {
    const available = record.availableAnimations.filter(
      (name) => name !== currentAnimation
    );

    if (available.length === 0) {
      return currentAnimation;
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
  }

  update(dt: number): void {
    for (const [avatarId, record] of this.residentRecords) {

      record.mixer.update(dt);

      if (record.rootBone) {
        record.rootBone.position.x = 0;
        record.rootBone.position.z = 0;
      }

      const currentAnimation = record.entity.getValue(ResidentAvatarComponent, "currentAnimation") as string;
      const isMoving = record.entity.getValue(ResidentAvatarComponent, "isMoving") as boolean;
      const timeSinceLastChange = record.entity.getValue(ResidentAvatarComponent, "timeSinceLastChange") as number;

      record.entity.setValue(ResidentAvatarComponent, "timeSinceLastChange", timeSinceLastChange + dt);

      if (isMoving) {
        const targetX = record.entity.getValue(ResidentAvatarComponent, "targetX") as number;
        const targetZ = record.entity.getValue(ResidentAvatarComponent, "targetZ") as number;
        const speed = record.entity.getValue(ResidentAvatarComponent, "walkSpeed") as number;
        const currentPos = record.model.position;
        const dx = targetX - currentPos.x;
        const dz = targetZ - currentPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < 0.1) {
          record.entity.setValue(ResidentAvatarComponent, "isMoving", false);
          this.playAnimation(avatarId, "Idle");
        } else {
          const moveDist = speed * dt;
          const ratio = moveDist / distance;

          record.model.position.x += dx * ratio;
          record.model.position.z += dz * ratio;

          record.model.lookAt(targetX, currentPos.y, targetZ);
        }

      } else {
        const idleDuration = (ANIMATION_DURATIONS as any)[currentAnimation] || 5;

        if (timeSinceLastChange >= idleDuration) {
          if (Math.random() < 0.3 && record.availableAnimations.includes("Waving")) {
            this.playAnimation(avatarId, "Waving");
          } else {
            const range = 3;
            const randomX = (Math.random() - 0.5) * 2 * range;
            const randomZ = (Math.random() - 0.5) * 2 * range;

            record.entity.setValue(ResidentAvatarComponent, "isMoving", true);
            record.entity.setValue(ResidentAvatarComponent, "targetX", randomX);
            record.entity.setValue(ResidentAvatarComponent, "targetZ", randomZ);

            this.playAnimation(avatarId, "Walking");
          }
        }
      }
    }
  }

  destroy(): void {
    for (const [avatarId, record] of this.residentRecords) {
      record.mixer.stopAllAction();
      const obj = record.entity.object3D;
      if (obj?.parent) {
        obj.parent.remove(obj);
      }
      record.entity.destroy();
    }
    this.residentRecords.clear();
    console.log("[ResidentAvatar] System destroyed");
  }
}