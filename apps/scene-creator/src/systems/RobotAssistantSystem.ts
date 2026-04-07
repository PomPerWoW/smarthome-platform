import {
  createSystem,
  Entity,
  Object3D,
  AssetManager,
  AnimationMixer,
  AnimationAction,
  LoopOnce,
} from "@iwsdk/core";

import { Box3, Quaternion, Raycaster, SkinnedMesh, Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import { RobotAssistantComponent } from "../components/RobotAssistantComponent";
import { getRobotInitialSpawnWorldPosition } from "../config/robotSpawn";
import {
  clampToWalkableArea,
  getRoomBounds,
  isPositionWalkable,
} from "../config/navmesh";
import {
  constrainMovement,
  isInTableKeepOutZone,
  ROBOT_RADIUS,
  ROBOT_HEIGHTS,
} from "../config/collision";
import {
  VoiceControlSystem,
  type VoiceIdlePayload,
} from "./VoiceControlSystem";
import {
  speakInstruction,
  speakInstructionWaitMe,
  speakSeeYouAgain,
  speakText,
} from "../utils/VoiceTextToSpeech";
import { getStore } from "../store/DeviceStore";
import { BackendApiClient } from "../api/BackendApiClient";
import type { AvatarBehaviorAction } from "../scripting/avatarBehaviorScript";

// ============================================================================
// CONFIG
// ============================================================================

const FADE_DURATION = 0.2;
const WALK_VELOCITY = 0.5; // Slower than user-controlled avatars
const ROTATE_SPEED = 0.15; // Rotation speed for turning
const WAYPOINT_REACH_DISTANCE = 0.5; // How close to get to waypoint before picking new one
/** Standoff ring around a device (room-local metres), not user personal space. */
const DEVICE_APPROACH_STANDOFF = 1.8;
/**
 * Minimum horizontal distance (room-local metres) from the user's camera XZ to the robot centre.
 * Nav targets sit on this ring so the robot does not steer into the player's body.
 */
/** Smaller = robot stops closer; keep above ~1.5 so it still clears the player bubble. */
const USER_PERSONAL_SPACE_RADIUS = 1.75;
/** Small slack for float error when testing "arrived" / already-close. */
const USER_ARRIVAL_SLACK = 0.1;
/** Looser stop radius for autonomous / instruction patrol (not walk-to-user ring target). */
const PATROL_STYLE_REACH_DISTANCE = 1.8;
/** Scripted `walk` patrol leg when JSON omits `distance` (room-local metres). */
const SCRIPT_PATROL_DEFAULT_DISTANCE = 1.35;
const WAYPOINT_INTERVAL = 8.0; // Pick new waypoint every 8-12 seconds
/** Maximum time (seconds) the robot will try to walk to user before giving up. */
const WALK_TO_USER_TIMEOUT_SEC = 30.0;

// ── Stuck / repath constants ──
/** Seconds without meaningful movement before triggering a repath. */
const STUCK_THRESHOLD_SEC = 1.5;
/** Minimum seconds between consecutive repaths. */
const REPATH_COOLDOWN_SEC = 3.0;
/** After this many consecutive repaths the robot pauses in Idle. */
const MAX_REPATHS_BEFORE_IDLE = 4;
/** If it continues to be stuck after idling, forcefully respawn it to prevent being permanently trapped. */
const MAX_REPATHS_BEFORE_RESPAWN = 6;
/** Seconds the robot stays in Idle after too many repaths. */
const IDLE_PAUSE_SEC = 6.0;
/** Number of candidate directions to evaluate when repathing. */
const REPATH_CANDIDATES = 12;
const ROBOT_KEEP_OUT_EXTRA = 0.1;

/** Number of random positions to try when finding a collision-free spawn. */
const SPAWN_CANDIDATES = 100; // Increased for better collision avoidance
/** Margin from room walls for spawn candidates (metres). */
const SPAWN_MARGIN = 0.5;
/** Probe distance for spawn collision check (metres). Increased to ensure robot doesn't overlap. */
const SPAWN_PROBE_DIST = 0.6; // Increased from 0.4 to 0.6 for better clearance
/** Minimum safe distance from room geometry (metres). */
const SPAWN_MIN_SAFE_DIST = ROBOT_RADIUS + 0.2; // Robot radius + extra buffer

// Quest performance mode:
// disable extra per-frame walk diagnostics that are expensive on large room meshes.
const LIGHTWEIGHT_WALKING_MODE = true;

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
  // Track previous room-local position to prevent warping
  lastRoomLocalPos: { x: number; y: number; z: number } | null;
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

interface BehaviorScriptWalkRoutine {
  anchorX: number;
  anchorZ: number;
  dirX: number;
  dirZ: number;
  startYaw: number;
  leg: number;
  phase: "out" | "in";
}

export class RobotAssistantSystem extends createSystem({
  robots: {
    required: [RobotAssistantComponent],
  },
}) {
  private robotRecords: Map<string, RobotAssistantRecord> = new Map();
  /** Reused raycaster for "face the user" checks while walking. */
  private readonly lookRaycaster: Raycaster = new Raycaster();
  /** Throttle expensive room LoS raycasts while walking to user. */
  private lookRaycastCooldown = 0;
  private cachedCanSeeUser = true;
  /** Throttle forward obstacle scans (extra constrainMovement probe). */
  private forwardScanCooldown = 0;
  private timeElapsed = 0;
  private voiceActive = false;
  private voiceEmoteSequence: VoiceEmoteSequence | null = null;

  /** Looped JSON behavior script (replaces random waypoints when active). */
  private behaviorScript: AvatarBehaviorAction[] | null = null;
  private behaviorScriptIndex = 0;
  private behaviorScriptPhaseKey = "";
  private behaviorScriptTimer = 0;
  /** Forward → turn → return → turn for scripted `walk` actions. */
  private behaviorScriptWalkRoutine: BehaviorScriptWalkRoutine | null = null;

  // ── Repath / stuck recovery state ──
  /** Timestamp of the last repath action. */
  private lastRepathTime = -999;
  /** How many repaths in a row without the robot making real progress. */
  private consecutiveRepaths = 0;
  /** When >0 the robot is forced-idling after too many repaths. Counts down. */
  private idlePauseRemaining = 0;
  /** Ring buffer of recently blocked unit-directions (room-local). */
  private recentBlockedDirs: { x: number; z: number }[] = [];

  /** Legacy flag; kept for movement/guards. No longer used for multi-turn follow-up (one session per mic use). */
  inInstructionSession = false;
  /** Robot is walking to user; when reached, play pendingInstructionTopic and enter session. */
  walkingToUser = false;
  /** Topic to speak when robot reaches user (e.g. "panel", "fan"). */
  private pendingInstructionTopic: string | null = null;
  /** Dynamic instruction text from backend (if available, overrides topic-based text). */
  private pendingInstructionText: string | null = null;
  /** Callback to invoke when robot reaches user (for external systems like VoicePanelSystem). */
  private onReachedUserCallback: (() => void) | null = null;
  /** When false, keep a fixed movement target instead of continuously tracking user camera. */
  private trackUserWhileWalking = true;
  /** Fixed target used for device-approach commands. */
  private fixedWalkTarget: { x: number; z: number } | null = null;
  /** Temporary target when dodging an obstacle during walkingToUser */
  private stepAsideTarget: { x: number; z: number } | null = null;
  /** Time when robot started walking to user (for timeout detection). */
  private walkToUserStartTime = -1;
  /** Number of step-aside attempts while walking to user. */
  private stepAsideAttempts = 0;
  private static readonly MAX_STEP_ASIDE_ATTEMPTS = 5;

  init() {
    console.log(
      "[RobotAssistant] System initialized (autonomous behavior with pre-baked animations)",
    );
    // Register on globalThis so VoicePanelSystem can access it
    (globalThis as any).__robotAssistantSystem = this;
    const voiceSystem = VoiceControlSystem.getInstance();
    voiceSystem.addStatusListener(
      (
        status: "listening" | "processing" | "idle",
        payload?: VoiceIdlePayload,
      ) => {
        if (status === "listening" || status === "processing") {
          // Toggle ON: robot stands until user toggles off or command succeeds
          this.setVoiceListening(true);
          return;
        }
        if (status === "idle") {
          // Device actions: always close dialogue and stop listening (don't continue conversation)
          if (payload?.success && payload.action && payload.device) {
            if (payload.executeAfterMovement && payload.commandText) {
              this.startWalkingToDeviceForCommand(
                payload.commandText,
                payload.action,
                payload.device,
                payload.deviceId,
              );
              return;
            }
            console.log(
              "[RobotAssistant] Device action succeeded - closing dialogue and stopping listening",
            );
            import("../utils/VoiceTextToSpeech").then((module) => {
              module.speakCompletion(payload.action!, payload.device!);
            });
            // Always end session and close dialogue for device actions
            this.inInstructionSession = false;
            this.walkingToUser = false;
            this.pendingInstructionTopic = null;
            this.faceFirstRobotTowardUser();
            this.playEmoteSequence(["Yes", "ThumbsUp"], () => {
              this.setVoiceListening(false);
              // Notify VoicePanelSystem to close dialogue
              const voicePanelSystem = (globalThis as any).__voicePanelSystem;
              if (
                voicePanelSystem &&
                typeof voicePanelSystem.beginClosing === "function"
              ) {
                voicePanelSystem.beginClosing();
              }
            });
            return;
          }
          // Handle endSession flag (legacy / future use)
          if (payload?.endSession) {
            console.log(
              "[RobotAssistant] 🛑 End session requested - stopping all prompts",
            );
            this.walkingToUser = false;
            this.pendingInstructionTopic = null;
            this.inInstructionSession = false;
            this.setVoiceListening(false);
            return;
          }

          if (payload?.success && payload.instructionTopic) {
            const topic = payload.instructionTopic;
            if (topic === "goodbye") {
              this.walkingToUser = false;
              this.pendingInstructionTopic = null;
              this.pendingInstructionText = null;
              this.inInstructionSession = false;
              speakSeeYouAgain();
              this.playEmoteSequence(["Wave"], () => {
                this.setVoiceListening(false);
                const voicePanelSystem = (globalThis as any).__voicePanelSystem;
                if (
                  voicePanelSystem &&
                  typeof voicePanelSystem.beginClosing === "function"
                ) {
                  voicePanelSystem.beginClosing();
                }
              });
              return;
            }
            if (this.walkingToUser) {
              this.pendingInstructionTopic = topic;
              this.pendingInstructionText = payload.instructionText || null;
              return;
            }
            // First instruction: say "wait for me" and walk to user
            this.pendingInstructionTopic = topic;
            this.pendingInstructionText = payload.instructionText || null;
            this.notifyDialogueMessage(
              "Ok, I will explain that for you. Wait for me.",
            );
            speakInstructionWaitMe().then(() => {
              this.startWalkingToUser();
            });
            return;
          }
          if (payload?.cancelled) {
            this.walkingToUser = false;
            this.pendingInstructionTopic = null;
            this.pendingInstructionText = null;
            this.inInstructionSession = false;
            this.playEmoteSequence(["Wave"], () => {
              this.setVoiceListening(false);
            });
            return;
          }
          if (payload?.serverError) {
            this.walkingToUser = false;
            this.pendingInstructionTopic = null;
            this.pendingInstructionText = null;
            this.inInstructionSession = false;
            this.setVoiceListening(false);
            this.returnToPatrol();
            return;
          }
          this.setVoiceListening(false);
          if (payload?.noMatch) {
            this.returnToPatrol();
          }
        }
      },
    );

    this.renderer.xr.addEventListener("sessionstart", () => {
      console.log(
        "[RobotAssistant] XR session started — repositioning robot to random spawn point",
      );
      // Wait a short moment for room bounds to be iitialized (if needed)
      // Then reposition all existing robots to new random spawn points
      setTimeout(() => {
        const bounds = getRoomBounds();
        if (bounds || this.robotRecords.size > 0) {
          this.repositionAllRobots();
        } else {
          console.warn(
            "[RobotAssistant] Room bounds not available yet, will retry repositioning",
          );
          // Retry after a longer delay
          setTimeout(() => {
            this.repositionAllRobots();
          }, 1000);
        }
      }, 100);
    });
  }

  /**
   * Check if a position is safe to spawn at (no collision with room geometry).
   * Uses comprehensive collision detection similar to the movement system.
   *
   * @param worldPos World-space position to check
   * @param roomModel Room model to check against
   * @returns true if position is safe, false if it collides with room geometry
   */
  private isSpawnPositionSafe(
    worldPos: Vector3,
    roomModel: Object3D | undefined,
  ): boolean {
    if (!roomModel) return true;

    const raycaster = new Raycaster();

    // Use the same heights as the robot collision system for consistency
    const checkHeights = ROBOT_HEIGHTS;

    // More comprehensive probe directions - check in a full circle plus diagonals
    // This ensures we catch walls/furniture from all angles
    const numDirections = 16; // Increased from 8 to 16 for better coverage
    const probeDirs: Vector3[] = [];
    for (let i = 0; i < numDirections; i++) {
      const angle = (i / numDirections) * Math.PI * 2;
      probeDirs.push(new Vector3(Math.sin(angle), 0, Math.cos(angle)));
    }

    // Also add diagonal directions for better coverage
    probeDirs.push(
      new Vector3(0.707, 0, 0.707), // Northeast
      new Vector3(-0.707, 0, 0.707), // Northwest
      new Vector3(0.707, 0, -0.707), // Southeast
      new Vector3(-0.707, 0, -0.707), // Southwest
    );

    // Check at multiple heights to catch thin surfaces at different levels
    for (const height of checkHeights) {
      const origin = new Vector3(worldPos.x, worldPos.y + height, worldPos.z);

      for (const dir of probeDirs) {
        raycaster.set(origin, dir);
        raycaster.far = SPAWN_PROBE_DIST;
        raycaster.near = 0;

        const hits = raycaster.intersectObject(roomModel as any, true);

        // If we hit something within the safe distance, this position is not safe
        if (hits.length > 0 && hits[0].distance < SPAWN_MIN_SAFE_DIST) {
          return false;
        }
      }
    }

    // Additional check: probe outward in all directions from the center
    // This catches cases where the robot center might be inside geometry
    const centerOrigin = new Vector3(worldPos.x, worldPos.y + 0.1, worldPos.z);
    for (const dir of probeDirs) {
      raycaster.set(centerOrigin, dir);
      raycaster.far = SPAWN_MIN_SAFE_DIST;
      raycaster.near = 0;

      const hits = raycaster.intersectObject(roomModel as any, true);

      // If we hit something immediately (very close), the position is inside geometry
      if (hits.length > 0 && hits[0].distance < SPAWN_MIN_SAFE_DIST * 0.5) {
        return false;
      }
    }

    return true;
  }

  /**
   * Return the world-space spawn position for the robot.
   * These are direct world coordinates — do NOT transform through roomLocalToWorld.
   */
  private findRandomSpawnPosition(): { x: number; y: number; z: number } {
    const v = getRobotInitialSpawnWorldPosition();
    return { x: v.x, y: v.y, z: v.z };
  }

  /**
   * Ground the robot by aligning bbox min Y (feet) to floorY.
   * Returns the grounded Y that was applied.
   */
  private alignRobotFeetToFloor(model: Object3D, floorY: number): number {
    const box = new Box3().setFromObject(model as any);
    const originToFeet = model.position.y - box.min.y;
    const groundedY = floorY + originToFeet;
    model.position.y = groundedY;
    return groundedY;
  }

  /**
   * Reposition all existing robots to new random spawn points.
   * Called when XR session starts to ensure robots spawn randomly each time.
   */
  private repositionAllRobots(): void {
    if (this.robotRecords.size === 0) {
      console.log("[RobotAssistant] No robots to reposition");
      return;
    }

    for (const [robotId, record] of this.robotRecords) {
      // Find a new random spawn position (in room-local space)
      const spawn = this.findRandomSpawnPosition();

      // Spawn is already world-space; keep feet on floor for arbitrary model pivots.
      record.model.position.set(spawn.x, record.model.position.y, spawn.z);
      const groundedY = this.alignRobotFeetToFloor(record.model, spawn.y);

      // Reset position tracking to prevent false warp detection after repositioning
      record.lastRoomLocalPos = null;

      // Update component with new position and reset waypoint
      const bounds = getRoomBounds();
      const targetX = bounds
        ? bounds.minX + Math.random() * (bounds.maxX - bounds.minX)
        : spawn.x + (Math.random() - 0.5) * 4;
      const targetZ = bounds
        ? bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)
        : spawn.z + (Math.random() - 0.5) * 4;

      record.entity.setValue(RobotAssistantComponent, "targetX", targetX);
      record.entity.setValue(RobotAssistantComponent, "targetZ", targetZ);
      record.entity.setValue(
        RobotAssistantComponent,
        "hasReachedTarget",
        false,
      );
      record.entity.setValue(
        RobotAssistantComponent,
        "nextWaypointTime",
        this.timeElapsed + WAYPOINT_INTERVAL + Math.random() * 4.0,
      );
      record.entity.setValue(RobotAssistantComponent, "baseY", groundedY);
      record.entity.setValue(RobotAssistantComponent, "stuckTime", 0);
      // Reset last position for stuck detection
      record.entity.setValue(RobotAssistantComponent, "lastX", spawn.x);
      record.entity.setValue(RobotAssistantComponent, "lastZ", spawn.z);

      console.log(
        `[RobotAssistant] 🔄 Repositioned ${robotId} to random spawn at room-local (${spawn.x.toFixed(2)}, ${spawn.y.toFixed(2)}, ${spawn.z.toFixed(2)})`,
      );
    }
  }

  /** Set first robot's rotation to face the user (camera) in room-local XZ. */
  private faceFirstRobotTowardUser(): void {
    const record = this.robotRecords.values().next().value as
      | RobotAssistantRecord
      | undefined;
    if (!record || !this.world.camera) return;
    const cam = this.world.camera as { position: { x: number; z: number } };
    const userLocal = this.worldToRoomLocal(cam.position.x, 0, cam.position.z);
    const dx = userLocal.x - record.model.position.x;
    const dz = userLocal.z - record.model.position.z;
    if (Math.abs(dx) < 1e-5 && Math.abs(dz) < 1e-5) return;
    const angle = Math.atan2(dx, dz);
    (record.model as any).rotation.y = angle;
  }

  /** Start walking to user: set target to a point in front of the user, set walkingToUser. */
  private startWalkingToUser(): void {
    const record = this.robotRecords.values().next().value as
      | RobotAssistantRecord
      | undefined;
    if (!record || !this.world.camera) return;
    const cam = this.world.camera as {
      position: { x: number; y: number; z: number };
    };
    const userLocal = this.worldToRoomLocal(
      cam.position.x,
      cam.position.y,
      cam.position.z,
    );
    const approach = this.computeUserApproachLocalTarget(
      record.model.position.x,
      record.model.position.z,
      userLocal.x,
      userLocal.z,
    );
    const safeTarget = this.resolveSafeLocalTarget(
      record.model.position.x,
      record.model.position.z,
      approach.x,
      approach.z,
    );
    record.entity.setValue(RobotAssistantComponent, "targetX", safeTarget.x);
    record.entity.setValue(RobotAssistantComponent, "targetZ", safeTarget.z);
    record.entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
    this.trackUserWhileWalking = true;
    this.fixedWalkTarget = null;
    this.walkingToUser = true;
    // Reset timeout timer when resuming walk to user
    if (this.walkToUserStartTime < 0) {
      this.walkToUserStartTime = this.timeElapsed;
    }
    this.setVoiceListening(false);
    this.fadeToAction(record, "Walking", FADE_DURATION);
    record.entity.setValue(RobotAssistantComponent, "currentState", "Walking");
  }

  /** Public method: Walk robot to user position (camera). Calls callback when robot arrives. */
  public walkToUser(camera: Object3D, onArrived?: () => void): void {
    const record = this.robotRecords.values().next().value as
      | RobotAssistantRecord
      | undefined;
    if (!record || !camera) {
      console.warn("[RobotAssistant] walkToUser: No robot or camera available");
      onArrived?.();
      return;
    }

    const cam = camera as { position: { x: number; y: number; z: number } };
    const userLocal = this.worldToRoomLocal(
      cam.position.x,
      cam.position.y,
      cam.position.z,
    );

    // If the robot is already within comfortable speaking distance,
    // just face the user and invoke the callback — no need to walk.
    const dxAlready = userLocal.x - record.model.position.x;
    const dzAlready = userLocal.z - record.model.position.z;
    const alreadyDist = Math.sqrt(dxAlready * dxAlready + dzAlready * dzAlready);

    if (alreadyDist <= USER_PERSONAL_SPACE_RADIUS + USER_ARRIVAL_SLACK) {
      console.log(
        `[RobotAssistant] Already close to user (${alreadyDist.toFixed(2)}m) — skipping walk`,
      );
      this.faceFirstRobotTowardUser();
      this.fadeToAction(record, "Standing", FADE_DURATION);
      record.entity.setValue(RobotAssistantComponent, "currentState", "Standing");
      record.entity.setValue(RobotAssistantComponent, "hasReachedTarget", true);
      onArrived?.();
      return;
    }

    // Store callback and walk toward a point near user (not on top of them).
    this.onReachedUserCallback = onArrived || null;

    const approach = this.computeUserApproachLocalTarget(
      record.model.position.x,
      record.model.position.z,
      userLocal.x,
      userLocal.z,
    );
    const safeTarget = this.resolveSafeLocalTarget(
      record.model.position.x,
      record.model.position.z,
      approach.x,
      approach.z,
    );

    record.entity.setValue(RobotAssistantComponent, "targetX", safeTarget.x);
    record.entity.setValue(RobotAssistantComponent, "targetZ", safeTarget.z);
    record.entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
    this.trackUserWhileWalking = true;
    this.fixedWalkTarget = null;
    this.walkingToUser = true;
    this.walkToUserStartTime = this.timeElapsed;
    this.stepAsideAttempts = 0;
    this.stepAsideTarget = null;
    this.fadeToAction(record, "Walking", FADE_DURATION);
    record.entity.setValue(RobotAssistantComponent, "currentState", "Walking");

    console.log(
      `[RobotAssistant] 🚶 Walking near user target at (${safeTarget.x.toFixed(2)}, ${safeTarget.z.toFixed(2)}), dist=${alreadyDist.toFixed(2)}m`,
    );
  }

  /** Walk near target device, then execute queued voice command. */
  private startWalkingToDeviceForCommand(
    commandText: string,
    action: string,
    deviceName: string,
    deviceId?: string,
  ): void {
    const record = this.robotRecords.values().next().value as
      | RobotAssistantRecord
      | undefined;
    if (!record) return;

    const store = getStore();
    const resolvedDevice =
      (deviceId ? store.getDeviceById(deviceId) : undefined) ||
      store.devices.find(
        (d) => d.name.trim().toLowerCase() === deviceName.trim().toLowerCase(),
      );

    if (!resolvedDevice || !Array.isArray(resolvedDevice.position)) {
      console.warn(
        `[RobotAssistant] Could not resolve target device "${deviceName}", executing command immediately`,
      );
      void this.executeQueuedDeviceCommand(commandText, action, deviceName);
      return;
    }

    const targetPos = resolvedDevice.position;
    const toRobotX = record.model.position.x - targetPos[0];
    const toRobotZ = record.model.position.z - targetPos[2];
    const len = Math.sqrt(toRobotX * toRobotX + toRobotZ * toRobotZ);
    const dirX = len > 1e-5 ? toRobotX / len : 0;
    const dirZ = len > 1e-5 ? toRobotZ / len : -1;
    const nearDeviceX = targetPos[0] + dirX * DEVICE_APPROACH_STANDOFF;
    const nearDeviceZ = targetPos[2] + dirZ * DEVICE_APPROACH_STANDOFF;
    const safeTarget = this.resolveSafeLocalTarget(
      record.model.position.x,
      record.model.position.z,
      nearDeviceX,
      nearDeviceZ,
    );

    this.trackUserWhileWalking = false;
    this.fixedWalkTarget = { x: safeTarget.x, z: safeTarget.z };
    this.onReachedUserCallback = () => {
      void this.executeQueuedDeviceCommand(commandText, action, deviceName);
    };

    record.entity.setValue(RobotAssistantComponent, "targetX", safeTarget.x);
    record.entity.setValue(RobotAssistantComponent, "targetZ", safeTarget.z);
    record.entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
    this.walkingToUser = true;
    this.walkToUserStartTime = this.timeElapsed;
    this.stepAsideAttempts = 0;
    this.stepAsideTarget = null;
    this.setVoiceListening(false);
    this.fadeToAction(record, "Walking", FADE_DURATION);
    record.entity.setValue(RobotAssistantComponent, "currentState", "Walking");
  }

  /** Execute parsed command once robot is in range, then finish interaction flow. */
  private async executeQueuedDeviceCommand(
    commandText: string,
    fallbackAction: string,
    fallbackDevice: string,
  ): Promise<void> {
    let completionAction = fallbackAction;
    let completionDevice = fallbackDevice;
    try {
      const result = await BackendApiClient.getInstance().sendVoiceCommand(
        commandText,
        true,
      );
      const executed = result?.actions?.find(
        (a: any) => a?.status === "success" && a?.action && a?.device,
      );
      if (executed) {
        completionAction = executed.action;
        completionDevice = executed.device;
      }
    } catch (error) {
      console.error(
        "[RobotAssistant] Failed to execute queued device command:",
        error,
      );
    } finally {
      import("../utils/VoiceTextToSpeech").then((module) => {
        module.speakCompletion(completionAction, completionDevice);
      });
      this.inInstructionSession = false;
      this.pendingInstructionTopic = null;
      this.fixedWalkTarget = null;
      this.trackUserWhileWalking = true;
      this.faceFirstRobotTowardUser();
      this.playEmoteSequence(["Yes", "ThumbsUp"], () => {
        this.setVoiceListening(false);
        const voicePanelSystem = (globalThis as any).__voicePanelSystem;
        if (
          voicePanelSystem &&
          typeof voicePanelSystem.beginClosing === "function"
        ) {
          voicePanelSystem.beginClosing();
        }
      });
    }
  }

  /** Public method: Stop walking to user and return to normal patrol behavior. */
  public returnToPatrol(): void {
    this.walkingToUser = false;
    this.onReachedUserCallback = null;
    this.pendingInstructionTopic = null;
    this.pendingInstructionText = null;
    this.stepAsideTarget = null;
    this.fixedWalkTarget = null;
    this.trackUserWhileWalking = true;
    this.walkToUserStartTime = -1;
    this.stepAsideAttempts = 0;

    // Voice UI often leaves the robot in "Standing" or an emote; movement only runs for Walking/Idle.
    this.setVoiceListening(false);

    const record = this.robotRecords.values().next().value as
      | RobotAssistantRecord
      | undefined;
    if (record) {
      // Pick a random waypoint to resume patrol
      const bounds = getRoomBounds();
      if (bounds) {
        const newTargetX =
          bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
        const newTargetZ =
          bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ);
        const safeTarget = this.resolveSafeLocalTarget(
          record.model.position.x,
          record.model.position.z,
          newTargetX,
          newTargetZ,
        );
        record.entity.setValue(
          RobotAssistantComponent,
          "targetX",
          safeTarget.x,
        );
        record.entity.setValue(
          RobotAssistantComponent,
          "targetZ",
          safeTarget.z,
        );
        record.entity.setValue(
          RobotAssistantComponent,
          "hasReachedTarget",
          false,
        );
      }
      this.fadeToAction(record, "Walking", FADE_DURATION);
      record.entity.setValue(
        RobotAssistantComponent,
        "currentState",
        "Walking",
      );
    }

    console.log("[RobotAssistant] 🔄 Returning to patrol");
  }

  async createRobotAssistant(
    robotId: string,
    robotName: string,
    modelKey: string,
  ): Promise<Entity | null> {
    try {
      const gltf = AssetManager.getGLTF(modelKey);
      if (!gltf) {
        console.error(`[RobotAssistant] Model not found: ${modelKey}`);
        return null;
      }

      // Pick a random collision-free spawn inside the room
      const spawn = this.findRandomSpawnPosition();
      let finalX = spawn.x;
      let finalY = spawn.y;
      let finalZ = spawn.z;

      const roomBounds = getRoomBounds();
      if (roomBounds) {
        console.log(
          "[RobotAssistant] 📍 Spawning inside lab room at",
          { finalX, finalY, finalZ },
          "room bounds",
          roomBounds,
        );
      } else {
        console.warn(
          "[RobotAssistant] ⚠️ Room bounds not initialized; spawning at origin",
        );
      }

      // Spawn is already in world space — use directly (no roomLocalToWorld conversion)
      const worldPos = { x: finalX, y: finalY, z: finalZ };

      const robotModel = SkeletonUtils.clone(gltf.scene) as Object3D;
      robotModel.scale.setScalar(0.2);
      robotModel.position.set(worldPos.x, worldPos.y, worldPos.z);
      finalY = this.alignRobotFeetToFloor(robotModel, worldPos.y);

      // Orient the robot slightly to match room rotation if necessary (assuming Y rotation)
      const roomRotY = (globalThis as any).__labRoomRotationY || 0;
      robotModel.rotation.set(0, roomRotY, 0);
      robotModel.visible = true;

      this.world.scene.add(robotModel);
      console.log(
        `[RobotAssistant] 🔍 Model added to scene, visible: ${robotModel.visible}`,
      );

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
        lastRoomLocalPos: null,
      };
      this.robotRecords.set(robotId, record);

      console.log(
        `[RobotAssistant] ✅ Created: ${robotName} at (${finalX.toFixed(2)}, ${finalY.toFixed(2)}, ${finalZ.toFixed(2)})`,
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

  /** After spoken instruction: stop voice stance and close the conversation UI. */
  private finishInstructionAndClosePanel(): void {
    this.inInstructionSession = false;
    this.setVoiceListening(false);
    const voicePanelSystem = (globalThis as any).__voicePanelSystem;
    if (
      voicePanelSystem &&
      typeof voicePanelSystem.beginClosing === "function"
    ) {
      voicePanelSystem.beginClosing();
    }
  }

  // Turn voice-listening mode on or off
  setVoiceListening(active: boolean): void {
    if (active) {
      // Already in voice mode (e.g. "listening" then "processing")
      if (this.voiceActive) return;
      this.voiceActive = true;
      console.log("[RobotAssistant] 🎤 Voice listening ON");
    } else {
      this.voiceActive = false;
      this.voiceEmoteSequence = null;
      console.log("[RobotAssistant] 🎤 Voice listening OFF");
    }
  }

  loadBehaviorScript(actions: AvatarBehaviorAction[] | null): void {
    if (actions && actions.length > 0) {
      this.behaviorScript = actions;
      this.behaviorScriptIndex = 0;
      this.behaviorScriptPhaseKey = "";
      this.behaviorScriptTimer = 0;
      this.behaviorScriptWalkRoutine = null;
      console.log(
        `[RobotAssistant] 📜 Behavior script active (${actions.length} actions)`,
      );
    } else {
      this.behaviorScript = null;
      this.behaviorScriptIndex = 0;
      this.behaviorScriptPhaseKey = "";
      this.behaviorScriptTimer = 0;
      this.behaviorScriptWalkRoutine = null;
      console.log("[RobotAssistant] 📜 Behavior script cleared");
    }
  }

  getRobotRoomLocalXZ(robotId: string): { x: number; z: number } | null {
    const rec = this.robotRecords.get(robotId);
    if (!rec) return null;
    const loc = this.worldToRoomLocal(
      rec.model.position.x,
      rec.model.position.y,
      rec.model.position.z,
    );
    return { x: loc.x, z: loc.z };
  }

  private isBehaviorScriptMode(): boolean {
    return (
      !!this.behaviorScript &&
      this.behaviorScript.length > 0 &&
      !this.voiceActive &&
      !this.walkingToUser &&
      !this.inInstructionSession
    );
  }

  private stepBehaviorScript(
    record: RobotAssistantRecord,
    entity: Entity,
    roomLocal: { x: number; y: number; z: number },
    dt: number,
  ): void {
    const actions = this.behaviorScript!;
    if (this.behaviorScriptIndex >= actions.length) this.behaviorScriptIndex = 0;
    const action = actions[this.behaviorScriptIndex];
    const pkey = `${this.behaviorScriptIndex}:${action.type}`;
    if (this.behaviorScriptPhaseKey !== pkey) {
      this.behaviorScriptPhaseKey = pkey;
      if (action.type !== "walk") {
        this.behaviorScriptWalkRoutine = null;
      }
      switch (action.type) {
        case "wait":
          this.behaviorScriptTimer = action.duration;
          break;
        case "idle":
          this.behaviorScriptTimer = action.duration ?? 2;
          break;
        case "wave":
          this.behaviorScriptTimer = 2.2;
          if (record.animationsMap.has("Wave")) {
            this.fadeToAction(record, "Wave", FADE_DURATION);
            entity.setValue(RobotAssistantComponent, "currentState", "Wave");
          }
          break;
        case "sit":
          this.behaviorScriptTimer = action.duration ?? 3;
          this.fadeToAction(record, "Idle", FADE_DURATION);
          entity.setValue(RobotAssistantComponent, "currentState", "Idle");
          break;
        case "walk": {
          const localYaw = record.model.rotation.y;
          const leg = action.distance ?? SCRIPT_PATROL_DEFAULT_DISTANCE;
          this.behaviorScriptWalkRoutine = {
            anchorX: roomLocal.x,
            anchorZ: roomLocal.z,
            dirX: Math.sin(localYaw),
            dirZ: Math.cos(localYaw),
            startYaw: localYaw,
            leg,
            phase: "out",
          };
          break;
        }
        default:
          this.behaviorScriptTimer = 0;
      }
    }

    switch (action.type) {
      case "walk": {
        const w = this.behaviorScriptWalkRoutine;
        if (!w) break;
        const arrive = WAYPOINT_REACH_DISTANCE + 0.12;
        const goalX = w.anchorX + w.dirX * w.leg;
        const goalZ = w.anchorZ + w.dirZ * w.leg;

        if (w.phase === "out") {
          entity.setValue(RobotAssistantComponent, "targetX", goalX);
          entity.setValue(RobotAssistantComponent, "targetZ", goalZ);
          entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
          const dx = goalX - roomLocal.x;
          const dz = goalZ - roomLocal.z;
          if (Math.sqrt(dx * dx + dz * dz) < arrive) {
            record.model.position.set(goalX, roomLocal.y, goalZ);
            // Snap 180° (euler + sync quaternion — movement uses quaternion.rotateTowards).
            record.model.rotation.set(0, w.startYaw + Math.PI, 0);
            record.model.updateMatrixWorld(true);
            w.phase = "in";
            entity.setValue(RobotAssistantComponent, "targetX", w.anchorX);
            entity.setValue(RobotAssistantComponent, "targetZ", w.anchorZ);
            entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
            this.fadeToAction(record, "Walking", FADE_DURATION);
            entity.setValue(RobotAssistantComponent, "currentState", "Walking");
          }
          break;
        }

        if (w.phase === "in") {
          entity.setValue(RobotAssistantComponent, "targetX", w.anchorX);
          entity.setValue(RobotAssistantComponent, "targetZ", w.anchorZ);
          entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
          const dx = w.anchorX - roomLocal.x;
          const dz = w.anchorZ - roomLocal.z;
          if (Math.sqrt(dx * dx + dz * dz) < arrive) {
            record.model.position.set(w.anchorX, roomLocal.y, w.anchorZ);
            record.model.rotation.set(0, w.startYaw, 0);
            record.model.updateMatrixWorld(true);
            this.behaviorScriptWalkRoutine = null;
            this.behaviorScriptIndex =
              (this.behaviorScriptIndex + 1) % actions.length;
            this.behaviorScriptPhaseKey = "";
            entity.setValue(RobotAssistantComponent, "hasReachedTarget", true);
            this.fadeToAction(record, "Walking", FADE_DURATION);
            entity.setValue(RobotAssistantComponent, "currentState", "Walking");
          }
          break;
        }
        break;
      }
      case "wait":
      case "idle":
      case "wave":
      case "sit": {
        this.behaviorScriptTimer -= dt;
        entity.setValue(RobotAssistantComponent, "hasReachedTarget", true);
        if (
          (action.type === "wait" || action.type === "idle") &&
          !["Wave"].includes(record.currentAction)
        ) {
          if (record.currentAction !== "Idle") {
            this.fadeToAction(record, "Idle", FADE_DURATION);
            entity.setValue(RobotAssistantComponent, "currentState", "Idle");
          }
        }
        if (this.behaviorScriptTimer <= 0) {
          this.behaviorScriptIndex =
            (this.behaviorScriptIndex + 1) % actions.length;
          this.behaviorScriptPhaseKey = "";
        }
        break;
      }
      default:
        this.behaviorScriptIndex =
          (this.behaviorScriptIndex + 1) % actions.length;
        this.behaviorScriptPhaseKey = "";
    }
  }

  // Play a sequence of emotes
  // NOTE: caller's onDone should call setVoiceListening(false) when the flow is complete.
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

  // ── Smart waypoint selection ──────────────────────────────────────

  /** Remember a blocked direction so future waypoints avoid it. */
  private recordBlockedDir(dx: number, dz: number): void {
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) return;
    this.recentBlockedDirs.push({ x: dx / len, z: dz / len });
    // Keep at most 6 entries
    if (this.recentBlockedDirs.length > 6) this.recentBlockedDirs.shift();
  }

  private isLocalPointInKeepOut(localX: number, localZ: number): boolean {
    const world = this.roomLocalToWorld(localX, 0, localZ);
    return isInTableKeepOutZone(world.x, world.z, ROBOT_KEEP_OUT_EXTRA + ROBOT_RADIUS);
  }

  private doesLocalSegmentCrossKeepOut(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): boolean {
    const segDx = toX - fromX;
    const segDz = toZ - fromZ;
    const dist = Math.sqrt(segDx * segDx + segDz * segDz);
    if (dist < 1e-4) return this.isLocalPointInKeepOut(toX, toZ);

    const step = 0.12;
    const steps = Math.max(2, Math.ceil(dist / step));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = fromX + segDx * t;
      const z = fromZ + segDz * t;
      if (this.isLocalPointInKeepOut(x, z)) return true;
    }
    return false;
  }

  /**
   * Point on the user's personal-space circle (XZ) in the direction from user toward the robot.
   * Navigating here keeps the robot outside the player's bubble instead of aiming at the camera origin.
   */
  private computeUserApproachLocalTarget(
    robotX: number,
    robotZ: number,
    userX: number,
    userZ: number,
  ): { x: number; z: number } {
    let dx = robotX - userX;
    let dz = robotZ - userZ;
    let dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 1e-4) {
      dx = 1;
      dz = 0;
      dist = 1;
    }
    const nx = dx / dist;
    const nz = dz / dist;
    return {
      x: userX + nx * USER_PERSONAL_SPACE_RADIUS,
      z: userZ + nz * USER_PERSONAL_SPACE_RADIUS,
    };
  }

  /** If the robot centre is inside the user's personal space, push it out to the ring (XZ only). */
  private clampRobotOutsideUserPersonalSpace(
    robotX: number,
    robotZ: number,
    userX: number,
    userZ: number,
  ): { x: number; z: number } {
    const dx = robotX - userX;
    const dz = robotZ - userZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= USER_PERSONAL_SPACE_RADIUS - 1e-4 || dist < 1e-6) {
      return { x: robotX, z: robotZ };
    }
    const s = USER_PERSONAL_SPACE_RADIUS / dist;
    return { x: userX + dx * s, z: userZ + dz * s };
  }

  private resolveSafeLocalTarget(
    fromX: number,
    fromZ: number,
    desiredX: number,
    desiredZ: number,
  ): { x: number; z: number } {
    let [clampedX, clampedZ] = clampToWalkableArea(desiredX, desiredZ);
    if (
      !this.isLocalPointInKeepOut(clampedX, clampedZ) &&
      !this.doesLocalSegmentCrossKeepOut(fromX, fromZ, clampedX, clampedZ)
    ) {
      return { x: clampedX, z: clampedZ };
    }

    const detour = this.pickSmartWaypoint(fromX, fromZ);
    [clampedX, clampedZ] = clampToWalkableArea(detour.x, detour.z);
    return { x: clampedX, z: clampedZ };
  }

  /**
   * Pick a nearby waypoint that avoids ALL recently-blocked directions.
   *
   * Strategy:
   *  1. Generate `REPATH_CANDIDATES` randomly-jittered directions.
   *  2. Try each at **two different distances** (short + long).
   *  3. Score: penalise alignment with ANY recent blocked dir,
   *     require the candidate to be inside room bounds,
   *     favour room centre, add heavy random jitter.
   *  4. Return the best candidate.
   *
   * All coordinates are **room-local**.
   */
  private pickSmartWaypoint(
    fromX: number,
    fromZ: number,
  ): { x: number; z: number } {
    const bounds = getRoomBounds();
    let bestX = fromX;
    let bestZ = fromZ;
    let bestScore = -Infinity;

    const distances = [0.6, 1.2, 2.0, 3.0]; // try multiple radii

    for (let i = 0; i < REPATH_CANDIDATES; i++) {
      // Random angle instead of evenly spaced — breaks deterministic loops
      const angle = Math.random() * Math.PI * 2;
      const dirX = Math.sin(angle);
      const dirZ = Math.cos(angle);

      for (const dist of distances) {
        const candX = fromX + dirX * dist;
        const candZ = fromZ + dirZ * dist;

        let score = 0;

        // Hard reject desk/table keep-out zones and segments crossing them.
        if (
          this.isLocalPointInKeepOut(candX, candZ) ||
          this.doesLocalSegmentCrossKeepOut(fromX, fromZ, candX, candZ)
        ) {
          score -= 200;
        }

        // 1. Penalise alignment with ALL recently blocked directions
        for (const bd of this.recentBlockedDirs) {
          const dot = dirX * bd.x + dirZ * bd.z;
          // dot > 0 means same direction as blocked → bad
          score -= Math.max(0, dot) * 8;
        }

        // 2. Must be inside room bounds
        if (bounds) {
          const margin = 0.3;
          const inside =
            candX >= bounds.minX + margin &&
            candX <= bounds.maxX - margin &&
            candZ >= bounds.minZ + margin &&
            candZ <= bounds.maxZ - margin;
          if (!inside) {
            score -= 50; // hard penalty — almost never pick out-of-bounds
          }

          // Slight preference toward room centre
          const cx = (bounds.minX + bounds.maxX) * 0.5;
          const cz = (bounds.minZ + bounds.maxZ) * 0.5;
          const distToCenter = Math.sqrt((candX - cx) ** 2 + (candZ - cz) ** 2);
          score -= distToCenter * 0.3;
        }

        // 3. Heavy random jitter so repeated calls give different results
        score += Math.random() * 6;

        // 4. Slight bonus for mid-range distances (not too short, not too long)
        if (dist >= 1.0 && dist <= 2.5) score += 2;

        if (score > bestScore) {
          bestScore = score;
          bestX = candX;
          bestZ = candZ;
        }
      }
    }

    // Clamp to room bounds
    if (bounds) {
      bestX = Math.max(bounds.minX + 0.3, Math.min(bounds.maxX - 0.3, bestX));
      bestZ = Math.max(bounds.minZ + 0.3, Math.min(bounds.maxZ - 0.3, bestZ));
    }

    return { x: bestX, z: bestZ };
  }

  // ── Helper: convert room-local position to world position ──
  private roomLocalToWorld(
    lx: number,
    ly: number,
    lz: number,
  ): { x: number; y: number; z: number } {
    const roomModel = (globalThis as any).__labRoomModel;
    if (!roomModel) return { x: lx, y: ly, z: lz };
    const rotY = roomModel.rotation.y;
    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    const roomScale =
      Math.abs((roomModel.scale?.x as number) ?? 1) > 1e-6
        ? (roomModel.scale.x as number)
        : 1;
    const sx = lx * roomScale;
    const sy = ly * roomScale;
    const sz = lz * roomScale;
    return {
      x: roomModel.position.x + sx * cosR - sz * sinR,
      y: roomModel.position.y + sy,
      z: roomModel.position.z + sx * sinR + sz * cosR,
    };
  }

  // ── Helper: convert world position to room-local position ──
  private worldToRoomLocal(
    wx: number,
    wy: number,
    wz: number,
  ): { x: number; y: number; z: number } {
    const roomModel = (globalThis as any).__labRoomModel;
    if (!roomModel) return { x: wx, y: wy, z: wz };
    const rotY = roomModel.rotation.y;
    const cosR = Math.cos(-rotY);
    const sinR = Math.sin(-rotY);
    const dx = wx - roomModel.position.x;
    const dy = wy - roomModel.position.y;
    const dz = wz - roomModel.position.z;
    const roomScale =
      Math.abs((roomModel.scale?.x as number) ?? 1) > 1e-6
        ? (roomModel.scale.x as number)
        : 1;
    return {
      x: (dx * cosR - dz * sinR) / roomScale,
      y: dy / roomScale,
      z: (dx * sinR + dz * cosR) / roomScale,
    };
  }

  update(dt: number): void {
    this.timeElapsed += dt;
    this.lookRaycastCooldown = Math.max(0, this.lookRaycastCooldown - dt);
    this.forwardScanCooldown = Math.max(0, this.forwardScanCooldown - dt);

    for (const [robotId, record] of this.robotRecords) {
      // Always update mixer
      record.mixer.update(dt);

      // ── START OF FRAME: Convert world position → room-local ──
      // Movement code (waypoints, clamping) all works in
      // room-local coords that match roomBounds. After movement,
      // we convert back to world at end-of-frame.
      const roomModel = (globalThis as any).__labRoomModel;
      const roomRotY = roomModel ? roomModel.rotation.y : 0;

      // Get current world position and convert to room-local
      const currentWorldPos = {
        x: record.model.position.x,
        y: record.model.position.y,
        z: record.model.position.z,
      };
      const roomLocal = this.worldToRoomLocal(
        currentWorldPos.x,
        currentWorldPos.y,
        currentWorldPos.z,
      );

      // Prevent warping by checking if the position change is reasonable
      // If we have a previous position, ensure the change is not too large
      if (record.lastRoomLocalPos !== null) {
        const posDiff = Math.sqrt(
          (roomLocal.x - record.lastRoomLocalPos.x) ** 2 +
          (roomLocal.z - record.lastRoomLocalPos.z) ** 2,
        );

        // Maximum reasonable movement per frame (based on max velocity + safety margin)
        // WALK_VELOCITY is 0.5 m/s, so at 60fps (dt ~0.016s), max movement is ~0.008m per frame
        // Add safety margin: allow up to 0.1m per frame (much more than possible)
        const maxReasonableMovement = 0.1;

        if (posDiff > maxReasonableMovement) {
          // Large jump detected - this is likely a coordinate conversion error
          // Keep the previous position and log a warning
          console.warn(
            `[RobotAssistant] ⚠️ Prevented position warp: diff=${posDiff.toFixed(3)}m (max=${maxReasonableMovement.toFixed(3)}m), keeping previous position`,
          );
          // Use previous position instead
          record.model.position.set(
            record.lastRoomLocalPos.x,
            record.lastRoomLocalPos.y,
            record.lastRoomLocalPos.z,
          );
        } else {
          // Valid position update
          record.model.position.set(roomLocal.x, roomLocal.y, roomLocal.z);
          record.lastRoomLocalPos = { ...roomLocal };
        }
      } else {
        // First frame - initialize position
        record.model.position.set(roomLocal.x, roomLocal.y, roomLocal.z);
        record.lastRoomLocalPos = { ...roomLocal };
      }

      // Undo room rotation so all rotation math is in room-local space
      record.model.rotation.y -= roomRotY;

      // During instruction session, keep robot at current place (no walking),
      // but still allow emotes to play naturally.
      if (this.inInstructionSession && !this.walkingToUser) {
        const isEmotePlaying = EMOTES.includes(record.currentAction);
        if (!isEmotePlaying && record.currentAction !== "Standing") {
          this.fadeToAction(record, "Standing", FADE_DURATION);
          record.entity.setValue(
            RobotAssistantComponent,
            "currentState",
            "Standing",
          );
        }
        this.faceFirstRobotTowardUser();
        const sessionWorldPos = this.roomLocalToWorld(
          record.model.position.x,
          record.model.position.y,
          record.model.position.z,
        );
        record.model.position.set(
          sessionWorldPos.x,
          sessionWorldPos.y,
          sessionWorldPos.z,
        );
        record.model.rotation.y += roomRotY;
        continue;
      }

      const entity = record.entity;
      if (this.isBehaviorScriptMode()) {
        this.stepBehaviorScript(record, entity, roomLocal, dt);
      }
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
      if (this.walkingToUser) {
        // Fallback: if walkingToUser is set but neither topic nor callback exist,
        // stop walking once we are close enough so the robot doesn't oscillate.
        if (!this.pendingInstructionTopic && !this.onReachedUserCallback && this.world.camera) {
          const cam = this.world.camera as {
            position: { x: number; y: number; z: number };
          };
          const userLocal = this.worldToRoomLocal(
            cam.position.x,
            cam.position.y,
            cam.position.z,
          );
          const fbDx = userLocal.x - record.model.position.x;
          const fbDz = userLocal.z - record.model.position.z;
          const fbDist = Math.sqrt(fbDx * fbDx + fbDz * fbDz);
          if (fbDist <= USER_PERSONAL_SPACE_RADIUS + USER_ARRIVAL_SLACK) {
            console.warn(
              "[RobotAssistant] walkingToUser but no topic/callback — stopping walk",
            );
            this.walkingToUser = false;
            this.walkToUserStartTime = -1;
            this.stepAsideAttempts = 0;
            this.stepAsideTarget = null;
            this.fixedWalkTarget = null;
            this.trackUserWhileWalking = true;
            this.fadeToAction(record, "Standing", FADE_DURATION);
            entity.setValue(RobotAssistantComponent, "currentState", "Standing");
            entity.setValue(RobotAssistantComponent, "hasReachedTarget", true);
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

        if (this.pendingInstructionTopic || this.onReachedUserCallback) {
          const walkDuration = this.timeElapsed - this.walkToUserStartTime;

          // Timeout check: if we've been walking too long, give up and call callback anyway
          if (walkDuration > WALK_TO_USER_TIMEOUT_SEC) {
            console.warn(
              `[RobotAssistant] ⏱️ Walk to user timed out after ${walkDuration.toFixed(1)}s — respawning to spawn point and calling callback`,
            );

            const spawn = this.findRandomSpawnPosition();
            record.model.position.set(spawn.x, record.model.position.y, spawn.z);
            const groundedTimeoutY = this.alignRobotFeetToFloor(
              record.model,
              spawn.y,
            );
            record.lastRoomLocalPos = null;
            entity.setValue(RobotAssistantComponent, "targetX", spawn.x);
            entity.setValue(RobotAssistantComponent, "targetZ", spawn.z);
            entity.setValue(RobotAssistantComponent, "hasReachedTarget", true);
            entity.setValue(RobotAssistantComponent, "baseY", groundedTimeoutY);
            entity.setValue(RobotAssistantComponent, "stuckTime", 0);
            const callback = this.onReachedUserCallback;
            this.walkingToUser = false;
            this.pendingInstructionTopic = null;
            this.pendingInstructionText = null;
            this.onReachedUserCallback = null;
            this.walkToUserStartTime = -1;
            this.stepAsideAttempts = 0;
            this.stepAsideTarget = null;
            this.fixedWalkTarget = null;
            this.trackUserWhileWalking = true;
            if (callback) {
              callback();
            }
            // Continue with normal behavior
            continue;
          }

          // Retarget the ring point around the user (personal space), not the camera origin.
          if (!this.stepAsideTarget && this.trackUserWhileWalking && this.world.camera) {
            const cam = this.world.camera as {
              position: { x: number; y: number; z: number };
            };
            const currentUserLocal = this.worldToRoomLocal(
              cam.position.x,
              cam.position.y,
              cam.position.z,
            );

            const approach = this.computeUserApproachLocalTarget(
              record.model.position.x,
              record.model.position.z,
              currentUserLocal.x,
              currentUserLocal.z,
            );
            const dxTarget = approach.x - targetX;
            const dzTarget = approach.z - targetZ;
            const distToDesired = Math.sqrt(dxTarget * dxTarget + dzTarget * dzTarget);

            if (distToDesired > 0.1) {
              const safeTarget = this.resolveSafeLocalTarget(
                record.model.position.x,
                record.model.position.z,
                approach.x,
                approach.z,
              );
              entity.setValue(RobotAssistantComponent, "targetX", safeTarget.x);
              entity.setValue(RobotAssistantComponent, "targetZ", safeTarget.z);
            }
          }

          if (this.stepAsideTarget) {
            // If we are currently stepping aside to avoid an obstacle
            const dxAside = targetX - record.model.position.x;
            const dzAside = targetZ - record.model.position.z;
            const distToAside = Math.sqrt(dxAside * dxAside + dzAside * dzAside);
            if (distToAside <= WAYPOINT_REACH_DISTANCE) {
              console.log(
                `[RobotAssistant] ↩️ Reached step-aside waypoint, resuming walk to user`,
              );
              this.stepAsideTarget = null;
              if (this.trackUserWhileWalking) {
                this.startWalkingToUser(); // This updates the targetX/Z back to the user's location
              } else if (this.fixedWalkTarget) {
                entity.setValue(
                  RobotAssistantComponent,
                  "targetX",
                  this.fixedWalkTarget.x,
                );
                entity.setValue(
                  RobotAssistantComponent,
                  "targetZ",
                  this.fixedWalkTarget.z,
                );
                entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
              }
              continue;
            }
          } else {
            // Voice approach: stop when inside personal space around the user.
            // Device walk: stop when close to the fixed device standoff target.
            if (this.world.camera) {
              const cam = this.world.camera as {
                position: { x: number; y: number; z: number };
              };
              const userLocal = this.worldToRoomLocal(
                cam.position.x,
                cam.position.y,
                cam.position.z,
              );
              const dxUser = userLocal.x - record.model.position.x;
              const dzUser = userLocal.z - record.model.position.z;
              const distToUser = Math.sqrt(dxUser * dxUser + dzUser * dzUser);

              const dxTargetWp = targetX - record.model.position.x;
              const dzTargetWp = targetZ - record.model.position.z;
              const distToTargetWp = Math.sqrt(
                dxTargetWp * dxTargetWp + dzTargetWp * dzTargetWp,
              );

              const arrivedAtUserBubble =
                this.trackUserWhileWalking &&
                distToUser <= USER_PERSONAL_SPACE_RADIUS + USER_ARRIVAL_SLACK;
              const arrivedAtFixedGoal =
                !this.trackUserWhileWalking &&
                this.fixedWalkTarget != null &&
                distToTargetWp <= WAYPOINT_REACH_DISTANCE + 0.08;

              if (arrivedAtUserBubble || arrivedAtFixedGoal) {
                const topic = this.pendingInstructionTopic;
                const savedInstructionText = this.pendingInstructionText;
                const callback = this.onReachedUserCallback;
                this.walkingToUser = false;
                this.pendingInstructionTopic = null;
                this.pendingInstructionText = null;
                this.onReachedUserCallback = null;
                this.walkToUserStartTime = -1;
                this.stepAsideAttempts = 0;
                this.stepAsideTarget = null;
                this.fixedWalkTarget = null;
                this.trackUserWhileWalking = true;

                // If there's an external callback (e.g., from VoicePanelSystem), call it
                if (callback) {
                  console.log(
                    `[RobotAssistant] 👋 Reached user (dist=${distToUser.toFixed(2)}m), calling external callback`,
                  );
                  this.fadeToAction(record, "Standing", FADE_DURATION);
                  record.entity.setValue(
                    RobotAssistantComponent,
                    "currentState",
                    "Standing",
                  );
                  record.entity.setValue(
                    RobotAssistantComponent,
                    "hasReachedTarget",
                    true,
                  );
                  callback();
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

                // Otherwise, handle instruction topic flow (speak once, then close — one session per mic use)
                if (topic) {
                  this.fadeToAction(record, "Standing", FADE_DURATION);
                  record.entity.setValue(
                    RobotAssistantComponent,
                    "currentState",
                    "Standing",
                  );
                  record.entity.setValue(
                    RobotAssistantComponent,
                    "hasReachedTarget",
                    true,
                  );
                  console.log(
                    `[RobotAssistant] 👋 Reached user (dist=${distToUser.toFixed(2)}m), speaking instruction: ${topic}`,
                  );
                  const instructionText =
                    savedInstructionText || this.getInstructionText(topic);
                  if (instructionText) {
                    this.notifyDialogueMessage(instructionText);
                    const afterInstruction = () => {
                      this.finishInstructionAndClosePanel();
                    };
                    if (savedInstructionText) {
                      speakText(instructionText).then(afterInstruction);
                    } else {
                      speakInstruction(topic).then(afterInstruction);
                    }
                  }
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
            } // end if (this.world.camera)
          }
        }
      } // end if (this.walkingToUser)
      // Calculate movement intention
      let shouldMove = false;
      let distanceToTarget = 0;
      let dx = 0;
      let dz = 0;
      const reachDist =
        this.walkingToUser && !this.stepAsideTarget
          ? WAYPOINT_REACH_DISTANCE
          : this.inInstructionSession
            ? PATROL_STYLE_REACH_DISTANCE
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

          // Normal waypoint navigation - face the waypoint.
          // While walking to the user, prefer rotating to face the user
          // (so the user doesn't see the robot's back).
          let targetAngle = Math.atan2(dx, dz);
          if (this.walkingToUser && this.world.camera) {
            const cam = this.world.camera as {
              position: { x: number; y: number; z: number };
            };
            const userLocal = this.worldToRoomLocal(
              cam.position.x,
              cam.position.y,
              cam.position.z,
            );

            const dxUser = userLocal.x - record.model.position.x;
            const dzUser = userLocal.z - record.model.position.z;
            const distToUser = Math.sqrt(dxUser * dxUser + dzUser * dzUser);
            if (distToUser > 1e-3) {
              const angleToUser = Math.atan2(dxUser, dzUser);

              // Raycast to confirm user direction isn't blocked by room geometry.
              // In lightweight mode, skip this expensive check to prevent walk-start spikes.
              let canSeeUser = true;
              if (!LIGHTWEIGHT_WALKING_MODE) {
                canSeeUser = this.cachedCanSeeUser;
                if (this.lookRaycastCooldown <= 0) {
                  canSeeUser = true;
                  const roomModel = (globalThis as any).__labRoomModel as
                    | Object3D
                    | undefined;

                  if (roomModel) {
                    const originW = this.roomLocalToWorld(
                      record.model.position.x,
                      record.model.position.y,
                      record.model.position.z,
                    );
                    const userW = this.roomLocalToWorld(
                      userLocal.x,
                      record.model.position.y,
                      userLocal.z,
                    );
                    const dirW = new Vector3(
                      userW.x - originW.x,
                      0,
                      userW.z - originW.z,
                    );
                    const dirLen = dirW.length();
                    if (dirLen > 1e-6) {
                      dirW.normalize();
                      this.lookRaycaster.set(
                        new Vector3(originW.x, originW.y + 0.2, originW.z),
                        dirW,
                      );
                      this.lookRaycaster.near = 0;
                      this.lookRaycaster.far = distToUser + 0.05;
                      const hits = this.lookRaycaster.intersectObject(
                        roomModel as any,
                        true,
                      );
                      // If we hit room geometry significantly before reaching user distance,
                      // consider the view blocked and keep waypoint-facing.
                      if (hits.length > 0 && hits[0].distance < distToUser - 0.1) {
                        canSeeUser = false;
                      }
                    }
                  }

                  this.cachedCanSeeUser = canSeeUser;
                  this.lookRaycastCooldown = 0.2;
                }
              }

              if (canSeeUser) {
                targetAngle = angleToUser;
                record.walkDirection.set(
                  dxUser / distToUser,
                  0,
                  dzUser / distToUser,
                );
              }
            }
          }
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
            const velocity = WALK_VELOCITY;
            const moveX = record.walkDirection.x * velocity * dt;
            const moveZ = record.walkDirection.z * velocity * dt;

            const oldLocalX = record.model.position.x;
            const oldLocalZ = record.model.position.z;
            const newLocalX = oldLocalX + moveX;
            const newLocalZ = oldLocalZ + moveZ;

            // Collision check in world space (raycaster needs world matrices)
            const oldW = this.roomLocalToWorld(
              oldLocalX,
              record.model.position.y,
              oldLocalZ,
            );
            const newW = this.roomLocalToWorld(
              newLocalX,
              record.model.position.y,
              newLocalZ,
            );
            const constrained = constrainMovement(
              new Vector3(oldW.x, oldW.y, oldW.z),
              new Vector3(newW.x, newW.y, newW.z),
              ROBOT_RADIUS,
              ROBOT_HEIGHTS,
            );
            let cLocal = this.worldToRoomLocal(
              constrained.x,
              constrained.y,
              constrained.z,
            );
            if (
              this.walkingToUser &&
              this.trackUserWhileWalking &&
              this.world.camera
            ) {
              const cam = this.world.camera as {
                position: { x: number; y: number; z: number };
              };
              const uLoc = this.worldToRoomLocal(
                cam.position.x,
                cam.position.y,
                cam.position.z,
              );
              const pushed = this.clampRobotOutsideUserPersonalSpace(
                cLocal.x,
                cLocal.z,
                uLoc.x,
                uLoc.z,
              );
              cLocal = { x: pushed.x, y: cLocal.y, z: pushed.z };
            }
            record.model.position.x = cLocal.x;
            record.model.position.z = cLocal.z;

            // ── Forward Scan for Early Avoidance ──
            if (
              !LIGHTWEIGHT_WALKING_MODE &&
              collisionCooldown <= 0 &&
              currentDistanceToTarget > 0.01 &&
              this.forwardScanCooldown <= 0
            ) {
              const SCAN_DIST = Math.min(0.5, currentDistanceToTarget);
              const scanLocalX = cLocal.x + record.walkDirection.x * SCAN_DIST;
              const scanLocalZ = cLocal.z + record.walkDirection.z * SCAN_DIST;
              const scanW = this.roomLocalToWorld(
                scanLocalX,
                record.model.position.y,
                scanLocalZ,
              );

              const scanConstrained = constrainMovement(
                new Vector3(constrained.x, constrained.y, constrained.z),
                new Vector3(scanW.x, scanW.y, scanW.z),
                ROBOT_RADIUS,
                ROBOT_HEIGHTS,
              );

              const blockDist = Math.sqrt(
                (scanW.x - scanConstrained.x) ** 2 +
                (scanW.z - scanConstrained.z) ** 2,
              );
              if (blockDist > 0.15) {
                if (this.walkingToUser) {
                  if (
                    this.stepAsideAttempts <
                    RobotAssistantSystem.MAX_STEP_ASIDE_ATTEMPTS
                  ) {
                    console.log(
                      `[RobotAssistant] 👁️ Forward scan detected obstacle while walking to user - stepping aside early (attempt ${this.stepAsideAttempts + 1}/${RobotAssistantSystem.MAX_STEP_ASIDE_ATTEMPTS}).`,
                    );
                    this.stepAsideAttempts++;
                    this.triggerStepAside(
                      record,
                      entity,
                      cLocal.x,
                      cLocal.z,
                      dx,
                      dz,
                      targetX,
                      targetZ,
                    );
                    collisionCooldown = 0.5;
                    entity.setValue(
                      RobotAssistantComponent,
                      "collisionCooldown",
                      collisionCooldown,
                    );
                  }
                } else if (!this.behaviorScriptWalkRoutine) {
                  console.log(
                    `[RobotAssistant] 👁️ Forward scan detected obstacle - repathing early.`,
                  );
                  this.consecutiveRepaths++;
                  this.lastRepathTime = this.timeElapsed;
                  const newTarget = this.pickSmartWaypoint(cLocal.x, cLocal.z);
                  entity.setValue(
                    RobotAssistantComponent,
                    "targetX",
                    newTarget.x,
                  );
                  entity.setValue(
                    RobotAssistantComponent,
                    "targetZ",
                    newTarget.z,
                  );
                  entity.setValue(
                    RobotAssistantComponent,
                    "hasReachedTarget",
                    false,
                  );
                  entity.setValue(RobotAssistantComponent, "stuckTime", 0);
                  collisionCooldown = 0.5;
                  entity.setValue(
                    RobotAssistantComponent,
                    "collisionCooldown",
                    collisionCooldown,
                  );
                }
              }
              this.forwardScanCooldown = 0.15;
            }
            // ──────────────────────────────────────

            // Track blocked direction for smart repathing (autonomous walking)
            // For walkingToUser, use immediate collision response with step-aside
            const movedDist = Math.sqrt(
              (cLocal.x - oldLocalX) ** 2 + (cLocal.z - oldLocalZ) ** 2,
            );

            if (this.walkingToUser) {
              // Immediate collision response for walkingToUser
              if (
                collisionCooldown <= 0 &&
                (Math.abs(cLocal.x - newLocalX) > 0.001 ||
                  Math.abs(cLocal.z - newLocalZ) > 0.001)
              ) {
                // Only trigger step-aside if we haven't exceeded max attempts
                if (
                  this.stepAsideAttempts <
                  RobotAssistantSystem.MAX_STEP_ASIDE_ATTEMPTS
                ) {
                  console.log(
                    `[RobotAssistant] 💥 Hit obstacle while walking to user - recalculating path (attempt ${this.stepAsideAttempts + 1}/${RobotAssistantSystem.MAX_STEP_ASIDE_ATTEMPTS}). From (${oldLocalX.toFixed(2)}, ${oldLocalZ.toFixed(2)}) TargetUser (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`,
                  );
                  this.stepAsideAttempts++;
                  this.triggerStepAside(
                    record,
                    entity,
                    oldLocalX,
                    oldLocalZ,
                    dx,
                    dz,
                    targetX,
                    targetZ,
                  );
                } else {
                  console.warn(
                    `[RobotAssistant] ⚠️ Too many step-aside attempts (${this.stepAsideAttempts}), trying direct path to user`,
                  );
                  // Reset attempts and try direct path again
                  this.stepAsideAttempts = 0;
                  this.stepAsideTarget = null;
                  // Update target to current user position (might have moved)
                  if (this.world.camera) {
                    const cam = this.world.camera as {
                      position: { x: number; y: number; z: number };
                    };
                    const userLocal = this.worldToRoomLocal(
                      cam.position.x,
                      cam.position.y,
                      cam.position.z,
                    );
                    const approach = this.computeUserApproachLocalTarget(
                      oldLocalX,
                      oldLocalZ,
                      userLocal.x,
                      userLocal.z,
                    );
                    const safe = this.resolveSafeLocalTarget(
                      oldLocalX,
                      oldLocalZ,
                      approach.x,
                      approach.z,
                    );
                    entity.setValue(
                      RobotAssistantComponent,
                      "targetX",
                      safe.x,
                    );
                    entity.setValue(
                      RobotAssistantComponent,
                      "targetZ",
                      safe.z,
                    );
                    entity.setValue(
                      RobotAssistantComponent,
                      "collisionCooldown",
                      0.5,
                    );
                  }
                }
              }
            } else if (!this.behaviorScriptWalkRoutine) {
              // For autonomous walking, track blocked direction for smart repathing
              if (movedDist < 0.003) {
                // Fully blocked → remember this direction
                this.recordBlockedDir(moveX, moveZ);
              }
            }
            // Clamp to walkable area
            const [clampedX, clampedZ] = clampToWalkableArea(
              record.model.position.x,
              record.model.position.z,
            );
            record.model.position.x = isNaN(clampedX)
              ? record.model.position.x
              : clampedX;
            record.model.position.z = isNaN(clampedZ)
              ? record.model.position.z
              : clampedZ;
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
        !this.isBehaviorScriptMode() &&
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
        const safeTarget = this.resolveSafeLocalTarget(
          record.model.position.x,
          record.model.position.z,
          newTargetX,
          newTargetZ,
        );

        entity.setValue(RobotAssistantComponent, "targetX", safeTarget.x);
        entity.setValue(RobotAssistantComponent, "targetZ", safeTarget.z);
        entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
        entity.setValue(
          RobotAssistantComponent,
          "nextWaypointTime",
          this.timeElapsed + WAYPOINT_INTERVAL + Math.random() * 4.0,
        );
        console.log(
          `[RobotAssistant] 🎯 New waypoint: (${safeTarget.x.toFixed(2)}, ${safeTarget.z.toFixed(2)})`,
        );
      }

      // ── Stuck Detection & Recovery ────────────────────────
      // Count up "stuckTime" while position barely changes.
      // When threshold exceeded & cooldown allows → smart repath.
      // After too many repaths → forced Idle pause.
      if (this.idlePauseRemaining > 0) {
        // Forced idle — count down and skip movement
        this.idlePauseRemaining -= dt;
        if (this.idlePauseRemaining <= 0) {
          this.idlePauseRemaining = 0;
          // Do not reset consecutiveRepaths here — we want it to reach MAX_REPATHS_BEFORE_RESPAWN if permanently stuck.
          this.recentBlockedDirs.length = 0; // fresh start
          // Pick a brand-new random waypoint (centre-biased)
          const bounds = getRoomBounds();
          if (bounds) {
            const cx = (bounds.minX + bounds.maxX) * 0.5;
            const cz = (bounds.minZ + bounds.maxZ) * 0.5;
            const rx = (bounds.maxX - bounds.minX) * 0.3;
            const rz = (bounds.maxZ - bounds.minZ) * 0.3;
            entity.setValue(
              RobotAssistantComponent,
              "targetX",
              cx + (Math.random() - 0.5) * rx,
            );
            entity.setValue(
              RobotAssistantComponent,
              "targetZ",
              cz + (Math.random() - 0.5) * rz,
            );
          }
          entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
          this.fadeToAction(record, "Walking", FADE_DURATION);
          entity.setValue(RobotAssistantComponent, "currentState", "Walking");
          console.log("[RobotAssistant] 💤 Idle pause over — resuming walk");
        }
      } else if (currentState === "Walking") {
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

        const distMoved = Math.sqrt(
          (currentX - lastX) ** 2 + (currentZ - lastZ) ** 2,
        );

        // Immediate collision trigger: tried to move but barely moved at all
        // Also ensure dx/dz was large enough to expect movement
        const intendedDist = Math.sqrt(dx * dx + dz * dz);
        const hardCollision =
          distMoved < 0.002 &&
          intendedDist > 0.01 &&
          this.timeElapsed - this.lastRepathTime > REPATH_COOLDOWN_SEC;

        if (distMoved < 0.005) {
          stuckTime += dt;
        } else {
          stuckTime = Math.max(0, stuckTime - dt * 2);
          // Making progress → reset consecutive repaths
          if (distMoved > 0.02) this.consecutiveRepaths = 0;
        }

        entity.setValue(RobotAssistantComponent, "stuckTime", stuckTime);
        entity.setValue(RobotAssistantComponent, "lastX", currentX);
        entity.setValue(RobotAssistantComponent, "lastZ", currentZ);

        // Only repath if stuck long enough AND cooldown has elapsed
        // OR if an immediate hard collision was detected
        // For walkingToUser, use step-aside instead of smart repathing
        const canRepath =
          (stuckTime > STUCK_THRESHOLD_SEC || hardCollision) &&
          this.timeElapsed - this.lastRepathTime > REPATH_COOLDOWN_SEC &&
          !this.walkingToUser &&
          !this.behaviorScriptWalkRoutine;

        if (canRepath) {
          this.consecutiveRepaths++;
          this.lastRepathTime = this.timeElapsed;

          if (this.consecutiveRepaths >= MAX_REPATHS_BEFORE_RESPAWN) {
            const spawn = this.findRandomSpawnPosition();
            record.model.position.set(
              spawn.x,
              record.model.position.y,
              spawn.z,
            );
            const groundedRespawnY = this.alignRobotFeetToFloor(
              record.model,
              spawn.y,
            );
            record.lastRoomLocalPos = null;
            this.consecutiveRepaths = 0;

            // Give it a fresh waypoint from the spawn point
            const newTarget = this.pickSmartWaypoint(spawn.x, spawn.z);
            entity.setValue(RobotAssistantComponent, "targetX", newTarget.x);
            entity.setValue(RobotAssistantComponent, "targetZ", newTarget.z);
            entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
            entity.setValue(RobotAssistantComponent, "baseY", groundedRespawnY);
            entity.setValue(RobotAssistantComponent, "stuckTime", 0);

            console.log(
              `[RobotAssistant] 🚨 Permanently stuck after ${this.consecutiveRepaths} repaths — forcefully respawned to (${spawn.x.toFixed(2)}, ${spawn.z.toFixed(2)})`,
            );
          } else if (this.consecutiveRepaths >= MAX_REPATHS_BEFORE_IDLE) {
            // Too many failed repaths — pause in Idle
            this.idlePauseRemaining = IDLE_PAUSE_SEC;
            this.fadeToAction(record, "Idle", FADE_DURATION);
            entity.setValue(RobotAssistantComponent, "currentState", "Idle");
            entity.setValue(RobotAssistantComponent, "stuckTime", 0);
            console.log(
              `[RobotAssistant] 💤 Stuck after ${this.consecutiveRepaths} repaths — idling for ${IDLE_PAUSE_SEC}s`,
            );
          } else {
            const newTarget = this.pickSmartWaypoint(currentX, currentZ);
            entity.setValue(RobotAssistantComponent, "targetX", newTarget.x);
            entity.setValue(RobotAssistantComponent, "targetZ", newTarget.z);
            entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
            entity.setValue(RobotAssistantComponent, "stuckTime", 0);
            console.log(
              `[RobotAssistant] 🔀 Repath #${this.consecutiveRepaths} → (${newTarget.x.toFixed(2)}, ${newTarget.z.toFixed(2)})`,
            );
          }
        } else if (
          this.walkingToUser &&
          (stuckTime > 1.0 || hardCollision) &&
          this.timeElapsed - this.lastRepathTime > REPATH_COOLDOWN_SEC
        ) {
          // For walkingToUser, use step-aside instead of smart repathing
          if (
            this.stepAsideAttempts <
            RobotAssistantSystem.MAX_STEP_ASIDE_ATTEMPTS
          ) {
            console.log(
              `[RobotAssistant] ⚠️ Stuck while walking to user - forcing new step aside (attempt ${this.stepAsideAttempts + 1}/${RobotAssistantSystem.MAX_STEP_ASIDE_ATTEMPTS}). Current Target: (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`,
            );
            this.stepAsideAttempts++;
            this.lastRepathTime = this.timeElapsed;
            this.triggerStepAside(
              record,
              entity,
              currentX,
              currentZ,
              dx,
              dz,
              targetX,
              targetZ,
            );
            entity.setValue(RobotAssistantComponent, "stuckTime", 0);
          } else {
            // Too many attempts - try updating to current user position
            console.warn(
              `[RobotAssistant] ⚠️ Too many step-aside attempts while stuck, updating to current user position`,
            );
            this.stepAsideAttempts = 0;
            this.stepAsideTarget = null;
            if (this.world.camera) {
              const cam = this.world.camera as {
                position: { x: number; y: number; z: number };
              };
              const userLocal = this.worldToRoomLocal(
                cam.position.x,
                cam.position.y,
                cam.position.z,
              );
              const approach = this.computeUserApproachLocalTarget(
                currentX,
                currentZ,
                userLocal.x,
                userLocal.z,
              );
              const safe = this.resolveSafeLocalTarget(
                currentX,
                currentZ,
                approach.x,
                approach.z,
              );
              entity.setValue(RobotAssistantComponent, "targetX", safe.x);
              entity.setValue(RobotAssistantComponent, "targetZ", safe.z);
              entity.setValue(RobotAssistantComponent, "stuckTime", 0);
              entity.setValue(
                RobotAssistantComponent,
                "collisionCooldown",
                0.5,
              );
            }
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
      const finalRoomLocal = {
        x: record.model.position.x,
        y: record.model.position.y,
        z: record.model.position.z,
      };
      const worldPos = this.roomLocalToWorld(
        finalRoomLocal.x,
        finalRoomLocal.y,
        finalRoomLocal.z,
      );
      record.model.position.set(worldPos.x, worldPos.y, worldPos.z);
      // Add room rotation to the robot's facing direction
      record.model.rotation.y += roomRotY;

      // Update last known room-local position for next frame's warp prevention
      record.lastRoomLocalPos = { ...finalRoomLocal };
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
    dzUser: number,
    targetX: number,
    targetZ: number,
  ) {
    // Get current user position for better pathfinding (use latest camera position)
    let userTargetX = targetX;
    let userTargetZ = targetZ;
    if (this.world.camera) {
      const cam = this.world.camera as {
        position: { x: number; y: number; z: number };
      };
      const userLocal = this.worldToRoomLocal(
        cam.position.x,
        cam.position.y,
        cam.position.z,
      );
      userTargetX = userLocal.x;
      userTargetZ = userLocal.z;
    }

    // Calculate distance to user from current position
    const currentDistToUser = Math.sqrt(
      (userTargetX - currentX) ** 2 + (userTargetZ - currentZ) ** 2,
    );

    // Normalize direction to user
    const dist = Math.sqrt(dxUser * dxUser + dzUser * dzUser);
    const dirX = dist > 0 ? dxUser / dist : 1;
    const dirZ = dist > 0 ? dzUser / dist : 0;

    // Optimized: Try fewer escape directions (3 angles, 2 distances, 2 sides = 12 total instead of 30)
    const escapeAngles = [
      Math.PI / 2, // 90 degrees (perpendicular)
      Math.PI / 2 + 0.4, // ~113 degrees
      Math.PI / 2 - 0.4, // ~67 degrees
    ];
    const escapeDistances = [1.8, 2.2]; // Just 2 distances

    let bestTarget: { x: number; z: number } | null = null;
    let bestScore = -Infinity;
    let bestProgressTarget: { x: number; z: number } | null = null;
    let bestProgressScore = -Infinity;

    // Try each combination (limited set)
    for (const angle of escapeAngles) {
      for (const escapeDist of escapeDistances) {
        // Try both left and right
        for (const sign of [-1, 1]) {
          const adjustedAngle = angle * sign;
          const cosA = Math.cos(adjustedAngle);
          const sinA = Math.sin(adjustedAngle);

          const perpX = dirX * cosA - dirZ * sinA;
          const perpZ = dirX * sinA + dirZ * cosA;

          let candidateX = currentX + perpX * escapeDist;
          let candidateZ = currentZ + perpZ * escapeDist;

          // Clamp to walkable area
          let [clampedX, clampedZ] = clampToWalkableArea(
            candidateX,
            candidateZ,
          );
          if (
            this.isLocalPointInKeepOut(clampedX, clampedZ) ||
            this.doesLocalSegmentCrossKeepOut(
              currentX,
              currentZ,
              clampedX,
              clampedZ,
            )
          ) {
            continue;
          }

          // Skip if clamped position is too close to current position
          const distToTarget = Math.sqrt(
            (clampedX - currentX) ** 2 + (clampedZ - currentZ) ** 2,
          );
          if (distToTarget < 0.3) continue;

          // Calculate how much closer this candidate gets us to the user
          const candidateDistToUser = Math.sqrt(
            (userTargetX - clampedX) ** 2 + (userTargetZ - clampedZ) ** 2,
          );
          const progressTowardUser = currentDistToUser - candidateDistToUser; // Positive = closer to user

          // Score this candidate: balance obstacle avoidance with progress toward user
          // When blocked, we need to prioritize clearing the obstacle first, then moving toward user
          let score = 0;

          // Base score: prefer paths that move us away from the obstacle (perpendicular movement)
          // This is important - we need to clear the obstacle first
          const perpComponent = Math.abs(
            (clampedX - currentX) * -dirZ + (clampedZ - currentZ) * dirX,
          );
          score += perpComponent * 3; // Strong preference for perpendicular movement (around obstacle)

          // Bonus for making progress toward user (preferred when possible)
          if (progressTowardUser > 0) {
            score += progressTowardUser * 8; // Good bonus for getting closer
          } else if (progressTowardUser > -0.5) {
            // Small penalty for slight detour (acceptable if it clears obstacle)
            score += progressTowardUser * 2; // Small penalty, but not too harsh
          } else {
            // Larger penalty for moving significantly away from user
            score -= Math.abs(progressTowardUser) * 3;
          }

          // Bonus for moving in a direction that's somewhat toward user (even if perpendicular)
          const towardUser =
            (clampedX - currentX) * dirX + (clampedZ - currentZ) * dirZ;
          if (towardUser > 0) {
            score += towardUser * 2; // Bonus for forward component
          }

          // Bonus for distance moved (helps clear obstacle)
          score += distToTarget * 1.0;

          // Small randomness to break ties
          score += Math.random() * 0.3;

          if (progressTowardUser > 0.05 && score > bestProgressScore) {
            bestProgressScore = score;
            bestProgressTarget = { x: clampedX, z: clampedZ };
          }

          if (score > bestScore) {
            bestScore = score;
            bestTarget = { x: clampedX, z: clampedZ };
          }
        }
      }
    }

    // Prefer candidates that still make positive progress toward user.
    // If none are available, use best obstacle-clearing candidate.
    const chosenTarget = bestProgressTarget ?? bestTarget;
    if (chosenTarget) {
      this.stepAsideTarget = chosenTarget;
      entity.setValue(RobotAssistantComponent, "targetX", chosenTarget.x);
      entity.setValue(RobotAssistantComponent, "targetZ", chosenTarget.z);
      console.log(
        `[RobotAssistant] ✅ Selected step-aside path: (${chosenTarget.x.toFixed(2)}, ${chosenTarget.z.toFixed(2)}) - score: ${(bestProgressTarget ? bestProgressScore : bestScore).toFixed(2)}${bestProgressTarget ? " (toward user)" : ""}`,
      );
    } else {
      // Fallback: try perpendicular directions but strongly prefer the one that gets us closer to user
      const fallbackDist = 2.0;
      let bestFallback: { x: number; z: number } | null = null;
      let bestFallbackScore = -Infinity;
      let bestFallbackProgress = -Infinity;

      // Try both left and right perpendicular
      for (const sign of [-1, 1]) {
        const perpX = -dirZ * sign;
        const perpZ = dirX * sign;
        let newTargetX = currentX + perpX * fallbackDist;
        let newTargetZ = currentZ + perpZ * fallbackDist;
        let [clampedX, clampedZ] = clampToWalkableArea(newTargetX, newTargetZ);
        if (
          this.isLocalPointInKeepOut(clampedX, clampedZ) ||
          this.doesLocalSegmentCrossKeepOut(currentX, currentZ, clampedX, clampedZ)
        ) {
          continue;
        }

        // Calculate progress toward user
        const fallbackDistToUser = Math.sqrt(
          (userTargetX - clampedX) ** 2 + (userTargetZ - clampedZ) ** 2,
        );
        const fallbackProgress = currentDistToUser - fallbackDistToUser;

        // Score: balance perpendicular movement (obstacle clearing) with progress toward user
        let score = 2.0; // Base score for perpendicular movement (clearing obstacle)
        if (fallbackProgress > 0) {
          score += fallbackProgress * 3; // Bonus if it also gets closer
        } else if (fallbackProgress > -0.5) {
          score += fallbackProgress * 1; // Small penalty for slight detour (acceptable)
        } else {
          score -= Math.abs(fallbackProgress) * 2; // Larger penalty for moving away
        }
        score += Math.random() * 0.1;

        if (fallbackProgress > bestFallbackProgress) {
          bestFallbackProgress = fallbackProgress;
        }
        if (score > bestFallbackScore) {
          bestFallbackScore = score;
          bestFallback = { x: clampedX, z: clampedZ };
        }
      }

      if (bestFallback && bestFallbackProgress > -0.05) {
        this.stepAsideTarget = bestFallback;
        entity.setValue(RobotAssistantComponent, "targetX", bestFallback.x);
        entity.setValue(RobotAssistantComponent, "targetZ", bestFallback.z);
        console.log(
          `[RobotAssistant] ✅ Fallback step-aside path: (${bestFallback.x.toFixed(2)}, ${bestFallback.z.toFixed(2)})`,
        );
      } else {
        // Last resort: retarget the personal-space ring (not the camera origin).
        const approach = this.computeUserApproachLocalTarget(
          currentX,
          currentZ,
          userTargetX,
          userTargetZ,
        );
        const safeTarget = this.resolveSafeLocalTarget(
          currentX,
          currentZ,
          approach.x,
          approach.z,
        );
        this.stepAsideTarget = { x: safeTarget.x, z: safeTarget.z };
        entity.setValue(RobotAssistantComponent, "targetX", safeTarget.x);
        entity.setValue(RobotAssistantComponent, "targetZ", safeTarget.z);
        console.log(
          `[RobotAssistant] ⚠️ No good detour found, retrying safe walk-to-user target: (${safeTarget.x.toFixed(2)}, ${safeTarget.z.toFixed(2)})`,
        );
      }
    }

    console.log(
      `[RobotAssistant] 🔀 Step aside target: (${this.stepAsideTarget.x.toFixed(2)}, ${this.stepAsideTarget.z.toFixed(2)}) [Attempt ${this.stepAsideAttempts}]`,
    );

    entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
    entity.setValue(RobotAssistantComponent, "collisionCooldown", 0.8); // Shorter CD for faster recovery
    entity.setValue(RobotAssistantComponent, "stuckTime", 0);

    console.log(
      `[RobotAssistant] 🔀 Step aside target: (${this.stepAsideTarget.x.toFixed(2)}, ${this.stepAsideTarget.z.toFixed(2)}) [Attempt ${this.stepAsideAttempts}]`,
    );
  }

  /** Notify VoicePanelSystem to add a message to the dialogue overlay */
  private notifyDialogueMessage(message: string): void {
    const voicePanelSystem = (globalThis as any).__voicePanelSystem;
    if (
      voicePanelSystem &&
      typeof voicePanelSystem.addRobotMessage === "function"
    ) {
      voicePanelSystem.addRobotMessage(message);
    }
  }

  /** Get instruction text for a topic (same mapping as VoiceTextToSpeech) */
  private getInstructionText(topic: string): string | null {
    const INSTRUCTION_TEXTS: Record<string, string> = {
      control:
        "You can control your devices in two simple ways: by voice or from the panel. Say 'how do I use voice?' for the microphone, or 'how do I use the panel?' for the on-screen controls. Don't worry, I'm here to help you every step of the way.",
      panel:
        "This is your control panel. It shows all your smart home devices in one place. You can tap any device to open its controls, or use the microphone for voice commands. The status text at the bottom shows what the system is doing. You have one main panel that's easy to use.",
      voice:
        "Using voice is simple. Tap the microphone button and wait for me to say 'How can I help you?'. Then you can say things like 'turn on the fan', 'turn off the light', or 'set the temperature to twenty-four'. When you're done, tap the microphone again to stop listening. It's that easy!",
      on_off:
        "Turning devices on or off is very simple. You have two ways: first, tap the device on the panel and use the on/off switch you'll see. Or second, just say 'turn on the fan' or 'turn off the light' using the microphone. Both ways work great!",
      usage_graph:
        "You can see how your devices are being used over time. Just open a device on the panel and look for the usage or graph option. This shows you helpful information about when and how much you use each device.",
      fan: "The fan is easy to control. You can turn it on or off from the panel or by saying 'turn on the fan' or 'turn off the fan'. On the panel, you'll see speed and swing controls. You can also say 'set fan speed to two' or 'turn on swing'. If you want to see how much you've used the fan, check the usage view.",
      light:
        "The light is simple to use. You can turn it on or off from the panel or by voice. On the panel, you'll find brightness and colour controls. You can also say 'set brightness to fifty' or 'set colour to red'. The usage view shows you how much you've used the light.",
      television:
        "The TV is straightforward to control. You can turn it on or off from the panel or by voice. On the panel, you'll see volume, channel, and mute controls. You can also say 'set volume to fifty', 'set channel to five', or 'mute the TV'. Check the usage view to see your TV watching habits.",
      ac: "The air conditioner is easy to manage. You can turn it on or off from the panel or by voice. On the panel, you'll find the temperature control. You can also say 'set temperature to twenty-four'. The usage view shows you how much energy the AC has used.",
      getting_started:
        "Welcome! Let's get you started. First, you can see your devices on the main panel. To control them, you can either tap on them or use the microphone button to give voice commands. Try saying 'how do I use voice?' to learn about voice commands, or 'how do I use the panel?' to learn about the on-screen controls. I'm here to help, so feel free to ask me anything!",
      what_can_you_do:
        "I'm your friendly robot assistant, and I'm here to help you with your smart home! I can explain how to use the panel, how to give voice commands, and how to control all your devices like the fan, light, TV, and air conditioner. I can walk you through step-by-step instructions, help you troubleshoot problems, and answer any questions you have. Just ask me anything, and I'll do my best to help you. What would you like to know?",
      navigation:
        "Let me help you find your way around. The main panel shows all your devices - you'll see it on your screen. To access the welcome panel with all the main controls, press the W key on your keyboard or click the house icon button in the top right corner. The microphone button is usually at the bottom of the screen. If you're ever lost, just ask me 'what can you do?' and I'll guide you. Don't worry, it's simpler than it sounds!",
      welcome_panel:
        "The welcome panel is your main control center. To open it, press the W key on your keyboard, or click the small house icon button in the top right corner of your screen. This panel shows your user information, device statistics, and important buttons like entering AR mode, switching between VR and AR, accessing devices, refreshing, and aligning the room. You can close it anytime by clicking the X button on the panel or pressing W again.",
      troubleshooting:
        "I'm sorry you're having trouble. Let me help you fix it. First, try refreshing the page or saying 'refresh devices'. If a device isn't responding, make sure it's turned on from the panel. If voice commands aren't working, check that the microphone button is active and you're speaking clearly. If the panel isn't showing, press W to open the welcome panel. If nothing works, try closing and reopening the application. Don't worry, we'll figure this out together. What specific problem are you having?",
      device_info:
        "I can tell you about your devices. You can ask me 'how many devices do I have?' to get a count, or 'what devices do I have?' to see a list. I can also help you control them or explain how to use each one.",
      fallback:
        "I'm here to help you! I can explain the panel, voice commands, and all your devices like the fan, light, TV, and air conditioner. You can ask me 'how do I control?' for an overview, or ask about a specific device like 'how do I use the fan?'. You can also ask 'what can you do?' to see all the ways I can help you, or 'how many devices do I have?' to learn about your devices. What would you like to know about?",
    };
    return INSTRUCTION_TEXTS[topic] || null;
  }
}
