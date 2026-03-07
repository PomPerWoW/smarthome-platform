import {
  createSystem,
  Entity,
  Object3D,
  AssetManager,
  AnimationMixer,
  AnimationAction,
  LoopOnce,
} from "@iwsdk/core";

import { Quaternion, SkinnedMesh, Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import { RobotAssistantComponent } from "../components/RobotAssistantComponent";
import { clampToWalkableArea, getRoomBounds } from "../config/navmesh";
import {
  VoiceControlSystem,
  type VoiceIdlePayload,
} from "./VoiceControlSystem";
import {
  constrainMovement,
  AVATAR_COLLISION_RADIUS,
} from "../config/collision";
import {
  speakInstruction,
  speakInstructionWaitMe,
  speakFollowUpAnythingElse,
  speakSeeYouAgain,
  speakSorryDidntCatch,
} from "../utils/VoiceTextToSpeech";

/** Delay (ms) before starting mic after TTS so we don't capture the robot's voice. */
const LISTEN_START_DELAY_MS = 700;

// ============================================================================
// CONFIG
// ============================================================================

const FADE_DURATION = 0.2;
const WALK_VELOCITY = 0.5; // Slower than user-controlled avatars
const ROTATE_SPEED = 0.15; // Rotation speed for turning
const WAYPOINT_REACH_DISTANCE = 0.5; // How close to get to waypoint before picking new one
/** When walking to user, use larger radius so robot reliably stops and speaks (avoids overshoot/oscillation). */
const REACH_USER_DISTANCE = 1.0;
const WAYPOINT_INTERVAL = 8.0; // Pick new waypoint every 8-12 seconds

const STATES = ["Idle", "Walking", "Standing"];
const EMOTES = ["Jump", "Yes", "No", "Wave", "ThumbsUp"];

// ============================================================================
// ROBOT RECORD
// ============================================================================

interface RobotAssistantRecord {
  entity: Entity;
  model: Object3D;
  mixer: AnimationMixer;
  animationsMap: Map<string, AnimationAction>;
  currentAction: string;
  headMesh: SkinnedMesh | null;
  // Movement state
  walkDirection: Vector3;
  rotateAngle: Vector3;
  rotateQuaternion: Quaternion;
}

// ============================================================================
// ROBOT ASSISTANT SYSTEM
// ============================================================================

interface VoiceEmoteSequence {
  emotes: string[];
  onDone?: () => void;
  index: number;
  record: RobotAssistantRecord;
}

export class RobotAssistantSystem extends createSystem({
  robots: {
    required: [RobotAssistantComponent],
  },
}) {
  private robotRecords: Map<string, RobotAssistantRecord> = new Map();
  private timeElapsed = 0;
  private voiceActive = false;
  private voiceEmoteSequence: VoiceEmoteSequence | null = null;

  /** Instruction session: robot has reached user and is in "do you want anything else?" loop. */
  inInstructionSession = false;
  /** Robot is walking to user; when reached, play pendingInstructionTopic and enter session. */
  walkingToUser = false;
  /** Topic to speak when robot reaches user (e.g. "panel", "fan"). */
  private pendingInstructionTopic: string | null = null;
  /** Debounce: avoid speaking "Do you want anything else?" twice when two idles arrive in quick succession. */
  private lastDeviceSuccessHandledAt = 0;
  private static readonly DEVICE_SUCCESS_DEBOUNCE_MS = 3000;
  /** Re-entrancy guard: skip second idle if we're already handling device success in session (e.g. two notifyStatus calls). */
  private handlingDeviceSuccessInSession = false;
  /** Temporary target when dodging an obstacle during walkingToUser */
  private stepAsideTarget: { x: number; z: number } | null = null;
  /** Delay re-prompt so a success idle (e.g. device action) can cancel it and we only say follow-up once. */
  private rePromptTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private static readonly RE_PROMPT_DELAY_MS = 500;
  /** When we spoke the re-prompt ("Sorry... Do you want...?"), skip saying "Do you want...?" again if success idle arrives right after. */
  private lastRepromptSpokenAt = 0;
  private static readonly SKIP_FOLLOW_UP_AFTER_REPROMPT_MS = 3000;

  init() {
    console.log(
      "[RobotAssistant] System initialized (autonomous behavior with pre-baked animations)",
    );
    const voiceSystem = VoiceControlSystem.getInstance();
    voiceSystem.registerSkipGreetingChecker(() => this.inInstructionSession);
    voiceSystem.registerInstructionSessionChecker(
      () => this.inInstructionSession,
    );
    voiceSystem.addStatusListener(
      (status: "listening" | "processing" | "idle", payload?: VoiceIdlePayload) => {
        if (status === "listening" || status === "processing") {
          // Toggle ON: robot stands until user toggles off or command succeeds
          this.setVoiceListening(true);
          return;
        }
        if (status === "idle") {
          if (payload?.success && payload.action && payload.device) {
            if (this.rePromptTimeoutId !== null) {
              clearTimeout(this.rePromptTimeoutId);
              this.rePromptTimeoutId = null;
            }
            if (this.inInstructionSession) {
              if (this.handlingDeviceSuccessInSession) return;
              const now = Date.now();
              if (
                now - this.lastDeviceSuccessHandledAt <
                RobotAssistantSystem.DEVICE_SUCCESS_DEBOUNCE_MS
              ) {
                return;
              }
              this.lastDeviceSuccessHandledAt = now;
              this.handlingDeviceSuccessInSession = true;
            }
            import("../utils/VoiceTextToSpeech").then((module) => {
              module.speakCompletion(payload.action!, payload.device!);
            });
            if (this.inInstructionSession) {
              const skipFollowUp =
                Date.now() - this.lastRepromptSpokenAt <
                RobotAssistantSystem.SKIP_FOLLOW_UP_AFTER_REPROMPT_MS;
              console.log("[RobotAssistant] device success in session", {
                skipFollowUp,
                lastRepromptSpokenAt: this.lastRepromptSpokenAt,
                msSinceReprompt: Date.now() - this.lastRepromptSpokenAt,
              });
              this.faceFirstRobotTowardUser();
              this.playEmoteSequence(["Yes", "ThumbsUp"], () => {
                const clearGuard = () => {
                  this.handlingDeviceSuccessInSession = false;
                };
                if (skipFollowUp) {
                  console.log("[RobotAssistant] 🗣️ SKIP follow-up, just restart listening");
                  setTimeout(() => {
                    clearGuard();
                    VoiceControlSystem.getInstance().startListeningWithoutGreeting();
                  }, LISTEN_START_DELAY_MS);
                } else {
                  console.log("[RobotAssistant] 🗣️ SPEAKING follow-up: 'Do you want me to do anything else?'");
                  speakFollowUpAnythingElse().then(() => {
                    console.log("[RobotAssistant] 🗣️ Follow-up DONE, starting listening");
                    setTimeout(() => {
                      clearGuard();
                      VoiceControlSystem.getInstance().startListeningWithoutGreeting();
                    }, LISTEN_START_DELAY_MS);
                  });
                }
              });
            } else {
              // Normal: face user (UX), then Yes+ThumbsUp and back to walk/idle
              this.faceFirstRobotTowardUser();
              this.playEmoteSequence(["Yes", "ThumbsUp"], () => {
                this.setVoiceListening(false);
              });
            }
            return;
          }
          if (payload?.success && payload.instructionTopic) {
            if (this.rePromptTimeoutId !== null) {
              clearTimeout(this.rePromptTimeoutId);
              this.rePromptTimeoutId = null;
            }
            const topic = payload.instructionTopic;
            if (topic === "goodbye") {
              this.walkingToUser = false;
              this.pendingInstructionTopic = null;
              this.inInstructionSession = false;
              speakSeeYouAgain();
              this.playEmoteSequence(["Wave"], () => {
                this.setVoiceListening(false);
              });
              return;
            }
            if (this.inInstructionSession) {
              // Robot already at user: speak instruction and follow-up, then keep listening
              speakInstruction(topic).then(() =>
                speakFollowUpAnythingElse().then(() => {
                  setTimeout(() => {
                    VoiceControlSystem.getInstance().startListeningWithoutGreeting();
                  }, LISTEN_START_DELAY_MS);
                }),
              );
              return;
            }
            if (this.walkingToUser) {
              this.pendingInstructionTopic = topic;
              return;
            }
            // First instruction: say "wait for me" and walk to user
            this.pendingInstructionTopic = topic;
            speakInstructionWaitMe().then(() => {
              this.startWalkingToUser();
            });
            return;
          }
          if (payload?.cancelled) {
            this.walkingToUser = false;
            this.pendingInstructionTopic = null;
            this.inInstructionSession = false;
            this.playEmoteSequence(["Wave"], () => {
              this.setVoiceListening(false);
            });
            return;
          }
          // Timeout, no match, or failure while in instruction session: delay re-prompt so a late success idle can cancel it (avoids saying "Do you want...?" twice)
          if (this.inInstructionSession) {
            if (this.rePromptTimeoutId !== null) clearTimeout(this.rePromptTimeoutId);
            this.rePromptTimeoutId = setTimeout(() => {
              this.rePromptTimeoutId = null;
              this.lastRepromptSpokenAt = Date.now();
              speakSorryDidntCatch().then(() => {
                setTimeout(() => {
                  VoiceControlSystem.getInstance().startListeningWithoutGreeting();
                }, LISTEN_START_DELAY_MS);
              });
            }, RobotAssistantSystem.RE_PROMPT_DELAY_MS);
            return;
          }
          this.setVoiceListening(false);
        }
      },
    );
  }

  /** Set first robot's rotation to face the user (camera) in room-local XZ. */
  private faceFirstRobotTowardUser(): void {
    const record = this.robotRecords.values().next().value as
      | RobotAssistantRecord
      | undefined;
    if (!record || !this.world.camera) return;
    const cam = this.world.camera as { position: { x: number; z: number } };
    const userLocal = this.worldToRoomLocal(
      cam.position.x,
      0,
      cam.position.z,
    );
    const dx = userLocal.x - record.model.position.x;
    const dz = userLocal.z - record.model.position.z;
    if (Math.abs(dx) < 1e-5 && Math.abs(dz) < 1e-5) return;
    const angle = Math.atan2(dx, dz);
    (record.model as any).rotation.y = angle;
  }

  /** Start walking to user: set target to user position, set walkingToUser, allow movement. */
  private startWalkingToUser(): void {
    const record = this.robotRecords.values().next().value as
      | RobotAssistantRecord
      | undefined;
    if (!record || !this.world.camera) return;
    const cam = this.world.camera as { position: { x: number; y: number; z: number } };
    const userLocal = this.worldToRoomLocal(
      cam.position.x,
      cam.position.y,
      cam.position.z,
    );
    record.entity.setValue(RobotAssistantComponent, "targetX", userLocal.x);
    record.entity.setValue(RobotAssistantComponent, "targetZ", userLocal.z);
    record.entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
    this.walkingToUser = true;
    this.setVoiceListening(false);
    this.fadeToAction(record, "Walking", FADE_DURATION);
    record.entity.setValue(RobotAssistantComponent, "currentState", "Walking");
  }

  async createRobotAssistant(
    robotId: string,
    robotName: string,
    modelKey: string,
    position: [number, number, number],
  ): Promise<Entity | null> {
    try {
      const gltf = AssetManager.getGLTF(modelKey);
      if (!gltf) {
        console.error(`[RobotAssistant] Model not found: ${modelKey}`);
        return null;
      }

      // Align the robot to the lab room instead of world origin
      const roomBounds = getRoomBounds();
      let finalX = position[0];
      let finalY = position[1];
      let finalZ = position[2];

      if (roomBounds) {
        const centerX = (roomBounds.minX + roomBounds.maxX) * 0.5;
        const centerZ = (roomBounds.minZ + roomBounds.maxZ) * 0.5;

        finalX = centerX + position[0];
        finalZ = centerZ + position[2];
        finalY = roomBounds.floorY + position[1];

        console.log(
          "[RobotAssistant] 📍 Spawning inside lab room at",
          { finalX, finalY, finalZ },
          "with local offset",
          position,
          "and room bounds",
          roomBounds,
        );
      } else {
        console.warn(
          "[RobotAssistant] ⚠️ Room bounds not initialized; using raw world position",
          position,
        );
      }

      const robotModel = SkeletonUtils.clone(gltf.scene) as Object3D;
      robotModel.scale.setScalar(0.2);
      robotModel.position.set(finalX, finalY, finalZ);
      robotModel.rotation.set(0, 0, 0);
      robotModel.visible = true;

      this.world.scene.add(robotModel);
      console.log(
        `[RobotAssistant] 🔍 Model added to scene, visible: ${robotModel.visible}`,
      );

      // Simple floor alignment - ensure we stay on the computed floor height
      robotModel.position.y = finalY;

      console.log(
        `[RobotAssistant] 🔍 Final position: (${robotModel.position.x.toFixed(2)}, ${robotModel.position.y.toFixed(2)}, ${robotModel.position.z.toFixed(2)})`,
      );
      console.log(`[RobotAssistant] 🔍 Scale: ${robotModel.scale.x}`);

      // Ensure mesh visibility
      robotModel.traverse((child: any) => {
        if (child.isMesh) {
          child.visible = true;
          if (child.material) {
            child.material.transparent = false;
            child.material.opacity = 1.0;
            child.material.needsUpdate = true;
          }
        }
      });

      // Find head mesh for expressions (morph targets)
      let headMesh: SkinnedMesh | null = null;
      robotModel.traverse((child) => {
        if (child.name === "Head_4" && (child as any).morphTargetDictionary) {
          headMesh = child as unknown as SkinnedMesh;
        }
      });

      if (headMesh) {
        const dict = (headMesh as any).morphTargetDictionary;
        const influences = (headMesh as any).morphTargetInfluences;
        if (dict && influences) {
          console.log(
            `[RobotAssistant] 🤖 Found head mesh with expressions:`,
            Object.keys(dict),
          );
          if (dict["angry"] !== undefined) influences[dict["angry"]] = 0.0;
          if (dict["surprised"] !== undefined)
            influences[dict["surprised"]] = 0.0;
          if (dict["sad"] !== undefined) influences[dict["sad"]] = 0.0;
        }
      }

      // Set up animations
      const clips: unknown[] = Array.isArray(gltf.animations)
        ? gltf.animations
        : [];
      const rawClipNames = clips.map((c: any) => c?.name ?? "(no name)");
      console.log(
        `[RobotAssistant] 📋 ${robotName} (${modelKey}) — animations:`,
        rawClipNames,
      );

      const mixer = new AnimationMixer(robotModel);
      const animationsMap = new Map<string, AnimationAction>();

      for (const clip of clips) {
        const c = clip as { name?: string };
        if (!c.name) continue;

        const action = mixer.clipAction(clip as any);
        if (action) {
          animationsMap.set(c.name, action);

          // Set emotes and Standing to play once then stop
          if (EMOTES.indexOf(c.name) >= 0 || STATES.indexOf(c.name) >= 2) {
            action.clampWhenFinished = true;
            action.loop = LoopOnce;
          }
        }
      }

      console.log(
        `[RobotAssistant] 🎬 ${robotName} — available animations:`,
        Array.from(animationsMap.keys()),
      );

      // Create entity
      const entity = this.world.createTransformEntity(robotModel);

      // Pick initial random waypoint within room
      const bounds = getRoomBounds();
      const targetX = bounds
        ? bounds.minX + Math.random() * (bounds.maxX - bounds.minX)
        : finalX + (Math.random() - 0.5) * 4;
      const targetZ = bounds
        ? bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
        : finalZ + (Math.random() - 0.5) * 4;

      entity.addComponent(RobotAssistantComponent, {
        robotId,
        robotName,
        baseY: finalY,
        currentState: "Walking",
        nextTransitionTime: 5.0 + Math.random() * 5.0,
        targetX,
        targetZ,
        hasReachedTarget: false,
        nextWaypointTime:
          this.timeElapsed + WAYPOINT_INTERVAL + Math.random() * 4.0,
      });

      // Start with Walking animation
      const walkingAction = animationsMap.get("Walking");
      if (walkingAction) {
        walkingAction.play();
      }

      const record: RobotAssistantRecord = {
        entity,
        model: robotModel,
        mixer,
        animationsMap,
        currentAction: "Walking",
        headMesh,
        walkDirection: new Vector3(),
        rotateAngle: new Vector3(0, 1, 0),
        rotateQuaternion: new Quaternion(),
      };
      this.robotRecords.set(robotId, record);

      console.log(
        `[RobotAssistant] ✅ Created: ${robotName} at position (${position.join(", ")})`,
      );
      return entity;
    } catch (error) {
      console.error(`[RobotAssistant] Failed to create ${robotName}:`, error);
      return null;
    }
  }

  private fadeToAction(
    record: RobotAssistantRecord,
    name: string,
    duration: number,
  ): void {
    const previousAction = record.animationsMap.get(record.currentAction);
    const activeAction = record.animationsMap.get(name);

    if (!activeAction) return;

    if (previousAction && previousAction !== activeAction) {
      previousAction.fadeOut(duration);
    }

    activeAction
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(duration)
      .play();

    record.currentAction = name;
  }

  // Turn voice-listening mode on or off
  setVoiceListening(active: boolean): void {
    if (active) {
      // Already in voice mode (e.g. "listening" then "processing") — avoid playing Standing twice
      if (this.voiceActive) return;
      this.voiceActive = true;
      for (const record of this.robotRecords.values()) {
        this.fadeToAction(record, "Standing", FADE_DURATION);
        record.entity.setValue(
          RobotAssistantComponent,
          "currentState",
          "Standing",
        );
      }
      console.log("[RobotAssistant] 🎤 Voice listening ON — Standing");
    } else {
      this.voiceActive = false;
      this.voiceEmoteSequence = null;
      for (const record of this.robotRecords.values()) {
        this.fadeToAction(record, "Walking", FADE_DURATION);
        record.entity.setValue(
          RobotAssistantComponent,
          "currentState",
          "Walking",
        );
      }
      console.log("[RobotAssistant] 🎤 Voice listening OFF — resuming walking");
    }
  }

  // Play a sequence of emotes
  // NOTE: caller's onDone is responsible for calling setVoiceListening(false)
  // when appropriate (instruction-session callers restart listening instead).
  playEmoteSequence(emotes: string[], onDone?: () => void): void {
    if (emotes.length === 0) {
      onDone?.();
      return;
    }
    const firstRecord = this.robotRecords.values().next().value as
      | RobotAssistantRecord
      | undefined;
    if (!firstRecord) {
      onDone?.();
      return;
    }
    this.voiceActive = true;
    this.voiceEmoteSequence = {
      emotes,
      onDone,
      index: 0,
      record: firstRecord,
    };
    const seq = this.voiceEmoteSequence;
    const playNext = () => {
      const emoteName = seq.emotes[seq.index];
      if (!firstRecord.animationsMap.has(emoteName)) {
        console.warn(
          `[RobotAssistant] Emote "${emoteName}" not found, skipping sequence`,
        );
        this.voiceEmoteSequence = null;
        seq.onDone?.();
        return;
      }
      this.fadeToAction(firstRecord, emoteName, FADE_DURATION);
      firstRecord.entity.setValue(
        RobotAssistantComponent,
        "currentState",
        emoteName,
      );
      const onFinished = () => {
        firstRecord.mixer.removeEventListener("finished", onFinished);
        seq.index++;
        if (seq.index < seq.emotes.length) {
          playNext();
          // playNext() creates and registers its own new listener — do NOT re-add this one
        } else {
          this.voiceEmoteSequence = null;
          seq.onDone?.();
        }
      };
      firstRecord.mixer.addEventListener("finished", onFinished);
    };
    playNext();
  }

  // ── Helper: convert room-local position to world position ──
  private roomLocalToWorld(
    lx: number, ly: number, lz: number,
  ): { x: number; y: number; z: number } {
    const roomModel = (globalThis as any).__labRoomModel;
    if (!roomModel) return { x: lx, y: ly, z: lz };
    const rotY = roomModel.rotation.y;
    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    return {
      x: roomModel.position.x + lx * cosR - lz * sinR,
      y: roomModel.position.y + ly,
      z: roomModel.position.z + lx * sinR + lz * cosR,
    };
  }

  // ── Helper: convert world position to room-local position ──
  private worldToRoomLocal(
    wx: number, wy: number, wz: number,
  ): { x: number; y: number; z: number } {
    const roomModel = (globalThis as any).__labRoomModel;
    if (!roomModel) return { x: wx, y: wy, z: wz };
    const rotY = roomModel.rotation.y;
    const cosR = Math.cos(-rotY);
    const sinR = Math.sin(-rotY);
    const dx = wx - roomModel.position.x;
    const dz = wz - roomModel.position.z;
    return {
      x: dx * cosR - dz * sinR,
      y: wy - roomModel.position.y,
      z: dx * sinR + dz * cosR,
    };
  }

  update(dt: number): void {
    this.timeElapsed += dt;

    for (const [robotId, record] of this.robotRecords) {
      // Always update mixer
      record.mixer.update(dt);

      // ── START OF FRAME: Convert world position → room-local ──
      // Movement code (waypoints, clamping, collision) all work in
      // room-local coords that match roomBounds. After movement,
      // we convert back to world at end-of-frame.
      const roomLocal = this.worldToRoomLocal(
        record.model.position.x,
        record.model.position.y,
        record.model.position.z,
      );
      record.model.position.set(roomLocal.x, roomLocal.y, roomLocal.z);
      // Also undo room rotation from the model's visual rotation
      const roomModel = (globalThis as any).__labRoomModel;
      const roomRotY = roomModel ? roomModel.rotation.y : 0;

      // Voice-driven mode: stay Standing (or let emote sequence run), skip movement and random transitions
      if (this.voiceActive) {
        // Only force Standing when still Walking/Idle — never re-apply Standing when already Standing
        // or when about to play Wave/Yes/ThumbsUp (avoids extra Standing before scenario animations)
        const needStanding =
          !this.voiceEmoteSequence &&
          (record.currentAction === "Walking" || record.currentAction === "Idle");
        if (needStanding) {
          this.fadeToAction(record, "Standing", FADE_DURATION);
          record.entity.setValue(
            RobotAssistantComponent,
            "currentState",
            "Standing",
          );
        }
        // Still update head expressions below, then skip the rest
        if (record.headMesh) {
          const dict = (record.headMesh as any).morphTargetDictionary;
          const influences = (record.headMesh as any).morphTargetInfluences;
          if (dict && influences) {
            if (dict["angry"] !== undefined) influences[dict["angry"]] = 0.0;
            if (dict["surprised"] !== undefined)
              influences[dict["surprised"]] = 0.0;
            if (dict["sad"] !== undefined) influences[dict["sad"]] = 0.0;
          }
        }
        // Must still apply room transform before continuing
        const voiceWorldPos = this.roomLocalToWorld(
          record.model.position.x,
          record.model.position.y,
          record.model.position.z,
        );
        record.model.position.set(voiceWorldPos.x, voiceWorldPos.y, voiceWorldPos.z);
        record.model.rotation.y += roomRotY;
        continue;
      }

      const entity = record.entity;
      const currentState = entity.getValue(
        RobotAssistantComponent,
        "currentState",
      ) as string;
      const targetX = entity.getValue(
        RobotAssistantComponent,
        "targetX",
      ) as number;
      const targetZ = entity.getValue(
        RobotAssistantComponent,
        "targetZ",
      ) as number;
      const hasReachedTarget = entity.getValue(
        RobotAssistantComponent,
        "hasReachedTarget",
      ) as boolean;
      const nextWaypointTime = entity.getValue(
        RobotAssistantComponent,
        "nextWaypointTime",
      ) as number;
      let collisionCooldown = entity.getValue(
        RobotAssistantComponent,
        "collisionCooldown",
      ) as number;

      if (collisionCooldown > 0) {
        collisionCooldown = Math.max(0, collisionCooldown - dt);
        entity.setValue(
          RobotAssistantComponent,
          "collisionCooldown",
          collisionCooldown,
        );
      }

      // Explicit "reached user" / "reached step-aside" check
      if (this.walkingToUser && this.pendingInstructionTopic) {
        if (this.stepAsideTarget) {
          // If we are currently stepping aside to avoid an obstacle
          const dxAside = targetX - record.model.position.x;
          const dzAside = targetZ - record.model.position.z;
          const distToAside = Math.sqrt(dxAside * dxAside + dzAside * dzAside);
          if (distToAside <= WAYPOINT_REACH_DISTANCE) {
            console.log(`[RobotAssistant] ↩️ Reached step-aside waypoint, resuming walk to user`);
            this.stepAsideTarget = null;
            this.startWalkingToUser(); // This updates the targetX/Z back to the user's location
            continue;
          }
        } else {
          // Normal walk to user check
          const dxUser = targetX - record.model.position.x;
          const dzUser = targetZ - record.model.position.z;
          const distToUser = Math.sqrt(dxUser * dxUser + dzUser * dzUser);
          if (distToUser <= REACH_USER_DISTANCE) {
            const topic = this.pendingInstructionTopic;
            this.walkingToUser = false;
            this.pendingInstructionTopic = null;
            this.inInstructionSession = true;
            this.setVoiceListening(true);
            this.fadeToAction(record, "Standing", FADE_DURATION);
            record.entity.setValue(
              RobotAssistantComponent,
              "currentState",
              "Standing",
            );
            record.entity.setValue(RobotAssistantComponent, "hasReachedTarget", true);
            console.log(
              `[RobotAssistant] 👋 Reached user (dist=${distToUser.toFixed(2)}m), speaking instruction: ${topic}`,
            );
            speakInstruction(topic).then(() =>
              speakFollowUpAnythingElse().then(() => {
                setTimeout(() => {
                  VoiceControlSystem.getInstance().startListeningWithoutGreeting();
                }, LISTEN_START_DELAY_MS);
              }),
            );
            // Apply room transform and skip rest of movement for this frame
            const worldPos = this.roomLocalToWorld(
              record.model.position.x,
              record.model.position.y,
              record.model.position.z,
            );
            record.model.position.set(worldPos.x, worldPos.y, worldPos.z);
            record.model.rotation.y += roomRotY;
            continue;
          }
        }
      }

      // Calculate movement intention
      let shouldMove = false;
      let distanceToTarget = 0;
      let dx = 0;
      let dz = 0;
      const reachDist = (this.walkingToUser && !this.stepAsideTarget) || this.inInstructionSession
        ? REACH_USER_DISTANCE
        : WAYPOINT_REACH_DISTANCE;

      if (currentState === "Walking" || currentState === "Idle") {
        dx = targetX - record.model.position.x;
        dz = targetZ - record.model.position.z;
        distanceToTarget = Math.sqrt(dx * dx + dz * dz);
        shouldMove = distanceToTarget > reachDist;
      }

      // Auto-switch animation BEFORE movement to prevent sliding
      // Only switch if not playing emotes or special animations
      const isEmote = EMOTES.includes(currentState);
      const isSpecialState = ["Dance", "Death", "Sitting", "Standing"].includes(
        currentState,
      );

      if (!isEmote && !isSpecialState) {
        if (shouldMove && currentState === "Idle") {
          // About to start moving - switch to Walking FIRST
          this.fadeToAction(record, "Walking", FADE_DURATION);
          entity.setValue(RobotAssistantComponent, "currentState", "Walking");
          console.log(
            `[RobotAssistant] 🚶 Auto-switched to Walking (about to move)`,
          );
        } else if (!shouldMove && currentState === "Walking") {
          // Not moving - switch to Idle
          this.fadeToAction(record, "Idle", FADE_DURATION);
          entity.setValue(RobotAssistantComponent, "currentState", "Idle");
          console.log(`[RobotAssistant] 🧍 Auto-switched to Idle (stopped)`);
        }
      }

      // Perform movement (only when moving toward waypoint or user)
      if (shouldMove) {
        const currentDistanceToTarget = Math.sqrt(dx * dx + dz * dz);
        if (currentDistanceToTarget > reachDist) {
          record.walkDirection.set(
            dx / currentDistanceToTarget,
            0,
            dz / currentDistanceToTarget,
          );
          const targetAngle = Math.atan2(dx, dz);
          record.rotateQuaternion.setFromAxisAngle(
            record.rotateAngle,
            targetAngle,
          );
          (record.model as any).quaternion.rotateTowards(
            record.rotateQuaternion,
            ROTATE_SPEED,
          );

          // Move forward (only if in Walking state)
          if (
            entity.getValue(RobotAssistantComponent, "currentState") ===
            "Walking"
          ) {
            const moveX = record.walkDirection.x * WALK_VELOCITY * dt;
            const moveZ = record.walkDirection.z * WALK_VELOCITY * dt;

            const oldX = record.model.position.x;
            const oldZ = record.model.position.z;
            const nextX = oldX + moveX;
            const nextZ = oldZ + moveZ;

            // Collision check against lab model meshes
            const constrained = constrainMovement(
              oldX,
              oldZ,
              nextX,
              nextZ,
              record.model.position.y,
              AVATAR_COLLISION_RADIUS,
            );

            // LOG PHYSICS FRAME: Enable this for deep debugging if needed
            // console.log(`[Robot] Pos:(${oldX.toFixed(2)},${oldZ.toFixed(2)}) -> Target:(${targetX.toFixed(2)},${targetZ.toFixed(2)}), Dist:${distanceToTarget.toFixed(2)}m (Reach:${reachDist}m) | StepAside:${!!this.stepAsideTarget}`);

            // 💥 IMMEDIATE COLLISION RESPONSE
            // For autonomous walking: pick a random new path immediately.
            // For walkingToUser: trigger a temporary "step aside" maneuver to avoid getting stuck on the obstacle.
            if (
              collisionCooldown <= 0 &&
              (Math.abs(constrained.x - nextX) > 0.001 ||
                Math.abs(constrained.z - nextZ) > 0.001)
            ) {
              if (this.walkingToUser) {
                // If we've hit something while already stepping aside, or it's a new hit
                console.log(`[RobotAssistant] 💥 Hit obstacle while walking to user - recalculating path. From (${oldX.toFixed(2)}, ${oldZ.toFixed(2)}) TargetUser (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
                this.triggerStepAside(record, entity, oldX, oldZ, dx, dz);
              } else {
                console.log(
                  `[RobotAssistant] 💥 Hit wall at (${constrained.x.toFixed(2)}, ${constrained.z.toFixed(2)}) - turning immediately. From (${oldX.toFixed(2)}, ${oldZ.toFixed(2)}) towards Target (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`,
                );
                this.triggerRandomRepath(record, entity);
              }
            }

            // Log removed because logic moved into triggerRandomRepath

            record.model.position.x = isNaN(constrained.x) ? oldX : constrained.x;
            record.model.position.z = isNaN(constrained.z) ? oldZ : constrained.z;

            // Clamp to walkable area
            const [clampedX, clampedZ] = clampToWalkableArea(
              record.model.position.x,
              record.model.position.z,
            );
            record.model.position.x = isNaN(clampedX) ? record.model.position.x : clampedX;
            record.model.position.z = isNaN(clampedZ) ? record.model.position.z : clampedZ;
          }

          entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
        }
      } else if (!hasReachedTarget) {
        // Reached waypoint - stop moving
        entity.setValue(RobotAssistantComponent, "hasReachedTarget", true);
        console.log(
          `[RobotAssistant] 📍 Reached waypoint (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`,
        );
      }

      // Pick new waypoint periodically (not when walking to user or in instruction session)
      if (
        !this.walkingToUser &&
        !this.inInstructionSession &&
        this.timeElapsed >= nextWaypointTime
      ) {
        const bounds = getRoomBounds();
        const newTargetX = bounds
          ? bounds.minX + Math.random() * (bounds.maxX - bounds.minX)
          : record.model.position.x + (Math.random() - 0.5) * 4;
        const newTargetZ = bounds
          ? bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
          : record.model.position.z + (Math.random() - 0.5) * 4;

        entity.setValue(RobotAssistantComponent, "targetX", newTargetX);
        entity.setValue(RobotAssistantComponent, "targetZ", newTargetZ);
        entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
        entity.setValue(
          RobotAssistantComponent,
          "nextWaypointTime",
          this.timeElapsed + WAYPOINT_INTERVAL + Math.random() * 4.0,
        );
        console.log(
          `[RobotAssistant] 🎯 New waypoint: (${newTargetX.toFixed(2)}, ${newTargetZ.toFixed(2)})`,
        );
      }

      // ── Stuck Detection & Collision Response ────────────────────────
      // If we are in "Walking" state:
      // 1. Check if we hit a wall (constrained movement differs from intended)
      // 2. Check if we are physically stuck (position not changing)
      if (currentState === "Walking") {
        const currentX = record.model.position.x;
        const currentZ = record.model.position.z;
        const lastX = entity.getValue(
          RobotAssistantComponent,
          "lastX",
        ) as number;
        const lastZ = entity.getValue(
          RobotAssistantComponent,
          "lastZ",
        ) as number;
        let stuckTime = entity.getValue(
          RobotAssistantComponent,
          "stuckTime",
        ) as number;

        // collisionCooldown is updated at top of loop

        // 1. Immediate Collision Check (Wall Hit)
        // If constrained position differs significantly from intended next position, we hit something.
        // We check this *after* movement calculation in the loop below, but we need the flag here.
        // Actually, let's do this check *inside* the movement block where we have `constrained` result.

        // 2. Stuck Check (No Progress)
        const distMoved = Math.sqrt(
          (currentX - lastX) ** 2 + (currentZ - lastZ) ** 2,
        );
        if (distMoved < 0.005) {
          stuckTime += dt;
        } else {
          stuckTime = Math.max(0, stuckTime - dt * 2);
        }

        // Trigger repathing if stuck OR if collision detected (set via local flag below)
        let triggerRepath = false;

        if (stuckTime > 1.0) {
          // Reduced from 2.0s for faster response
          console.log(
            `[RobotAssistant] ⚠️ Stuck detected (${stuckTime.toFixed(1)}s) at (${currentX.toFixed(2)}, ${currentZ.toFixed(2)}) - picking new path. walkingToUser=${this.walkingToUser}, stepAsideTarget=${!!this.stepAsideTarget}`,
          );
          triggerRepath = true;
        }

        entity.setValue(RobotAssistantComponent, "stuckTime", stuckTime);
        entity.setValue(RobotAssistantComponent, "lastX", currentX);
        entity.setValue(RobotAssistantComponent, "lastZ", currentZ);
        entity.setValue(
          RobotAssistantComponent,
          "collisionCooldown",
          collisionCooldown,
        );

        if (triggerRepath) {
          if (this.walkingToUser) {
            console.log(`[RobotAssistant] ⚠️ Stuck while walking to user - forcing new step aside. Current Target: (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
            this.triggerStepAside(record, entity, currentX, currentZ, dx, dz);
          } else {
            this.triggerRandomRepath(record, entity);
          }
        }
      } else {
        entity.setValue(RobotAssistantComponent, "stuckTime", 0);
      }
      // ────────────────────────────────────────────────────────────────

      // No random state transition: robot only switches Idle ↔ Walking based on
      // waypoints (Idle when stopped at waypoint, Walking when moving to next).

      // Ensure expressions stay at 0.0
      if (record.headMesh) {
        const dict = (record.headMesh as any).morphTargetDictionary;
        const influences = (record.headMesh as any).morphTargetInfluences;
        if (dict && influences) {
          if (dict["angry"] !== undefined) influences[dict["angry"]] = 0.0;
          if (dict["surprised"] !== undefined)
            influences[dict["surprised"]] = 0.0;
          if (dict["sad"] !== undefined) influences[dict["sad"]] = 0.0;
        }
      }

      // ── END OF FRAME: Convert room-local position → world ──
      // Apply the room model's transform so the robot renders at
      // the correct world position relative to the aligned room.
      const worldPos = this.roomLocalToWorld(
        record.model.position.x,
        record.model.position.y,
        record.model.position.z,
      );
      record.model.position.set(worldPos.x, worldPos.y, worldPos.z);
      // Add room rotation to the robot's facing direction
      record.model.rotation.y += roomRotY;
    }
  }

  destroy(): void {
    for (const [, record] of this.robotRecords) {
      record.mixer.stopAllAction();
      const obj = record.entity.object3D;
      if (obj?.parent) obj.parent.remove(obj);
      record.entity.destroy();
    }
    this.robotRecords.clear();
    console.log("[RobotAssistant] System destroyed");
  }

  // ── Helper: Move collision repathing logic out of update loop ──
  private triggerRandomRepath(record: RobotAssistantRecord, entity: Entity) {
    const bounds = getRoomBounds();
    const newTargetX = bounds
      ? bounds.minX + Math.random() * (bounds.maxX - bounds.minX)
      : record.model.position.x + (Math.random() - 0.5) * 4;
    const newTargetZ = bounds
      ? bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
      : record.model.position.z + (Math.random() - 0.5) * 4;

    entity.setValue(RobotAssistantComponent, "targetX", newTargetX);
    entity.setValue(RobotAssistantComponent, "targetZ", newTargetZ);
    entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
    entity.setValue(RobotAssistantComponent, "collisionCooldown", 1.5);
    entity.setValue(RobotAssistantComponent, "stuckTime", 0);
  }

  // ── Helper: Step aside maneuver to bypass obstacles while walking to user ──
  private triggerStepAside(
    record: RobotAssistantRecord,
    entity: Entity,
    currentX: number,
    currentZ: number,
    dxUser: number,
    dzUser: number
  ) {
    // Normalize direction to user
    const dist = Math.sqrt(dxUser * dxUser + dzUser * dzUser);
    const dirX = dist > 0 ? dxUser / dist : 1;
    const dirZ = dist > 0 ? dzUser / dist : 0;

    // Pick a perpendicular-ish vector (rotate 70-110 degrees left or right)
    // Adding some randomness helps get out of "perfectly blocked" corners.
    const sign = Math.random() < 0.5 ? 1 : -1;
    const randomAngle = (Math.PI / 2) + (Math.random() - 0.5) * 0.5; // 90 deg +/- 15 deg
    const cosA = Math.cos(randomAngle * sign);
    const sinA = Math.sin(randomAngle * sign);

    const perpX = dirX * cosA - dirZ * sinA;
    const perpZ = dirX * sinA + dirZ * cosA;

    // Create a waypoint 1.8m to the side. 
    let escapeDist = 1.8;
    let newTargetX = currentX + perpX * escapeDist;
    let newTargetZ = currentZ + perpZ * escapeDist;

    // Clamp to walkable area
    let [clampedX, clampedZ] = clampToWalkableArea(newTargetX, newTargetZ);

    // If the clamped target is very close to where we are, try the other side
    const distToTarget = Math.sqrt((clampedX - currentX) ** 2 + (clampedZ - currentZ) ** 2);
    if (distToTarget < 0.5) {
      const altCosA = Math.cos(-randomAngle * sign);
      const altSinA = Math.sin(-randomAngle * sign);
      const altPerpX = dirX * altCosA - dirZ * altSinA;
      const altPerpZ = dirX * altSinA + dirZ * altCosA;

      newTargetX = currentX + altPerpX * escapeDist;
      newTargetZ = currentZ + altPerpZ * escapeDist;
      [clampedX, clampedZ] = clampToWalkableArea(newTargetX, newTargetZ);
    }

    this.stepAsideTarget = { x: clampedX, z: clampedZ };

    if (!isNaN(clampedX) && !isNaN(clampedZ)) {
      entity.setValue(RobotAssistantComponent, "targetX", clampedX);
      entity.setValue(RobotAssistantComponent, "targetZ", clampedZ);
    }
    entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
    entity.setValue(RobotAssistantComponent, "collisionCooldown", 1.0); // Shorter CD for faster recovery
    entity.setValue(RobotAssistantComponent, "stuckTime", 0);

    console.log(`[RobotAssistant] 🔀 Step aside target: (${clampedX.toFixed(2)}, ${clampedZ.toFixed(2)}) [PerpX: ${perpX.toFixed(2)}, PerpZ: ${perpZ.toFixed(2)}, DistToTarget: ${distToTarget.toFixed(2)}m]`);
  }
}
