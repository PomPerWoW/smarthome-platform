import { Bone, Matrix4, Object3D, Quaternion, Vector3 } from "three";

const _m = new Matrix4();
const _qw = new Quaternion();
const _qp = new Quaternion();
const _up = new Vector3(0, 1, 0);

/**
 * Set bone.local rotation so the bone origin at fromWorld aims toward toWorld (Y-up bias).
 */
export function aimBoneWorld(
  bone: Bone,
  fromWorld: Vector3,
  toWorld: Vector3,
): void {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateMatrixWorld(true);
  _m.lookAt(fromWorld, toWorld, _up);
  _qw.setFromRotationMatrix(_m);
  _qp.setFromRotationMatrix(parent.matrixWorld);
  bone.quaternion.copy(_qp.clone().invert().multiply(_qw));
}

/** World position of an Object3D (bone). */
export function getBoneWorldPosition(bone: Bone, out: Vector3): Vector3 {
  return bone.getWorldPosition(out);
}

/** Rest-length distances along the leg chain (call after model is in T-pose scale). */
export function measureLegLengths(
  upperLeg: Bone,
  lowerLeg: Bone,
  foot: Bone,
): { upper: number; lower: number } {
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  upperLeg.updateMatrixWorld(true);
  lowerLeg.updateMatrixWorld(true);
  foot.updateMatrixWorld(true);
  upperLeg.getWorldPosition(a);
  lowerLeg.getWorldPosition(b);
  foot.getWorldPosition(c);
  return { upper: a.distanceTo(b), lower: b.distanceTo(c) };
}

export function findFirstBone(root: Object3D, test: (name: string) => boolean): Bone | null {
  let found: Bone | null = null;
  root.traverse((o) => {
    const b = o as Bone;
    if (b.isBone && test(b.name)) found = b;
  });
  return found;
}
