import {
    createSystem,
    Entity,
    Object3D,
    AssetManager,
    AnimationMixer,
    AnimationAction,
} from "@iwsdk/core";

import { Box3, Quaternion, Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import { NPCAvatarComponent } from "../components/NPCAvatarComponent";
import { clampToWalkableArea, getRoomBounds } from "../config/navmesh";

// ============================================================================
// CONFIG
// ============================================================================

const FADE_DURATION = 0.2;
const DEFAULT_WALK_VELOCITY = 0.4; // Slightly slower than robot assistant
const ROTATE_SPEED = 0.12;
const WAYPOINT_REACH_DISTANCE = 0.5;
const WAYPOINT_INTERVAL_MIN = 6.0;
const WAYPOINT_INTERVAL_MAX = 12.0;
const IDLE_PAUSE_MIN = 2.0; // Minimum idle pause at waypoint
const IDLE_PAUSE_MAX = 5.0; // Maximum idle pause at waypoint

// RPM model faces backward by default; rotate 180°
const RPM_FORWARD_OFFSET = Math.PI;

// ============================================================================
// NPC RECORD
// ============================================================================

interface NPCAvatarRecord {
    entity: Entity;
    model: Object3D;
    mixer: AnimationMixer;
    animationsMap: Map<string, AnimationAction>;
    currentAction: string;
    walkDirection: Vector3;
    rotateAngle: Vector3;
    rotateQuaternion: Quaternion;
    moveSpeed: number;
    // Idle pause tracking
    idlePauseUntil: number;
}

// ============================================================================
// NPC AVATAR SYSTEM
// ============================================================================

export class NPCAvatarSystem extends createSystem({
    npcs: {
        required: [NPCAvatarComponent],
    },
}) {
    private npcRecords: Map<string, NPCAvatarRecord> = new Map();
    private timeElapsed = 0;

    init() {
        console.log("[NPCAvatar] System initialized (autonomous RPM NPC behavior)");
    }

    async createNPCAvatar(
        npcId: string,
        npcName: string,
        modelKey: string,
        position: [number, number, number],
        moveSpeed?: number
    ): Promise<Entity | null> {
        try {
            const gltf = AssetManager.getGLTF(modelKey);
            if (!gltf) {
                console.error(`[NPCAvatar] Model not found: ${modelKey}`);
                return null;
            }

            // Align to room bounds (same pattern as RobotAssistantSystem)
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

                console.log(`[NPCAvatar] 📍 Spawning ${npcName} at`, { finalX, finalY, finalZ });
            } else {
                console.warn(`[NPCAvatar] ⚠️ Room bounds not initialized; using raw position`);
            }

            const npcModel = SkeletonUtils.clone(gltf.scene) as Object3D;
            npcModel.scale.setScalar(0.5);
            npcModel.position.set(finalX, finalY, finalZ);
            npcModel.rotation.set(0, 0, 0);
            npcModel.visible = true;

            this.world.scene.add(npcModel);

            // Floor alignment using bounding box (same as RPMUserControlledAvatarSystem)
            const box = new Box3().setFromObject(npcModel as any);
            const targetFloorY = roomBounds ? roomBounds.floorY : finalY;
            const feetY = targetFloorY - box.min.y + finalY;
            npcModel.position.y = feetY;

            // Set up animations
            const clips: unknown[] = Array.isArray(gltf.animations) ? gltf.animations : [];
            const rawClipNames = clips.map((c: any) => c?.name ?? "(no name)");
            console.log(`[NPCAvatar] 📋 ${npcName} — clips:`, rawClipNames);

            const mixer = new AnimationMixer(npcModel);
            const animationsMap = new Map<string, AnimationAction>();

            for (const clip of clips) {
                const c = clip as { name?: string };
                if (!c.name || c.name === "TPose" || c.name.toLowerCase() === "tpose") continue;
                const action = mixer.clipAction(clip as any);
                if (action) {
                    animationsMap.set(c.name, action);
                }
            }

            console.log(`[NPCAvatar] 🎬 ${npcName} — animations:`, Array.from(animationsMap.keys()));

            // Create entity
            const entity = this.world.createTransformEntity(npcModel);

            // Pick initial random waypoint within room
            const bounds = getRoomBounds();
            const targetX = bounds
                ? (bounds.minX + Math.random() * (bounds.maxX - bounds.minX))
                : (finalX + (Math.random() - 0.5) * 4);
            const targetZ = bounds
                ? (bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ))
                : (finalZ + (Math.random() - 0.5) * 4);

            const speed = moveSpeed ?? DEFAULT_WALK_VELOCITY;

            entity.addComponent(NPCAvatarComponent, {
                npcId,
                npcName,
                baseY: feetY,
                currentState: "Walking",
                targetX,
                targetZ,
                moveSpeed: speed,
                hasReachedTarget: false,
                nextWaypointTime: this.timeElapsed + WAYPOINT_INTERVAL_MIN + Math.random() * (WAYPOINT_INTERVAL_MAX - WAYPOINT_INTERVAL_MIN),
            });

            // Start with Walking animation
            const walkActionName = animationsMap.has("Walk") ? "Walk" : animationsMap.has("Walking") ? "Walking" : null;
            if (walkActionName) {
                animationsMap.get(walkActionName)!.play();
            }

            const record: NPCAvatarRecord = {
                entity,
                model: npcModel,
                mixer,
                animationsMap,
                currentAction: walkActionName || "Idle",
                walkDirection: new Vector3(),
                rotateAngle: new Vector3(0, 1, 0),
                rotateQuaternion: new Quaternion(),
                moveSpeed: speed,
                idlePauseUntil: 0,
            };
            this.npcRecords.set(npcId, record);

            console.log(`[NPCAvatar] ✅ Created: ${npcName} (speed: ${speed}, animations: ${Array.from(animationsMap.keys()).join(", ")})`);
            return entity;
        } catch (error) {
            console.error(`[NPCAvatar] Failed to create ${npcName}:`, error);
            return null;
        }
    }

    private fadeToAction(record: NPCAvatarRecord, name: string, duration: number): void {
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

    private getWalkAnimationName(record: NPCAvatarRecord): string | null {
        if (record.animationsMap.has("Walk")) return "Walk";
        if (record.animationsMap.has("Walking")) return "Walking";
        return null;
    }

    update(dt: number): void {
        this.timeElapsed += dt;

        for (const [npcId, record] of this.npcRecords) {
            // Always update mixer
            record.mixer.update(dt);

            const entity = record.entity;
            const currentState = entity.getValue(NPCAvatarComponent, "currentState") as string;
            const targetX = entity.getValue(NPCAvatarComponent, "targetX") as number;
            const targetZ = entity.getValue(NPCAvatarComponent, "targetZ") as number;
            const hasReachedTarget = entity.getValue(NPCAvatarComponent, "hasReachedTarget") as boolean;
            const nextWaypointTime = entity.getValue(NPCAvatarComponent, "nextWaypointTime") as number;

            // If in idle pause, wait until pause is over
            if (currentState === "Idle" && this.timeElapsed < record.idlePauseUntil) {
                continue;
            }

            // If idle pause is over, start walking to next waypoint
            if (currentState === "Idle" && this.timeElapsed >= record.idlePauseUntil && record.idlePauseUntil > 0) {
                const walkName = this.getWalkAnimationName(record);
                if (walkName) {
                    this.fadeToAction(record, walkName, FADE_DURATION);
                }
                entity.setValue(NPCAvatarComponent, "currentState", "Walking");
                entity.setValue(NPCAvatarComponent, "hasReachedTarget", false);

                // Pick new waypoint
                const bounds = getRoomBounds();
                const newTargetX = bounds
                    ? (bounds.minX + Math.random() * (bounds.maxX - bounds.minX))
                    : (record.model.position.x + (Math.random() - 0.5) * 4);
                const newTargetZ = bounds
                    ? (bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ))
                    : (record.model.position.z + (Math.random() - 0.5) * 4);

                entity.setValue(NPCAvatarComponent, "targetX", newTargetX);
                entity.setValue(NPCAvatarComponent, "targetZ", newTargetZ);
                entity.setValue(NPCAvatarComponent, "nextWaypointTime",
                    this.timeElapsed + WAYPOINT_INTERVAL_MIN + Math.random() * (WAYPOINT_INTERVAL_MAX - WAYPOINT_INTERVAL_MIN));

                console.log(`[NPCAvatar] 🎯 ${npcId} new waypoint: (${newTargetX.toFixed(2)}, ${newTargetZ.toFixed(2)})`);
                continue;
            }

            // Distance to waypoint
            const dx = targetX - record.model.position.x;
            const dz = targetZ - record.model.position.z;
            const distanceToTarget = Math.sqrt(dx * dx + dz * dz);
            const shouldMove = distanceToTarget > WAYPOINT_REACH_DISTANCE;

            // Arrived at waypoint — switch to Idle and pause
            if (!shouldMove && currentState === "Walking") {
                if (record.animationsMap.has("Idle")) {
                    this.fadeToAction(record, "Idle", FADE_DURATION);
                }
                entity.setValue(NPCAvatarComponent, "currentState", "Idle");
                entity.setValue(NPCAvatarComponent, "hasReachedTarget", true);
                record.idlePauseUntil = this.timeElapsed + IDLE_PAUSE_MIN + Math.random() * (IDLE_PAUSE_MAX - IDLE_PAUSE_MIN);

                console.log(`[NPCAvatar] 📍 ${npcId} reached waypoint, idling for ${(record.idlePauseUntil - this.timeElapsed).toFixed(1)}s`);
                continue;
            }

            // Perform movement
            if (shouldMove && currentState === "Walking") {
                // Rotate toward target (with RPM forward offset)
                record.walkDirection.set(dx / distanceToTarget, 0, dz / distanceToTarget);
                const targetAngle = Math.atan2(dx, dz);
                record.rotateQuaternion.setFromAxisAngle(record.rotateAngle, targetAngle);
                (record.model as any).quaternion.rotateTowards(record.rotateQuaternion, ROTATE_SPEED);

                // Move
                const moveX = record.walkDirection.x * record.moveSpeed * dt;
                const moveZ = record.walkDirection.z * record.moveSpeed * dt;
                record.model.position.x += moveX;
                record.model.position.z += moveZ;

                // Clamp to room bounds
                const [clampedX, clampedZ] = clampToWalkableArea(
                    record.model.position.x,
                    record.model.position.z
                );
                record.model.position.x = clampedX;
                record.model.position.z = clampedZ;
            }

            // Periodic new waypoint (forced, even if not yet reached)
            if (this.timeElapsed >= nextWaypointTime && currentState === "Walking") {
                const bounds = getRoomBounds();
                const newTargetX = bounds
                    ? (bounds.minX + Math.random() * (bounds.maxX - bounds.minX))
                    : (record.model.position.x + (Math.random() - 0.5) * 4);
                const newTargetZ = bounds
                    ? (bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ))
                    : (record.model.position.z + (Math.random() - 0.5) * 4);

                entity.setValue(NPCAvatarComponent, "targetX", newTargetX);
                entity.setValue(NPCAvatarComponent, "targetZ", newTargetZ);
                entity.setValue(NPCAvatarComponent, "hasReachedTarget", false);
                entity.setValue(NPCAvatarComponent, "nextWaypointTime",
                    this.timeElapsed + WAYPOINT_INTERVAL_MIN + Math.random() * (WAYPOINT_INTERVAL_MAX - WAYPOINT_INTERVAL_MIN));

                console.log(`[NPCAvatar] 🎯 ${npcId} periodic waypoint: (${newTargetX.toFixed(2)}, ${newTargetZ.toFixed(2)})`);
            }
        }
    }

    destroy(): void {
        for (const [, record] of this.npcRecords) {
            record.mixer.stopAllAction();
            const obj = record.entity.object3D;
            if (obj?.parent) obj.parent.remove(obj);
            record.entity.destroy();
        }
        this.npcRecords.clear();
        console.log("[NPCAvatar] System destroyed");
    }
}
