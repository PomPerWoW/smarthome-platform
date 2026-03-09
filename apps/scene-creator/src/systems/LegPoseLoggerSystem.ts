import { createSystem, Interactable } from "@iwsdk/core";
import { logLegControllerPoses } from "../utils/legPoseLogger";

export class LegPoseLoggerSystem extends createSystem({
  _trigger: {
    required: [Interactable],
  },
}) {
  private loopStarted = false;
  private session: XRSession | null = null;

  update(_dt: number): void {
    const world = this.world as unknown as {
      session?: XRSession;
      renderer?: { xr: { getReferenceSpace: () => XRReferenceSpace | null } };
    };

    const session = world.session;
    if (!session) {
      if (this.loopStarted) {
        this.loopStarted = false;
        this.session = null;
      }
      return;
    }

    if (this.loopStarted && this.session === session) return;
    this.loopStarted = true;
    this.session = session;

    const renderer = world.renderer;
    if (!renderer?.xr?.getReferenceSpace) {
      console.warn("[LegPoseLogger] No renderer or reference space");
      return;
    }

    console.log(
      "[LegPoseLogger] XR session active — starting leg controller pose log (every frame). Strap left/right controllers to legs and walk."
    );

    const loop = (time: number, frame: XRFrame) => {
      if (!this.session || this.session !== session) return;
      const refSpace = renderer.xr.getReferenceSpace();
      if (!refSpace) return;
      logLegControllerPoses(frame, refSpace);
      session.requestAnimationFrame(loop);
    };
    session.requestAnimationFrame(loop);
  }
}
