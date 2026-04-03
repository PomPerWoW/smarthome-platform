import { createSystem, Object3D } from "@iwsdk/core";
import {
  AxesHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from "three";

import { slimeVRPositionToThree } from "../slimevr/coords";
import { SlimeVRClient, resolveSlimeVRWebSocketUrl } from "../slimevr/SlimeVRClient";
import { getBodyTrackingMode } from "../slimevr/slimevrState";
import type { SlimeVRFrameMessage } from "../slimevr/types";

/**
 * Subscribes to the SlimeVR bridge WebSocket and shows world-space tracker markers only.
 * No OSC tracker → avatar bone mapping or IK.
 */
export class SlimeVRFullBodySystem extends createSystem({}) {
  private client: SlimeVRClient | null = null;
  private debugRoot = new Group();
  private markerById = new Map<string, Group>();

  init(): void {
    this.debugRoot.name = "SlimeVR_Debug";
    this.world.scene.add(this.debugRoot as unknown as Object3D);

    if (getBodyTrackingMode() === "slimevr") {
      this.ensureClientConnected();
    } else {
      console.log("[SlimeVRFullBody] Body tracking mode is off.");
    }
  }

  private ensureClientConnected(): void {
    if (this.client) return;
    const url = resolveSlimeVRWebSocketUrl();
    if (!url) {
      console.log(
        "[SlimeVRFullBody] Mode slimevr but no WebSocket URL (VITE_SLIMEVR_WS)",
      );
      return;
    }
    this.client = new SlimeVRClient(url);
    this.client.connect();
    console.log("[SlimeVRFullBody] WebSocket URL:", url);
  }

  private disconnectClient(): void {
    this.client?.disconnect();
    this.client = null;
    for (const g of this.markerById.values()) g.visible = false;
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

  update(_dt: number): void {
    if (getBodyTrackingMode() === "off") {
      this.disconnectClient();
      return;
    }

    this.ensureClientConnected();

    if (!this.client?.isConnected()) {
      for (const g of this.markerById.values()) g.visible = false;
      return;
    }

    const frame = this.client.getLatestFrame();
    if (!frame || !frame.trackers) {
      return;
    }

    this.updateDebugMarkers(frame);
  }

  destroy(): void {
    this.disconnectClient();
    this.world.scene.remove(this.debugRoot as unknown as Object3D);
    this.markerById.clear();
  }
}
