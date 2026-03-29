/**
 * OSC tracker ids (string) as assigned in SlimeVR Server for VRChat-style output.
 * Adjust these to match your server’s numbered trackers (use debug axes in-scene).
 *
 * Typical VRChat indices: 1=hip/waist, 2=chest, 3–4 feet, 5–6 knees, 7–8 elbows.
 * Your hardware may differ — edit to match.
 */
export const TRACKER_IDS = {
  hip: "1",
  chest: "2",
  leftFoot: "3",
  rightFoot: "4",
  leftKnee: "5",
  rightKnee: "6",
  head: "head",
} as const;
