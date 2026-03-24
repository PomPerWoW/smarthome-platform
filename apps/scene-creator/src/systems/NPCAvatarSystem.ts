import {
    createSystem,
    Entity,
    Object3D,
    AssetManager,
    AnimationMixer,
    AnimationAction,
} from "@iwsdk/core";

import { Box3, Vector3 } from "three";
import { SkeletonUtils } from "three-stdlib";
import { NPCAvatarComponent } from "../components/NPCAvatarComponent";
import { getRoomBounds } from "../config/navmesh";

// ============================================================================
// CONFIG
// ============================================================================

const FADE_DURATION = 0.2;

// ============================================================================
// NPC RECORD
// ============================================================================

interface NPCAvatarRecord {
    entity: Entity;
    model: Object3D;
    mixer: AnimationMixer;
    animationsMap: Map<string, AnimationAction>;
    currentAction: string;
    // Track previous room-local position to prevent warping
    lastRoomLocalPos: { x: number; y: number; z: number } | null;
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

    init() {
        console.log("[NPCAvatar] System initialized (stationary NPCs)");
    }

    // ── Room-local ↔ world helpers (same as RobotAssistantSystem) ──

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
        return {
            x: roomModel.position.x + lx * cosR - lz * sinR,
            y: roomModel.position.y + ly,
            z: roomModel.position.z + lx * sinR + lz * cosR,
        };
    }

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
        const dz = wz - roomModel.position.z;
        return {
            x: dx * cosR - dz * sinR,
            y: wy - roomModel.position.y,
            z: dx * sinR + dz * cosR,
        };
    }

    /** Ground the NPC by aligning bbox min Y (feet) to floorY. */
    private alignFeetToFloor(model: Object3D, floorY: number): number {
        const box = new Box3().setFromObject(model as any);
        const originToFeet = model.position.y - box.min.y;
        const groundedY = floorY + originToFeet;
        model.position.y = groundedY;
        return groundedY;
    }

    async createNPCAvatar(
        npcId: string,
        npcName: string,
        modelKey: string,
        position: [number, number, number],
        initialRotation: number = 0 // Rotation in radians (e.g. Math.PI)
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
            npcModel.scale.setScalar(0.8); // Bigger avatars (was 0.5)
            npcModel.position.set(finalX, finalY, finalZ);
            npcModel.rotation.set(0, initialRotation, 0);
            npcModel.visible = true;

            this.world.scene.add(npcModel);

            // Floor alignment using bounding box
            const targetFloorY = roomBounds ? roomBounds.floorY : finalY;
            const feetY = this.alignFeetToFloor(npcModel, targetFloorY);

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

            entity.addComponent(NPCAvatarComponent, {
                npcId,
                npcName,
                baseY: feetY,
                currentState: "Idle",
            });

            // Start with Idle animation
            const idleActionName = animationsMap.has("Idle") ? "Idle" : null;
            if (idleActionName) {
                animationsMap.get(idleActionName)!.play();
            }

            const record: NPCAvatarRecord = {
                entity,
                model: npcModel,
                mixer,
                animationsMap,
                currentAction: idleActionName || "Idle",
                lastRoomLocalPos: null,
            };
            this.npcRecords.set(npcId, record);

            console.log(`[NPCAvatar] ✅ Created stationary: ${npcName} (scale: 0.8)`);
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

    update(dt: number): void {
        for (const [npcId, record] of this.npcRecords) {
            // Always update mixer
            record.mixer.update(dt);

            // ── START OF FRAME: Convert world position → room-local ──
            const roomModel = (globalThis as any).__labRoomModel;
            const roomRotY = roomModel ? roomModel.rotation.y : 0;

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
            if (record.lastRoomLocalPos !== null) {
                const posDiff = Math.sqrt(
                    (roomLocal.x - record.lastRoomLocalPos.x) ** 2 +
                    (roomLocal.z - record.lastRoomLocalPos.z) ** 2,
                );
                const maxReasonableMovement = 0.1;
                if (posDiff > maxReasonableMovement) {
                    record.model.position.set(
                        record.lastRoomLocalPos.x,
                        record.lastRoomLocalPos.y,
                        record.lastRoomLocalPos.z,
                    );
                } else {
                    record.model.position.set(roomLocal.x, roomLocal.y, roomLocal.z);
                    record.lastRoomLocalPos = { ...roomLocal };
                }
            } else {
                record.model.position.set(roomLocal.x, roomLocal.y, roomLocal.z);
                record.lastRoomLocalPos = { ...roomLocal };
            }

            // Undo room rotation so all rotation math is in room-local space
            record.model.rotation.y -= roomRotY;

            // Optional: Add small random idle variations here in the future
            // ...

            // ── END OF FRAME: Convert room-local → world ──
            const worldPos = this.roomLocalToWorld(
                record.model.position.x,
                record.model.position.y,
                record.model.position.z,
            );
            record.model.position.set(worldPos.x, worldPos.y, worldPos.z);
            record.model.rotation.y += roomRotY;
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