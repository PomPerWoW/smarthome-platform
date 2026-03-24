import { Types, createComponent } from "@iwsdk/core";

export const NPCAvatarComponent = createComponent("NPCAvatarComponent", {
    npcId: { type: Types.String, default: "" },
    npcName: { type: Types.String, default: "" },

    // Current animation state
    currentState: { type: Types.String, default: "Idle" },

    // Position tracking
    baseY: { type: Types.Float32, default: 0 },
});