import { Types, createComponent } from "@iwsdk/core";

export const ResidentAvatarComponent = createComponent("ResidentAvatarComponent", {
    avatarId: { type: Types.String, default: "" },
    avatarName: { type: Types.String, default: "" },
    currentAnimation: { type: Types.String, default: "Idle" },
    timeSinceLastChange: { type: Types.Float32, default: 0 },
    isMoving: { type: Types.Boolean, default: false },
    targetX: { type: Types.Float32, default: 0 },
    targetY: { type: Types.Float32, default: 0 },
    targetZ: { type: Types.Float32, default: 0 },
    walkSpeed: { type: Types.Float32, default: 0.8 },
});