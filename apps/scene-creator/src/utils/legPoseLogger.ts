
export interface LegPoseSnapshot {
  frameNumber: number;
  timestamp: number;
  left: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
    tracked: boolean;
  } | null;
  right: {
    position: { x: number; y: number; z: number };
    orientation: { x: number; y: number; z: number; w: number };
    tracked: boolean;
  } | null;
}

let frameCounter = 0;

export let latestLegPoseSnapshot: LegPoseSnapshot | null = null;

// ============================================================================
// HEADSET YAW — extracted from XR viewer pose each frame
// ============================================================================

let currentHeadsetYaw: number | null = null;

/**
 * Get the current headset yaw (Y-axis rotation in radians).
 * Updated every XR frame from the viewer pose. Returns null on desktop.
 */
export function getHeadsetYaw(): number | null {
  return currentHeadsetYaw;
}

/**
 * Extract yaw (Y rotation) from a quaternion using YXZ Euler decomposition.
 * Inlined to avoid importing Three.js Euler into this utility file.
 */
function yawFromQuaternion(x: number, y: number, z: number, w: number): number {
  // YXZ Euler: yaw = atan2(2(xw + yz), 1 - 2(x² + y²))  — but for YXZ order
  // Simplification: for yaw-only we can use atan2 on specific quaternion terms
  const sinYaw = 2 * (x * z + w * y);
  const cosYaw = w * w - x * x - y * y + z * z;
  return Math.atan2(sinYaw, cosYaw);
}

// ============================================================================
// PUNCH DETECTION — velocity-buffered with per-hand cooldown
// ============================================================================

// Pending punch flags consumed by PunchToWalkSystem
let pendingLeftPunch = false;
let pendingRightPunch = false;

// Per-hand position history for velocity buffering
interface PosEntry {
  x: number;
  y: number;
  z: number;
  t: number; // timestamp in ms
}
const VELOCITY_BUFFER_SIZE = 5; // frames to keep
const leftHistory: PosEntry[] = [];
const rightHistory: PosEntry[] = [];

// Per-hand cooldown (ms) — after detecting a punch, ignore that hand for this long
const PUNCH_COOLDOWN_MS = 300;
let lastLeftPunchTime = 0;
let lastRightPunchTime = 0;

// Tunable thresholds
const MIN_FORWARD_DELTA = 0.05; // metres of net forward motion over the buffer window
const MIN_SPEED = 0.6; // m/s average speed over the buffer window

function pushHistory(buf: PosEntry[], pos: { x: number; y: number; z: number }, t: number): void {
  buf.push({ x: pos.x, y: pos.y, z: pos.z, t });
  if (buf.length > VELOCITY_BUFFER_SIZE) buf.shift();
}

/**
 * Check whether the recent position history indicates a punch gesture.
 * Direction-agnostic: detects any fast hand thrust regardless of which
 * way the user is facing (fixes punch detection after turning).
 */
function detectPunchFromBuffer(buf: PosEntry[]): boolean {
  if (buf.length < 2) return false;
  const oldest = buf[0];
  const newest = buf[buf.length - 1];
  const dtSeconds = (newest.t - oldest.t) / 1000;
  if (dtSeconds <= 0) return false;

  const dx = newest.x - oldest.x;
  const dy = newest.y - oldest.y;
  const dz = newest.z - oldest.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const speed = dist / dtSeconds;

  // Detect any fast hand thrust (distance + speed), regardless of direction
  return dist > MIN_FORWARD_DELTA && speed > MIN_SPEED;
}

// Throttled logging — avoid flooding the console
let punchLogCount = 0;

function logSnapshot(snapshot: LegPoseSnapshot): LegPoseSnapshot {
  latestLegPoseSnapshot = snapshot;

  const now = snapshot.timestamp;

  // Update velocity buffers
  if (snapshot.left) pushHistory(leftHistory, snapshot.left.position, now);
  if (snapshot.right) pushHistory(rightHistory, snapshot.right.position, now);

  // Detect punches with cooldown
  if (now - lastLeftPunchTime > PUNCH_COOLDOWN_MS && detectPunchFromBuffer(leftHistory)) {
    pendingLeftPunch = true;
    lastLeftPunchTime = now;
    // Clear buffer so the same motion isn't re-detected
    leftHistory.length = 0;
    punchLogCount++;
    if (punchLogCount <= 20 || punchLogCount % 50 === 0) {
      console.log(`[LegPose] 🥊 LEFT punch detected (#${punchLogCount})`);
    }
  }
  if (now - lastRightPunchTime > PUNCH_COOLDOWN_MS && detectPunchFromBuffer(rightHistory)) {
    pendingRightPunch = true;
    lastRightPunchTime = now;
    rightHistory.length = 0;
    punchLogCount++;
    if (punchLogCount <= 20 || punchLogCount % 50 === 0) {
      console.log(`[LegPose] 🥊 RIGHT punch detected (#${punchLogCount})`);
    }
  }

  return snapshot;
}

export function logLegControllerPoses(
  frame: XRFrame,
  referenceSpace: XRReferenceSpace
): LegPoseSnapshot | null {
  const session = frame.session;
  const inputSources = session.inputSources;

  // ── Extract headset (viewer) yaw from XR pose ──
  const viewerPose = frame.getViewerPose(referenceSpace);
  if (viewerPose) {
    const o = viewerPose.transform.orientation;
    currentHeadsetYaw = yawFromQuaternion(o.x, o.y, o.z, o.w);
  }

  const snapshot: LegPoseSnapshot = {
    frameNumber: ++frameCounter,
    timestamp: performance.now(),
    left: null,
    right: null,
  };

  for (const source of inputSources) {
    if (!source.gripSpace) continue;
    if (source.hand) continue;

    const pose = frame.getPose(source.gripSpace, referenceSpace);
    if (!pose) continue;

    const p = pose.transform.position;
    const o = pose.transform.orientation;
    const data = {
      position: { x: p.x, y: p.y, z: p.z },
      orientation: { x: o.x, y: o.y, z: o.z, w: o.w },
      tracked: true,
    };

    if (source.handedness === "left") {
      snapshot.left = data;
    } else if (source.handedness === "right") {
      snapshot.right = data;
    }
  }

  return logSnapshot(snapshot);
}

export function logSimulatedLegPoses(
  left: LegPoseSnapshot["left"],
  right: LegPoseSnapshot["right"]
): LegPoseSnapshot {
  const snapshot: LegPoseSnapshot = {
    frameNumber: ++frameCounter,
    timestamp: performance.now(),
    left,
    right,
  };

  return logSnapshot(snapshot);
}

/**
 * Consume (read-and-reset) the punch flags detected by controller motion.
 * Called once per frame by PunchToWalkSystem.
 */
export function consumePunchGestures(): { left: boolean; right: boolean } {
  const result = { left: pendingLeftPunch, right: pendingRightPunch };
  pendingLeftPunch = false;
  pendingRightPunch = false;
  return result;
}

/**
 * Force-set a punch flag from external code (e.g. PC simulator).
 */
export function injectPunch(hand: "left" | "right"): void {
  if (hand === "left") pendingLeftPunch = true;
  else pendingRightPunch = true;
}
