import {
    createSystem,
    Entity,
    Object3D,
    AssetManager,
} from "@iwsdk/core";

import { SkeletonUtils } from "three-stdlib";
import { AssistantAvatarComponent } from "../components/AssistantAvatarComponent";

interface AssistantAvatarRecord {
    entity: Entity;
    model: Object3D;
    availableAnimations: string[];
}

const ANIMATION_DURATIONS = {
    Idle: 8,
    Waving: 4,
    Walking: 6,
};

export class AssistantAvatarSystem extends createSystem({
    assistants: {
        required: [AssistantAvatarComponent],
    },
}) {
    private assistantRecords: Map<string, AssistantAvatarRecord> = new Map();

    init() {
        console.log("[AssistantAvatar] System initialized");
    }

    async createAssistantAvatar(
        avatarId: string,
        avatarName: string,
        modelKey: string,
        position: [number, number, number],
    ): Promise<Entity | null> {
        try {
            console.log(`[AssistantAvatar] Creating assistant: ${avatarName}`);

            const gltf = AssetManager.getGLTF(modelKey);
            if (!gltf) {
                console.error(`[AssistantAvatar] Model not found: ${modelKey}`);
                return null;
            }

            const avatarModel = SkeletonUtils.clone(gltf.scene);
            avatarModel.scale.setScalar(0.5);
            avatarModel.position.set(position[0], position[1], position[2]);
            avatarModel.rotation.set(0, 0, 0);

            this.world.scene.add(avatarModel);

            const entity = this.world.createTransformEntity(avatarModel);

            entity.addComponent(AssistantAvatarComponent, {
                avatarId,
                avatarName,
                currentAnimation: "Idle",
                timeSinceLastChange: 0,
                baseY: position[1],
                targetX: position[0],
                targetZ: position[2],
            });

            const record: AssistantAvatarRecord = {
                entity,
                model: avatarModel,
                availableAnimations: ["Idle", "Walking", "Waving"],
            };

            this.assistantRecords.set(avatarId, record);

            console.log(`[AssistantAvatar] ✅ Created assistant: ${avatarName}`);
            return entity;
        } catch (error) {
            console.error(`[AssistantAvatar] Failed to create assistant ${avatarName}:`, error);
            return null;
        }
    }

    private updateProceduralAnimation(record: AssistantAvatarRecord, dt: number, time: number) {
        const currentAnimation = record.entity.getValue(AssistantAvatarComponent, "currentAnimation") as string;
        const isMoving = record.entity.getValue(AssistantAvatarComponent, "isMoving") as boolean;
        const baseY = record.entity.getValue(AssistantAvatarComponent, "baseY") as number;

        if (!isMoving && currentAnimation !== "Waving") {
            record.model.rotation.z = 0;
            record.model.rotation.x = 0;
        }

        if (currentAnimation === "Idle" || (!isMoving && currentAnimation !== "Waving")) {
            record.model.position.y = baseY;
            record.model.rotation.z = 0;
        }
        else if (currentAnimation === "Waving") {
            const wiggleSpeed = 15;
            const wiggleAngle = 0.15;
            record.model.rotation.z = Math.sin(time * wiggleSpeed) * wiggleAngle;
            record.model.position.y = baseY + Math.abs(Math.sin(time * 5)) * 0.1;
        }
        else if (currentAnimation === "Walking" || isMoving) {
            const bobSpeed = 15;
            const bobHeight = 0.08;
            record.model.position.y = baseY + Math.abs(Math.sin(time * bobSpeed)) * bobHeight;
            record.model.rotation.x = 0.15;
        }
    }

    update(dt: number): void {
        const time = Date.now() / 1000;

        for (const [avatarId, record] of this.assistantRecords) {

            this.updateProceduralAnimation(record, dt, time);

            const currentAnimation = record.entity.getValue(AssistantAvatarComponent, "currentAnimation") as string;
            const isMoving = record.entity.getValue(AssistantAvatarComponent, "isMoving") as boolean;
            const timeSinceLastChange = record.entity.getValue(AssistantAvatarComponent, "timeSinceLastChange") as number;

            record.entity.setValue(AssistantAvatarComponent, "timeSinceLastChange", timeSinceLastChange + dt);

            if (isMoving) {
                const targetX = record.entity.getValue(AssistantAvatarComponent, "targetX") as number;
                const targetZ = record.entity.getValue(AssistantAvatarComponent, "targetZ") as number;
                const speed = record.entity.getValue(AssistantAvatarComponent, "walkSpeed") as number;
                const currentPos = record.model.position;
                const dx = targetX - currentPos.x;
                const dz = targetZ - currentPos.z;
                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance < 0.1) {
                    record.entity.setValue(AssistantAvatarComponent, "isMoving", false);
                    record.entity.setValue(AssistantAvatarComponent, "currentAnimation", "Idle");
                    record.entity.setValue(AssistantAvatarComponent, "timeSinceLastChange", 0);
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
                    if (Math.random() < 0.3) {
                        record.entity.setValue(AssistantAvatarComponent, "currentAnimation", "Waving");
                        record.entity.setValue(AssistantAvatarComponent, "timeSinceLastChange", 0);
                    } else {
                        const range = 3;
                        const randomX = (Math.random() - 0.5) * 2 * range;
                        const randomZ = (Math.random() - 0.5) * 2 * range;

                        record.entity.setValue(AssistantAvatarComponent, "isMoving", true);
                        record.entity.setValue(AssistantAvatarComponent, "targetX", randomX);
                        record.entity.setValue(AssistantAvatarComponent, "targetZ", randomZ);
                        record.entity.setValue(AssistantAvatarComponent, "currentAnimation", "Walking");
                        record.entity.setValue(AssistantAvatarComponent, "timeSinceLastChange", 0);
                    }
                }
            }
        }
    }

    destroy(): void {
        for (const [avatarId, record] of this.assistantRecords) {
            const obj = record.entity.object3D;
            if (obj?.parent) {
                obj.parent.remove(obj);
            }
            record.entity.destroy();
        }
        this.assistantRecords.clear();
        console.log("[AssistantAvatar] System destroyed");
    }
}
