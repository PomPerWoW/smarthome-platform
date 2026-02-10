import { Types, createComponent } from "@iwsdk/core";

export const UserControlledAvatarComponent = createComponent("UserControlledAvatarComponent", {
    avatarId: { type: Types.String, default: "" },
    avatarName: { type: Types.String, default: "" },
    
    // Movement state
    isMoving: { type: Types.Boolean, default: false },
    isJumping: { type: Types.Boolean, default: false },
    
    // Movement direction
    moveForward: { type: Types.Boolean, default: false },
    moveBackward: { type: Types.Boolean, default: false },
    moveLeft: { type: Types.Boolean, default: false },
    moveRight: { type: Types.Boolean, default: false },
    
    // Movement properties
    moveSpeed: { type: Types.Float32, default: 2.0 },
    rotationSpeed: { type: Types.Float32, default: 3.0 },
    jumpVelocity: { type: Types.Float32, default: 0 },
    
    // Animation state
    walkCycleTime: { type: Types.Float32, default: 0 },
    walkCycleSpeed: { type: Types.Float32, default: 5.0 },
    
    // Position tracking
    baseY: { type: Types.Float32, default: 0 },
    
    // Camera follow (optional for later)
    isSelected: { type: Types.Boolean, default: false },
});