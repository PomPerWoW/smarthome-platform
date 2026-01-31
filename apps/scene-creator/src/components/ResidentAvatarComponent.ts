import { Types, createComponent } from "@iwsdk/core";

export const ResidentAvatarComponent = createComponent("ResidentAvatarComponent", {
    avatarId: { type: Types.String, default: "" },
    avatarName: { type: Types.String, default: "" },
    currentAnimation: { type: Types.String, default: "Idle" },
    currentState: { type: Types.String, default: "idle" },
    maxSpeed: { type: Types.Float32, default: 0.8 },
    wanderRadius: { type: Types.Float32, default: 3 },
    originX: { type: Types.Float32, default: 0 },
    originZ: { type: Types.Float32, default: 0 },
    isSpeaking: { type: Types.Boolean, default: false },
});