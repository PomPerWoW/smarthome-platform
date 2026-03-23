// =============================================================================
// XRInstructionSystem.ts
//
// Lightweight ECS system whose only job is to detect when the user enters or
// leaves an immersive XR session and show / hide the 2-D instruction overlay
// accordingly.
//
// Register it in index.ts:
//   world.registerSystem(XRInstructionSystem);
// =============================================================================

import { createSystem } from "@iwsdk/core";
import {
  showXRInstructionOverlay,
  dismissXRInstructionOverlay,
} from "../ui/XRInstructionOverlay";

export class XRInstructionSystem extends createSystem({}) {
  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  init(): void {
    console.log("[XRInstructionSystem] Initializing — waiting for XR session…");

    // ── Session start ────────────────────────────────────────────────────────
    this.renderer.xr.addEventListener("sessionstart", this.onSessionStart);

    // ── Session end ──────────────────────────────────────────────────────────
    this.renderer.xr.addEventListener("sessionend", this.onSessionEnd);
  }

  // destroy() is called by the ECS when the world tears down.
  // Clean up the event listeners so we don't leak if the world is recreated.
  destroy(): void {
    this.renderer.xr.removeEventListener("sessionstart", this.onSessionStart);
    this.renderer.xr.removeEventListener("sessionend", this.onSessionEnd);
    console.log("[XRInstructionSystem] Destroyed — listeners removed");
  }

  // ─── XR session handlers (arrow functions keep `this` bound) ───────────────

  private readonly onSessionStart = (): void => {
    console.log(
      "[XRInstructionSystem] 🥽 XR session started — showing instruction overlay",
    );
    showXRInstructionOverlay();
  };

  private readonly onSessionEnd = (): void => {
    console.log(
      "[XRInstructionSystem] XR session ended — dismissing instruction overlay (if still visible)",
    );
    dismissXRInstructionOverlay();
  };

  // update() is required by the ECS contract; nothing to do every frame here.
  update(_dt: number): void {}
}
