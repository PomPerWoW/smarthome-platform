import { createSystem, Object3D } from "@iwsdk/core";
import {
  AxesHelper,
  Bone,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import { aimBoneWorld, findFirstBone, getBoneWorldPosition, measureLegLengths } from "../slimevr/boneAim";
import { slimeVRPositionToThree } from "../slimevr/coords";
import { SlimeVRClient, resolveSlimeVRWebSocketUrl } from "../slimevr/SlimeVRClient";
import {
  getBodyTrackingMode,
  setSlimeVRLegTrackingActive,
} from "../slimevr/slimevrState";
import { TRACKER_IDS } from "../slimevr/trackerMap";
import type { SlimeVRFrameMessage } from "../slimevr/types";
import { computeKneeWorldPosition } from "../slimevr/twoBoneIk";

const _hipT = new Vector3();
const _ankleLT = new Vector3();
const _ankleRT = new Vector3();
const _kneeTrack = new Vector3();
const _hipBW = new Vector3();
const _targetAnkleL = new Vector3();
const _targetAnkleR = new Vector3();
const _kneeJoint = new Vector3();
const _kneeW = new Vector3();
const _pole = new Vector3();
const _chestT = new Vector3();

export class SlimeVRFullBodySystem extends createSystem({}) {
  private client: SlimeVRClient | null = null;
  private debugRoot = new Group();
  private markerById = new Map<string, Group>();
  private avatarRoot: Object3D | null = null;

  private hips: Bone | null = null;
  private leftUpLeg: Bone | null = null;
  private leftLeg: Bone | null = null;
  private leftFoot: Bone | null = null;
  private rightUpLeg: Bone | null = null;
  private rightLeg: Bone | null = null;
  private rightFoot: Bone | null = null;

  private leftLens = { upper: 0.45, lower: 0.45 };
  private rightLens = { upper: 0.45, lower: 0.45 };
  private lensInitialized = false;

  init(): void {
    this.debugRoot.name = "SlimeVR_Debug";
    this.world.scene.add(this.debugRoot);

    if (getBodyTrackingMode() === "slimevr") {
      this.ensureClientConnected();
    } else {
      console.log("[SlimeVRFullBody] Body tracking mode is off (animation-only legs).");
    }
  }

  private ensureClientConnected(): void {
    if (this.client) return;
    const url = resolveSlimeVRWebSocketUrl();
    if (!url) {
      console.log(
        "[SlimeVRFullBody] Mode slimevr but no WebSocket URL (?slimevrWs= or VITE_SLIMEVR_WS)",
      );
      return;
    }
    this.client = new SlimeVRClient(url, () => setSlimeVRLegTrackingActive(false));
    this.client.connect();
    console.log("[SlimeVRFullBody] WebSocket URL:", url);
  }

  private disconnectClient(): void {
    this.client?.disconnect();
    this.client = null;
    setSlimeVRLegTrackingActive(false);
    for (const g of this.markerById.values()) g.visible = false;
  }

  /**
   * Skinning avatar root (e.g. RPM GLB) to drive with leg IK when frames arrive.
   */
  setAvatarRoot(root: Object3D | null): void {
    this.avatarRoot = root;
    this.lensInitialized = false;
    this.hips = null;
    this.leftUpLeg = this.leftLeg = this.leftFoot = null;
    this.rightUpLeg = this.rightLeg = this.rightFoot = null;

    if (!root) return;

    this.hips =
      findFirstBone(root, (n) => /Hips$/i.test(n) || /^mixamorigHips$/i.test(n)) ??
      findFirstBone(root, (n) => n.includes("Hips"));

    this.leftUpLeg = findFirstBone(root, (n) => /LeftUpLeg$/i.test(n) || n.includes("LeftUpLeg"));
    this.leftLeg = findFirstBone(root, (n) => /LeftLeg$/i.test(n) && !n.includes("Up") && n.includes("Left"));
    this.leftFoot = findFirstBone(root, (n) => /LeftFoot$/i.test(n) || n.includes("LeftFoot"));

    this.rightUpLeg = findFirstBone(root, (n) => /RightUpLeg$/i.test(n) || n.includes("RightUpLeg"));
    this.rightLeg = findFirstBone(root, (n) => /RightLeg$/i.test(n) && !n.includes("Up") && n.includes("Right"));
    this.rightFoot = findFirstBone(root, (n) => /RightFoot$/i.test(n) || n.includes("RightFoot"));

    if (this.leftUpLeg && this.leftLeg && this.leftFoot) {
      this.leftLens = measureLegLengths(this.leftUpLeg, this.leftLeg, this.leftFoot);
    }
    if (this.rightUpLeg && this.rightLeg && this.rightFoot) {
      this.rightLens = measureLegLengths(this.rightUpLeg, this.rightLeg, this.rightFoot);
    }
    this.lensInitialized = !!(
      this.hips &&
      this.leftUpLeg &&
      this.leftLeg &&
      this.leftFoot &&
      this.rightUpLeg &&
      this.rightLeg &&
      this.rightFoot
    );

    if (this.lensInitialized) {
      console.log("[SlimeVRFullBody] Leg bones bound; lengths L:", this.leftLens, "R:", this.rightLens);
    } else {
      console.warn("[SlimeVRFullBody] Could not find full leg chain on avatar — IK disabled");
    }
  }

  private getVec3FromTracker(
    frame: SlimeVRFrameMessage,
    id: string,
    out: Vector3,
  ): boolean {
    const t = frame.trackers[id];
    const p = t?.position;
    if (!p || p.length < 3) return false;
    slimeVRPositionToThree(p[0], p[1], p[2], out);
    return true;
  }

  private ensureMarker(id: string): Group {
    let g = this.markerById.get(id);
    if (g) return g;
    g = new Group();
    g.name = `slimevr_tracker_${id}`;
    const axes = new AxesHelper(0.1);
    g.add(axes);
    const ball = new Mesh(
      new SphereGeometry(0.04, 10, 8),
      new MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85 }),
    );
    g.add(ball);
    this.debugRoot.add(g);
    this.markerById.set(id, g);
    return g;
  }

  private updateDebugMarkers(frame: SlimeVRFrameMessage): void {
    const seen = new Set<string>();
    for (const [id, pose] of Object.entries(frame.trackers)) {
      if (!pose?.position || pose.position.length < 3) continue;
      seen.add(id);
      const g = this.ensureMarker(id);
      slimeVRPositionToThree(pose.position[0], pose.position[1], pose.position[2], g.position);
    }
    for (const [id, g] of this.markerById) {
      g.visible = seen.has(id);
    }
  }

  private hasLegTrackingData(frame: SlimeVRFrameMessage): boolean {
    const hip = frame.trackers[TRACKER_IDS.hip]?.position;
    const lf = frame.trackers[TRACKER_IDS.leftFoot]?.position;
    const rf = frame.trackers[TRACKER_IDS.rightFoot]?.position;
    return !!hip && !!lf && !!rf;
  }

  private applyLegIk(frame: SlimeVRFrameMessage): void {
    if (!this.avatarRoot || !this.lensInitialized || !this.hips) return;

    if (
      !this.getVec3FromTracker(frame, TRACKER_IDS.hip, _hipT) ||
      !this.getVec3FromTracker(frame, TRACKER_IDS.leftFoot, _ankleLT) ||
      !this.getVec3FromTracker(frame, TRACKER_IDS.rightFoot, _ankleRT)
    ) {
      return;
    }

    this.avatarRoot.updateMatrixWorld(true);
    getBoneWorldPosition(this.hips, _hipBW);

    _targetAnkleL.copy(_ankleLT).sub(_hipT).add(_hipBW);
    _targetAnkleR.copy(_ankleRT).sub(_hipT).add(_hipBW);

    if (this.getVec3FromTracker(frame, TRACKER_IDS.chest, _chestT)) {
      _pole.copy(_chestT).sub(_hipT).normalize().multiplyScalar(0.4).add(_hipBW);
    } else {
      _pole.set(_hipBW.x, _hipBW.y, _hipBW.z + 0.3);
    }

    if (this.leftUpLeg && this.leftLeg) {
      if (this.getVec3FromTracker(frame, TRACKER_IDS.leftKnee, _kneeTrack)) {
        _kneeW.copy(_kneeTrack).sub(_hipT).add(_hipBW);
      } else {
        computeKneeWorldPosition(
          _hipBW,
          _targetAnkleL,
          _pole,
          this.leftLens.upper,
          this.leftLens.lower,
          _kneeW,
        );
      }
      aimBoneWorld(this.leftUpLeg, _hipBW, _kneeW);
      this.leftUpLeg.updateMatrixWorld(true);
      getBoneWorldPosition(this.leftLeg, _kneeJoint);
      aimBoneWorld(this.leftLeg, _kneeJoint, _targetAnkleL);
    }

    if (this.rightUpLeg && this.rightLeg) {
      if (this.getVec3FromTracker(frame, TRACKER_IDS.rightKnee, _kneeTrack)) {
        _kneeW.copy(_kneeTrack).sub(_hipT).add(_hipBW);
      } else {
        computeKneeWorldPosition(
          _hipBW,
          _targetAnkleR,
          _pole,
          this.rightLens.upper,
          this.rightLens.lower,
          _kneeW,
        );
      }
      aimBoneWorld(this.rightUpLeg, _hipBW, _kneeW);
      this.rightUpLeg.updateMatrixWorld(true);
      getBoneWorldPosition(this.rightLeg, _kneeJoint);
      aimBoneWorld(this.rightLeg, _kneeJoint, _targetAnkleR);
    }
  }

  update(_dt: number): void {
    if (getBodyTrackingMode() === "off") {
      this.disconnectClient();
      return;
    }

    this.ensureClientConnected();

    if (!this.client?.isConnected()) {
      setSlimeVRLegTrackingActive(false);
      for (const g of this.markerById.values()) g.visible = false;
      return;
    }

    const frame = this.client.getLatestFrame();
    if (!frame || !frame.trackers) {
      setSlimeVRLegTrackingActive(false);
      return;
    }

    this.updateDebugMarkers(frame);
    const legs = this.hasLegTrackingData(frame);
    setSlimeVRLegTrackingActive(legs);

    if (legs) {
      this.applyLegIk(frame);
    }
  }

  destroy(): void {
    this.disconnectClient();
    this.world.scene.remove(this.debugRoot);
    this.markerById.clear();
  }
}
