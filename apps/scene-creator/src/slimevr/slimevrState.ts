export type BodyTrackingMode = "slimevr" | "off";

let bodyTrackingMode: BodyTrackingMode = "off";

/**
 * Call once at startup (e.g. from index.ts). Resolves ?bodyTracking=off|slimevr;
 * if omitted, defaults to slimevr (our single source of tracking).
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
  // We automatically inject the WS URL now, so tracking is always "slimevr" by default
  bodyTrackingMode = "slimevr";
}

export function getBodyTrackingMode(): BodyTrackingMode {
  return bodyTrackingMode;
}

export function setBodyTrackingMode(mode: BodyTrackingMode): void {
  bodyTrackingMode = mode;
}
