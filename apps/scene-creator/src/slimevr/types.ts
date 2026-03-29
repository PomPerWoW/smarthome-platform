export interface SlimeVRTrackerPose {
  position?: [number, number, number];
  rotation?: [number, number, number];
}

export interface SlimeVRFrameMessage {
  type: "slimevr_frame";
  seq: number;
  t: number;
  trackers: Record<string, SlimeVRTrackerPose>;
}

export interface SlimeVRHelloMessage {
  type: "slimevr_hello";
  t: number;
}

export type SlimeVRBridgeMessage = SlimeVRFrameMessage | SlimeVRHelloMessage;
