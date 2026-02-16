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
import { constrainMovement, AVATAR_COLLISION_RADIUS } from "../config/collision";

// ============================================================================
// CONFIG
// ============================================================================

const FADE_DURATION = 0.2;
const WALK_VELOCITY = 0.5; // Slower than user-controlled avatars
const ROTATE_SPEED = 0.15; // Rotation speed for turning
const WAYPOINT_REACH_DISTANCE = 0.5; // How close to get to waypoint before picking new one
const WAYPOINT_INTERVAL = 8.0; // Pick new waypoint every 8-12 seconds

// Animation categories from the Three.js example
const STATES = ["Idle", "Walking", "Dance", "Death", "Sitting", "Standing"];
const EMOTES = ["Jump", "Yes", "No", "Wave", "Punch", "ThumbsUp"];

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

export class RobotAssistantSystem extends createSystem({
    robots: {
        required: [RobotAssistantComponent],
    },
}) {
    private robotRecords: Map<string, RobotAssistantRecord> = new Map();
    private timeElapsed = 0;

    init() {
        console.log("[RobotAssistant] System initialized (autonomous behavior with pre-baked animations)");
    }

    async createRobotAssistant(
        robotId: string,
        robotName: string,
        modelKey: string,
        position: [number, number, number]
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
                    roomBounds
                );
            } else {
                console.warn(
                    "[RobotAssistant] ⚠️ Room bounds not initialized; using raw world position",
                    position
                );
            }

            const robotModel = SkeletonUtils.clone(gltf.scene) as Object3D;
            robotModel.scale.setScalar(0.1);
            robotModel.position.set(finalX, finalY, finalZ);
            robotModel.rotation.set(0, 0, 0);
            robotModel.visible = true;

            this.world.scene.add(robotModel);
            console.log(`[RobotAssistant] 🔍 Model added to scene, visible: ${robotModel.visible}`);

            // Simple floor alignment - ensure we stay on the computed floor height
            robotModel.position.y = finalY;

            // Debug logging
            console.log(`[RobotAssistant] 🔍 Final position: (${robotModel.position.x.toFixed(2)}, ${robotModel.position.y.toFixed(2)}, ${robotModel.position.z.toFixed(2)})`);
            console.log(`[RobotAssistant] 🔍 Scale: ${robotModel.scale.x}`);

            // Check children and materials
            let meshCount = 0;
            robotModel.traverse((child: any) => {
                if (child.isMesh) {
                    meshCount++;
                    if (meshCount <= 3) {
                        console.log(`[RobotAssistant] 🔍 Mesh "${child.name}": visible=${child.visible}, material=${child.material?.type || 'none'}`);
                    }
                }
            });
            console.log(`[RobotAssistant] 🔍 Total mesh count: ${meshCount}`);
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
                    console.log(`[RobotAssistant] 🤖 Found head mesh with expressions:`, Object.keys(dict));
                    // Set angry, surprised, sad to 0.0
                    if (dict["angry"] !== undefined) influences[dict["angry"]] = 0.0;
                    if (dict["surprised"] !== undefined) influences[dict["surprised"]] = 0.0;
                    if (dict["sad"] !== undefined) influences[dict["sad"]] = 0.0;
                }
            }

            // Set up animations
            const clips: unknown[] = Array.isArray(gltf.animations) ? gltf.animations : [];
            const rawClipNames = clips.map((c: any) => c?.name ?? "(no name)");
            console.log(`[RobotAssistant] 📋 ${robotName} (${modelKey}) — animations:`, rawClipNames);

            const mixer = new AnimationMixer(robotModel);
            const animationsMap = new Map<string, AnimationAction>();

            for (const clip of clips) {
                const c = clip as { name?: string };
                if (!c.name) continue;

                const action = mixer.clipAction(clip as any);
                if (action) {
                    animationsMap.set(c.name, action);

                    // Set emotes and certain states to play once then stop
                    if (EMOTES.indexOf(c.name) >= 0 || STATES.indexOf(c.name) >= 4) {
                        action.clampWhenFinished = true;
                        action.loop = LoopOnce;
                    }
                }
            }

            console.log(`[RobotAssistant] 🎬 ${robotName} — available animations:`, Array.from(animationsMap.keys()));

            // Create entity
            const entity = this.world.createTransformEntity(robotModel);

            // Pick initial random waypoint within room
            const bounds = getRoomBounds();
            const targetX = bounds ? (bounds.minX + Math.random() * (bounds.maxX - bounds.minX)) : (finalX + (Math.random() - 0.5) * 4);
            const targetZ = bounds ? (bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)) : (finalZ + (Math.random() - 0.5) * 4);

            entity.addComponent(RobotAssistantComponent, {
                robotId,
                robotName,
                baseY: finalY,
                currentState: "Walking",
                nextTransitionTime: 5.0 + Math.random() * 5.0,
                targetX,
                targetZ,
                hasReachedTarget: false,
                nextWaypointTime: this.timeElapsed + WAYPOINT_INTERVAL + Math.random() * 4.0,
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

            console.log(`[RobotAssistant] ✅ Created: ${robotName} at position (${position.join(", ")})`);
            return entity;
        } catch (error) {
            console.error(`[RobotAssistant] Failed to create ${robotName}:`, error);
            return null;
        }
    }

    private fadeToAction(record: RobotAssistantRecord, name: string, duration: number): void {
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

    update(dt: number): void {
        this.timeElapsed += dt;

        for (const [robotId, record] of this.robotRecords) {
            // Always update mixer
            record.mixer.update(dt);

            const entity = record.entity;
            const nextTransitionTime = entity.getValue(RobotAssistantComponent, "nextTransitionTime") as number;
            const currentState = entity.getValue(RobotAssistantComponent, "currentState") as string;
            const targetX = entity.getValue(RobotAssistantComponent, "targetX") as number;
            const targetZ = entity.getValue(RobotAssistantComponent, "targetZ") as number;
            const hasReachedTarget = entity.getValue(RobotAssistantComponent, "hasReachedTarget") as boolean;
            const nextWaypointTime = entity.getValue(RobotAssistantComponent, "nextWaypointTime") as number;
            const moveSpeed = entity.getValue(RobotAssistantComponent, "moveSpeed") as number;
            let collisionCooldown = entity.getValue(RobotAssistantComponent, "collisionCooldown") as number;

            if (collisionCooldown > 0) {
                collisionCooldown = Math.max(0, collisionCooldown - dt);
                entity.setValue(RobotAssistantComponent, "collisionCooldown", collisionCooldown);
            }

            // Calculate movement intention
            let shouldMove = false;
            let distanceToTarget = 0;

            if (currentState === "Walking" || currentState === "Idle") {
                const dx = targetX - record.model.position.x;
                const dz = targetZ - record.model.position.z;
                distanceToTarget = Math.sqrt(dx * dx + dz * dz);
                shouldMove = distanceToTarget > WAYPOINT_REACH_DISTANCE;
            }

            // Auto-switch animation BEFORE movement to prevent sliding
            // Only switch if not playing emotes or special animations
            const isEmote = EMOTES.includes(currentState);
            const isSpecialState = ["Dance", "Death", "Sitting", "Standing"].includes(currentState);

            if (!isEmote && !isSpecialState) {
                if (shouldMove && currentState === "Idle") {
                    // About to start moving - switch to Walking FIRST
                    this.fadeToAction(record, "Walking", FADE_DURATION);
                    entity.setValue(RobotAssistantComponent, "currentState", "Walking");
                    console.log(`[RobotAssistant] 🚶 Auto-switched to Walking (about to move)`);
                } else if (!shouldMove && currentState === "Walking") {
                    // Not moving - switch to Idle
                    this.fadeToAction(record, "Idle", FADE_DURATION);
                    entity.setValue(RobotAssistantComponent, "currentState", "Idle");
                    console.log(`[RobotAssistant] 🧍 Auto-switched to Idle (stopped)`);
                }
            }

            // Now perform actual movement (animation is already correct)
            // The robot should rotate and move if its current state is Walking,
            // or just rotate if its current state is Idle but it's about to move.
            if (shouldMove) {
                const dx = targetX - record.model.position.x;
                const dz = targetZ - record.model.position.z;
                // Recalculate distanceToTarget as currentState might have changed
                const currentDistanceToTarget = Math.sqrt(dx * dx + dz * dz);

                if (currentDistanceToTarget > WAYPOINT_REACH_DISTANCE) {
                    // Normalize direction
                    record.walkDirection.set(dx / currentDistanceToTarget, 0, dz / currentDistanceToTarget);

                    // Calculate target rotation
                    const targetAngle = Math.atan2(dx, dz);
                    record.rotateQuaternion.setFromAxisAngle(record.rotateAngle, targetAngle);

                    // Smoothly rotate toward target
                    (record.model as any).quaternion.rotateTowards(record.rotateQuaternion, ROTATE_SPEED);

                    // Move forward (only if in Walking state)
                    if (entity.getValue(RobotAssistantComponent, "currentState") === "Walking") {
                        const moveX = record.walkDirection.x * WALK_VELOCITY * dt;
                        const moveZ = record.walkDirection.z * WALK_VELOCITY * dt;

                        const oldX = record.model.position.x;
                        const oldZ = record.model.position.z;
                        const nextX = oldX + moveX;
                        const nextZ = oldZ + moveZ;

                        // Collision check against lab model meshes
                        const constrained = constrainMovement(
                            oldX, oldZ, nextX, nextZ,
                            record.model.position.y,
                            AVATAR_COLLISION_RADIUS
                        );

                        // 💥 IMMEDIATE COLLISION RESPONSE
                        if (collisionCooldown <= 0 && (Math.abs(constrained.x - nextX) > 0.001 || Math.abs(constrained.z - nextZ) > 0.001)) {
                            console.log(`[RobotAssistant] 💥 Hit wall at (${constrained.x.toFixed(2)}, ${constrained.z.toFixed(2)}) - turning immediately`);

                            const bounds = getRoomBounds();
                            const newTargetX = bounds ? (bounds.minX + Math.random() * (bounds.maxX - bounds.minX)) : (record.model.position.x + (Math.random() - 0.5) * 4);
                            const newTargetZ = bounds ? (bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)) : (record.model.position.z + (Math.random() - 0.5) * 4);

                            entity.setValue(RobotAssistantComponent, "targetX", newTargetX);
                            entity.setValue(RobotAssistantComponent, "targetZ", newTargetZ);
                            entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
                            entity.setValue(RobotAssistantComponent, "collisionCooldown", 1.5); // Add cooldown
                            entity.setValue(RobotAssistantComponent, "stuckTime", 0);
                        }

                        record.model.position.x = constrained.x;
                        record.model.position.z = constrained.z;

                        // Clamp to walkable area
                        const [clampedX, clampedZ] = clampToWalkableArea(
                            record.model.position.x,
                            record.model.position.z
                        );
                        record.model.position.x = clampedX;
                        record.model.position.z = clampedZ;
                    }

                    entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
                }
            } else if (!hasReachedTarget) {
                // Reached waypoint - stop moving
                entity.setValue(RobotAssistantComponent, "hasReachedTarget", true);
                console.log(`[RobotAssistant] 📍 Reached waypoint (${targetX.toFixed(2)}, ${targetZ.toFixed(2)})`);
            }

            // Pick new waypoint periodically
            if (this.timeElapsed >= nextWaypointTime) {
                const bounds = getRoomBounds();
                const newTargetX = bounds ? (bounds.minX + Math.random() * (bounds.maxX - bounds.minX)) : (record.model.position.x + (Math.random() - 0.5) * 4);
                const newTargetZ = bounds ? (bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)) : (record.model.position.z + (Math.random() - 0.5) * 4);

                entity.setValue(RobotAssistantComponent, "targetX", newTargetX);
                entity.setValue(RobotAssistantComponent, "targetZ", newTargetZ);
                entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
                entity.setValue(RobotAssistantComponent, "nextWaypointTime", this.timeElapsed + WAYPOINT_INTERVAL + Math.random() * 4.0);
                console.log(`[RobotAssistant] 🎯 New waypoint: (${newTargetX.toFixed(2)}, ${newTargetZ.toFixed(2)})`);
            }


            // ── Stuck Detection & Collision Response ────────────────────────
            // If we are in "Walking" state:
            // 1. Check if we hit a wall (constrained movement differs from intended)
            // 2. Check if we are physically stuck (position not changing)
            if (currentState === "Walking") {
                const currentX = record.model.position.x;
                const currentZ = record.model.position.z;
                const lastX = entity.getValue(RobotAssistantComponent, "lastX") as number;
                const lastZ = entity.getValue(RobotAssistantComponent, "lastZ") as number;
                let stuckTime = entity.getValue(RobotAssistantComponent, "stuckTime") as number;

                // collisionCooldown is updated at top of loop

                // 1. Immediate Collision Check (Wall Hit)
                // If constrained position differs significantly from intended next position, we hit something.
                // We check this *after* movement calculation in the loop below, but we need the flag here.
                // Actually, let's do this check *inside* the movement block where we have `constrained` result.

                // 2. Stuck Check (No Progress)
                const distMoved = Math.sqrt((currentX - lastX) ** 2 + (currentZ - lastZ) ** 2);
                if (distMoved < 0.005) {
                    stuckTime += dt;
                } else {
                    stuckTime = Math.max(0, stuckTime - dt * 2);
                }

                // Trigger repathing if stuck OR if collision detected (set via local flag below)
                let triggerRepath = false;

                if (stuckTime > 1.0) { // Reduced from 2.0s for faster response
                    console.log(`[RobotAssistant] ⚠️ Stuck detected (${stuckTime.toFixed(1)}s) - picking new path`);
                    triggerRepath = true;
                }

                entity.setValue(RobotAssistantComponent, "stuckTime", stuckTime);
                entity.setValue(RobotAssistantComponent, "lastX", currentX);
                entity.setValue(RobotAssistantComponent, "lastZ", currentZ);
                entity.setValue(RobotAssistantComponent, "collisionCooldown", collisionCooldown);

                if (triggerRepath) {
                    const bounds = getRoomBounds();
                    const newTargetX = bounds ? (bounds.minX + Math.random() * (bounds.maxX - bounds.minX)) : (record.model.position.x + (Math.random() - 0.5) * 4);
                    const newTargetZ = bounds ? (bounds.minZ + Math.random() * (bounds.maxZ - bounds.minZ)) : (record.model.position.z + (Math.random() - 0.5) * 4);

                    entity.setValue(RobotAssistantComponent, "targetX", newTargetX);
                    entity.setValue(RobotAssistantComponent, "targetZ", newTargetZ);
                    entity.setValue(RobotAssistantComponent, "hasReachedTarget", false);
                    entity.setValue(RobotAssistantComponent, "stuckTime", 0);
                    entity.setValue(RobotAssistantComponent, "collisionCooldown", 1.5); // Add cooldown
                }
            } else {
                entity.setValue(RobotAssistantComponent, "stuckTime", 0);
            }
            // ────────────────────────────────────────────────────────────────

            // Check if it's time for a random transition
            if (this.timeElapsed >= nextTransitionTime) {
                // Decide: state change or emote
                const doEmote = Math.random() < 0.3;

                if (doEmote) {
                    // Pick random emote
                    const emote = EMOTES[Math.floor(Math.random() * EMOTES.length)];
                    console.log(`[RobotAssistant] 🎭 Playing emote: ${emote}`);
                    this.fadeToAction(record, emote, FADE_DURATION);

                    // Listen for emote finish, then return to previous state
                    const onFinished = () => {
                        record.mixer.removeEventListener("finished", onFinished);
                        console.log(`[RobotAssistant] 🔄 Returning to state: ${currentState}`);
                        this.fadeToAction(record, currentState, FADE_DURATION);
                    };
                    record.mixer.addEventListener("finished", onFinished);
                } else {
                    // Change state (bias towards Walking)
                    const rand = Math.random();
                    let newState: string;

                    if (rand < 0.6) {
                        newState = "Walking";
                    } else if (rand < 0.8) {
                        newState = "Idle";
                    } else {
                        const otherStates = STATES.filter(s => s !== currentState && s !== "Walking" && s !== "Death");
                        newState = otherStates[Math.floor(Math.random() * otherStates.length)] || "Walking";
                    }

                    if (newState !== currentState) {
                        console.log(`[RobotAssistant] 🤖 Changing state: ${currentState} → ${newState}`);
                        this.fadeToAction(record, newState, FADE_DURATION);
                        entity.setValue(RobotAssistantComponent, "currentState", newState);
                    }
                }

                // Set next transition time
                const nextInterval = 5.0 + Math.random() * 5.0;
                entity.setValue(RobotAssistantComponent, "nextTransitionTime", this.timeElapsed + nextInterval);
            }

            // Ensure expressions stay at 0.0
            if (record.headMesh) {
                const dict = (record.headMesh as any).morphTargetDictionary;
                const influences = (record.headMesh as any).morphTargetInfluences;
                if (dict && influences) {
                    if (dict["angry"] !== undefined) influences[dict["angry"]] = 0.0;
                    if (dict["surprised"] !== undefined) influences[dict["surprised"]] = 0.0;
                    if (dict["sad"] !== undefined) influences[dict["sad"]] = 0.0;
                }
            }
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
}
