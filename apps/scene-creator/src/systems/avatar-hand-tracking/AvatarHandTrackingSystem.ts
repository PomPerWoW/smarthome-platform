/**
 * AvatarHandTrackingSystem - Swaps the default XR hand visuals with RPM avatar hand skins.
 * When the user enters XR mode (AR/VR), their tracked hands will display the Ready Player Me
 * avatar's hand mesh instead of the generic hand model.
 *
 * This enables the "first-person avatar hands" experience: the user sees their own
 * avatar's hands when using Meta Quest 3 hand tracking in the 3D scene.
 */

import { createSystem, VisibilityState } from "@iwsdk/core";
import { HandArmatureHandVisual } from "./HandArmatureHandVisual";

/** Set to true to use default Meta hands. Set false for custom hand visuals. */
const USE_DEFAULT_HANDS = true;

export class AvatarHandTrackingSystem extends createSystem({}) {
  private swapped = false;
  private unsubscribe?: () => void;

  init() {
    console.log(
      "[AvatarHandTracking] System initialized - will swap to RPM avatar hands when entering XR"
    );

    const { input, visibilityState } = this;

    if (!input?.visualAdapters?.hand) {
      console.warn("[AvatarHandTracking] World missing input.visualAdapters.hand");
      return;
    }

    const { left, right } = input.visualAdapters.hand;

    const trySwap = () => {
      const state = visibilityState.value;
      const inXR =
        state === VisibilityState.Visible ||
        state === VisibilityState.VisibleBlurred;
      console.log(
        "[AvatarHandTracking] trySwap: visibilityState=",
        state,
        "inXR=",
        inXR,
        "swapped=",
        this.swapped,
        "left=",
        !!left,
        "right=",
        !!right
      );
      if (this.swapped) return;
      if (inXR && left && right && !USE_DEFAULT_HANDS) {
        try {
          console.log("[AvatarHandTracking] Calling updateVisualImplementation...");
          // Cast needed: @types/three from iwsdk vs scene-creator have incompatible Scene types
          left.updateVisualImplementation(HandArmatureHandVisual as any);
          right.updateVisualImplementation(HandArmatureHandVisual as any);
          this.swapped = true;
          console.log(
            "[AvatarHandTracking] ✅ Swapped hand visuals to hand-armature (hand.glb)"
          );
        } catch (e) {
          console.warn("[AvatarHandTracking] Swap failed:", e);
        }
      }
    };

    // Swap when entering XR
    this.unsubscribe = visibilityState.subscribe(() => trySwap());

    // Register cleanup
    this.cleanupFuncs.push(() => this.unsubscribe?.());

    // Also try immediately in case we're already in XR (e.g. hot reload)
    trySwap();
  }
}
