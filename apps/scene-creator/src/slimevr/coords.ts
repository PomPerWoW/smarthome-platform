import { Euler, MathUtils, Quaternion, Vector3 } from "three";

/**
 * SlimeVR / VRChat OSC uses a Unity-style left-handed Y-up frame.
 * Three.js / WebXR use right-handed Y-up. Convert positions.
 */
export function slimeVRPositionToThree(
  x: number,
  y: number,
  z: number,
  target?: Vector3
): Vector3 {
  const out = target ?? new Vector3();
  out.set(-x, y, z);
  return out;
}

/**
 * Rotation from OSC: Euler angles in degrees, order ZXY (VRChat convention).
 */
const eulerSlime = new Euler();
const quatFix = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

export function slimeVRRotationToThreeQuaternion(
  rxDeg: number,
  ryDeg: number,
  rzDeg: number,
  target?: Quaternion
): Quaternion {
  const out = target ?? new Quaternion();
  eulerSlime.set(
    MathUtils.degToRad(rxDeg),
    MathUtils.degToRad(ryDeg),
    MathUtils.degToRad(rzDeg),
    "ZXY",
  );
  out.setFromEuler(eulerSlime);
  out.premultiply(quatFix);
  return out;
}
