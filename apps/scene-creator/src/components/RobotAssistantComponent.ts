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
    
    // Position tracking
    baseY: { type: Types.Float32, default: 0 },
    
    // Expression values
    angryExpression: { type: Types.Float32, default: 0.0 },
    surprisedExpression: { type: Types.Float32, default: 0.0 },
    sadExpression: { type: Types.Float32, default: 0.0 },
});
