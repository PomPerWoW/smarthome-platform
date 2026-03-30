import { resolveSlimeVRWebSocketUrl } from "./SlimeVRClient";

let legTrackingActive = false;

export function setSlimeVRLegTrackingActive(value: boolean): void {
  legTrackingActive = value;
}

export function getSlimeVRLegTrackingActive(): boolean {
  return legTrackingActive;
}

export type BodyTrackingMode = "slimevr" | "off";

let bodyTrackingMode: BodyTrackingMode = "off";

/**
 * Call once at startup (e.g. from index.ts). Resolves ?bodyTracking=off|slimevr;
 * if omitted, defaults to slimevr when a SlimeVR WebSocket URL is configured, else off.
 */
export function initBodyTrackingModeFromUrl(): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search).get("bodyTracking");
  if (q === "off") {
    bodyTrackingMode = "off";
    return;
  }
  if (q === "slimevr") {
    bodyTrackingMode = "slimevr";
    return;
  }
  bodyTrackingMode = resolveSlimeVRWebSocketUrl() ? "slimevr" : "off";
}

export function getBodyTrackingMode(): BodyTrackingMode {
  return bodyTrackingMode;
}

export function setBodyTrackingMode(mode: BodyTrackingMode): void {
  bodyTrackingMode = mode;
}
