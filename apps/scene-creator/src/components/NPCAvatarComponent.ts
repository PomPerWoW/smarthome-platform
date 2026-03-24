import { Types, createComponent } from "@iwsdk/core";

export const NPCAvatarComponent = createComponent("NPCAvatarComponent", {
    npcId: { type: Types.String, default: "" },
    npcName: { type: Types.String, default: "" },

    // Current animation state
    currentState: { type: Types.String, default: "Walking" },

    // Movement state
    targetX: { type: Types.Float32, default: 0 },
    targetZ: { type: Types.Float32, default: 0 },
    moveSpeed: { type: Types.Float32, default: 0.5 },
    hasReachedTarget: { type: Types.Boolean, default: false },
    nextWaypointTime: { type: Types.Float32, default: 0 },

    // Position tracking
    baseY: { type: Types.Float32, default: 0 },
});
