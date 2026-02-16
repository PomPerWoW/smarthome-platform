import { Types, createComponent } from "@iwsdk/core";

export const RobotAssistantComponent = createComponent("RobotAssistantComponent", {
    robotId: { type: Types.String, default: "" },
    robotName: { type: Types.String, default: "" },

    // Current animation state
    currentState: { type: Types.String, default: "Walking" },
    currentEmote: { type: Types.String, default: "" },

    // Autonomous behavior timing
    nextTransitionTime: { type: Types.Float32, default: 0 },
    transitionInterval: { type: Types.Float32, default: 7.0 },

    // Movement state
    targetX: { type: Types.Float32, default: 0 },
    targetZ: { type: Types.Float32, default: 0 },
    moveSpeed: { type: Types.Float32, default: 1.0 }, // Walking speed
    hasReachedTarget: { type: Types.Boolean, default: false },
    nextWaypointTime: { type: Types.Float32, default: 0 },

    // Position tracking
    baseY: { type: Types.Float32, default: 0 },

    // Expression values (morph targets) - kept at 0.0 for neutral
    angryExpression: { type: Types.Float32, default: 0.0 },
    surprisedExpression: { type: Types.Float32, default: 0.0 },
    sadExpression: { type: Types.Float32, default: 0.0 },

    // Collision/Stuck detection
    stuckTime: { type: Types.Float32, default: 0 },
    lastX: { type: Types.Float32, default: 0 },
    lastZ: { type: Types.Float32, default: 0 },
    collisionCooldown: { type: Types.Float32, default: 0 },
});
