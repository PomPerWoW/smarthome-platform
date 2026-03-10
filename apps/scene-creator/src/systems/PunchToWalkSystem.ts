import { createSystem, Interactable } from "@iwsdk/core";
import { consumePunchGestures, getHeadsetYaw } from "../utils/legPoseLogger";
import { RPMUserControlledAvatarSystem } from "./RPMUserControlledAvatarSystem";

// ============================================================================
// PUNCH-TO-WALK SYSTEM
//
// Each single punch triggers one walk step, but the user MUST alternate
// hands (Left → Right → Left → …). Punching the same hand twice in a row
// is ignored, enforcing a natural walking rhythm.
//
// Also reads headset yaw every frame (from the XR viewer pose extracted in
// legPoseLogger) and feeds it to RPMUserControlledAvatarSystem so the avatar
// turns when the user turns in VR.
// ============================================================================

/** How long a virtual "forward" key press lasts per walk step (seconds). */
const WALK_STEP_DURATION = 0.55;

/** The keyboard key that RPMUserControlledAvatarSystem uses for forward. */
const KEY_FORWARD = "i";

export class PunchToWalkSystem extends createSystem({
    _trigger: {
        required: [Interactable],
    },
}) {
    private rpmAvatarSystem: RPMUserControlledAvatarSystem | null = null;
    private enabled = true;

    /**
     * Tracks which hand punched last.
     * null  = no punch yet (either hand can start)
     * "left"  = last accepted punch was left  → next must be right
     * "right" = last accepted punch was right → next must be left
     */
    private lastPunchHand: "left" | "right" | null = null;

    // Virtual key injection state
    private walkingRemaining = 0; // seconds remaining for current virtual keypress

    // ── public API ──

    /** Link to the rpm avatar system so we can inject key states. */
    setAvatarSystem(sys: RPMUserControlledAvatarSystem): void {
        this.rpmAvatarSystem = sys;
        console.log("[PunchToWalk] Linked to RPMUserControlledAvatarSystem");
    }

    /** Enable / disable the punch-to-walk feature at runtime. */
    setEnabled(on: boolean): void {
        this.enabled = on;
        if (!on) {
            this.releaseForwardKey();
            this.lastPunchHand = null;
            this.walkingRemaining = 0;
        }
        console.log(`[PunchToWalk] ${on ? "Enabled ✅" : "Disabled ❌"}`);
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    // ── frame loop ──

    update(dt: number): void {
        if (!this.enabled || !this.rpmAvatarSystem) return;

        // 1. Feed headset yaw from XR viewer pose → avatar rotation
        //    (getHeadsetYaw() is updated every XR frame inside legPoseLogger)
        const yaw = getHeadsetYaw();
        if (yaw !== null) {
            this.rpmAvatarSystem.setHeadsetYaw(yaw);
        }

        // 2. Consume punch gestures detected this frame
        const punches = consumePunchGestures();

        // 3. Check each hand — only accept if it is the OPPOSITE of the last punch
        if (punches.left && this.lastPunchHand !== "left") {
            this.lastPunchHand = "left";
            this.triggerWalkStep("left");
        }
        if (punches.right && this.lastPunchHand !== "right") {
            this.lastPunchHand = "right";
            this.triggerWalkStep("right");
        }

        // 4. Tick down the virtual key press
        if (this.walkingRemaining > 0) {
            this.walkingRemaining -= dt;
            if (this.walkingRemaining <= 0) {
                this.walkingRemaining = 0;
                this.releaseForwardKey();
            }
        }
    }

    // ── internals ──

    private triggerWalkStep(hand: "left" | "right"): void {
        if (!this.rpmAvatarSystem) return;
        // Reset (not accumulate) so avatar stops promptly when punching stops
        this.walkingRemaining = WALK_STEP_DURATION;
        this.rpmAvatarSystem.injectKeyState(KEY_FORWARD, true);
        console.log(
            `[PunchToWalk] 🚶 ${hand.toUpperCase()} punch → walk step (remaining: ${this.walkingRemaining.toFixed(2)}s)`
        );
    }

    private releaseForwardKey(): void {
        if (!this.rpmAvatarSystem) return;
        this.rpmAvatarSystem.injectKeyState(KEY_FORWARD, false);
    }
}

