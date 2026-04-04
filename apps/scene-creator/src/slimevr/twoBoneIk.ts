import { MathUtils, Vector3 } from "three";

const _v = new Vector3();
const _bend = new Vector3();

/**
 * World-space knee position for a hip–knee–ankle chain with lengths upperLen and lowerLen.
 * poleWorld biases the bend plane (e.g. slightly forward of the leg).
 */
export function computeKneeWorldPosition(
  hipWorld: Vector3,
  ankleTargetWorld: Vector3,
  poleWorld: Vector3,
  upperLen: number,
  lowerLen: number,
  outKnee: Vector3,
): void {
  const toAnkle = _v.copy(ankleTargetWorld).sub(hipWorld);
  let d = toAnkle.length();
  const maxReach = upperLen + lowerLen - 1e-4;
  if (d > maxReach) {
    toAnkle.multiplyScalar(maxReach / Math.max(d, 1e-6));
    d = maxReach;
  }
  const nd = toAnkle.clone().normalize();

  _bend.copy(poleWorld).sub(hipWorld);
  _bend.cross(nd);
  if (_bend.lengthSq() < 1e-8) {
    _bend.set(0, 1, 0).cross(nd);
  }
  if (_bend.lengthSq() < 1e-8) {
    _bend.set(0, 0, 1);
  }
  _bend.normalize();

  const cosH =
    (upperLen * upperLen + d * d - lowerLen * lowerLen) /
    (2 * upperLen * Math.max(d, 1e-6));
  const H = Math.acos(MathUtils.clamp(cosH, -1, 1));

  outKnee.copy(nd).applyAxisAngle(_bend, H).multiplyScalar(upperLen).add(hipWorld);
}

export const computeElbowWorldPosition = computeKneeWorldPosition;
