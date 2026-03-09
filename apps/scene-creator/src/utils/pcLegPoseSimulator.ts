import { logSimulatedLegPoses, LegPoseSnapshot, injectPunch } from "./legPoseLogger";

let started = false;

export function setupPCLegPoseSimulator(): void {
  if (started) return;

  const anyNavigator = navigator as any;
  if (anyNavigator && anyNavigator.xr) {
    // Real WebXR is available (e.g. Quest or desktop with XR emulator) – do nothing.
    return;
  }

  started = true;
  console.log(
    "[LegPose-PC] No WebXR detected (navigator.xr missing). Starting simple PC leg pose simulator."
  );

  const leftBase = { x: -0.2, y: 0.0, z: 0.0 };
  const rightBase = { x: 0.2, y: 0.0, z: 0.0 };

  const identityOrientation = { x: 0, y: 0, z: 0, w: 1 };

  const startTime = performance.now();

  const loop = () => {
    const now = performance.now();
    const t = (now - startTime) / 1000;

    const stepAmplitudeZ = 0.25;
    const liftAmplitudeY = 0.08;

    const leftPhase = t;
    const rightPhase = t + Math.PI;

    const leftZOffset = Math.sin(leftPhase) * stepAmplitudeZ;
    const rightZOffset = Math.sin(rightPhase) * stepAmplitudeZ;

    const leftLift = Math.max(0, Math.sin(leftPhase)) * liftAmplitudeY;
    const rightLift = Math.max(0, Math.sin(rightPhase)) * liftAmplitudeY;

    const left: LegPoseSnapshot["left"] = {
      position: {
        x: leftBase.x,
        y: leftBase.y + leftLift,
        z: leftBase.z + leftZOffset,
      },
      orientation: identityOrientation,
      tracked: true,
    };

    const right: LegPoseSnapshot["right"] = {
      position: {
        x: rightBase.x,
        y: rightBase.y + rightLift,
        z: rightBase.z + rightZOffset,
      },
      orientation: identityOrientation,
      tracked: true,
    };

    logSimulatedLegPoses(left, right);
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);

  // ── P key = simulate alternating punches (desktop testing) ──
  let nextPunchHand: "left" | "right" = "left";
  window.addEventListener("keydown", (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) return;
    if (event.key.toLowerCase() === "p") {
      event.preventDefault();
      injectPunch(nextPunchHand);
      console.log(`[LegPose-PC] 🥊 Simulated ${nextPunchHand.toUpperCase()} punch (press P again for the other hand)`);
      nextPunchHand = nextPunchHand === "left" ? "right" : "left";
    }
  });
  console.log("[LegPose-PC] Press P to simulate alternating punch gestures");
}

