import { createSystem, Interactable } from "@iwsdk/core";
import { consumePunchGestures } from "../utils/legPoseLogger";
import { RPMUserControlledAvatarSystem } from "./RPMUserControlledAvatarSystem";

// ============================================================================
// PUNCH-TO-WALK SYSTEM
//
// Consumes alternating left/right punch gestures from legPoseLogger and
// injects virtual "forward" key presses into RPMUserControlledAvatarSystem
// so the avatar walks forward using the existing Walk animation + movement.
// ============================================================================

/** How long a virtual "forward" key press lasts per walk step (seconds). */
const WALK_STEP_DURATION = 0.55;

/**
 * Maximum time window (seconds) between a left and right punch for them
 * to count as one "alternating pair" that triggers a step.
 */
const PAIR_WINDOW = 1.5;

/** The keyboard key that RPMUserControlledAvatarSystem uses for forward. */
const KEY_FORWARD = "i";

export class PunchToWalkSystem extends createSystem({
    _trigger: {
        required: [Interactable],
    },
}) {
    private rpmAvatarSystem: RPMUserControlledAvatarSystem | null = null;
    private enabled = true;

    // Alternating-punch tracking
    private pendingLeft = false;
    private pendingRight = false;
    private pendingLeftTime = 0;
    private pendingRightTime = 0;

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
            // Release any held virtual key
            this.releaseForwardKey();
            this.pendingLeft = false;
            this.pendingRight = false;
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

        // 1. Consume punch gestures detected this frame
        const punches = consumePunchGestures();
        const now = performance.now();

        if (punches.left) {
            this.pendingLeft = true;
            this.pendingLeftTime = now;
        }
        if (punches.right) {
            this.pendingRight = true;
            this.pendingRightTime = now;
        }

        // 2. Expire stale pending punches outside the pair window
        if (this.pendingLeft && now - this.pendingLeftTime > PAIR_WINDOW * 1000) {
            this.pendingLeft = false;
        }
        if (this.pendingRight && now - this.pendingRightTime > PAIR_WINDOW * 1000) {
            this.pendingRight = false;
        }

        // 3. If we have one punch from each hand within the window → trigger a walk step
        if (this.pendingLeft && this.pendingRight) {
            this.pendingLeft = false;
            this.pendingRight = false;
            this.triggerWalkStep();
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

    private triggerWalkStep(): void {
        if (!this.rpmAvatarSystem) return;
        // If already walking, extend the timer instead of resetting
        this.walkingRemaining += WALK_STEP_DURATION;
        this.rpmAvatarSystem.injectKeyState(KEY_FORWARD, true);
        console.log(
            `[PunchToWalk] 🚶 Walk step triggered (remaining: ${this.walkingRemaining.toFixed(2)}s)`
        );
    }

    private releaseForwardKey(): void {
        if (!this.rpmAvatarSystem) return;
        this.rpmAvatarSystem.injectKeyState(KEY_FORWARD, false);
    }
}
