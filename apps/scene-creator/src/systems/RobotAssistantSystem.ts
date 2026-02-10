import {
    createSystem,
    Entity,
    Object3D,
    AssetManager,
    AnimationMixer,
    AnimationAction,
    LoopOnce,
} from "@iwsdk/core";

import { Box3, SkinnedMesh } from "three";
import { SkeletonUtils } from "three-stdlib";
import { RobotAssistantComponent } from "../components/RobotAssistantComponent";
import { getRoomBounds } from "../config/navmesh";

// ============================================================================
// CONFIG
// ============================================================================

const FADE_DURATION = 0.2;

// Animation categories from the Three.js example
const STATES = ["Idle", "Walking", "Running", "Dance", "Death", "Sitting", "Standing"];
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
            entity.addComponent(RobotAssistantComponent, {
                robotId,
                robotName,
                baseY: finalY,
                currentState: "Walking",
                nextTransitionTime: 5.0 + Math.random() * 5.0,
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
