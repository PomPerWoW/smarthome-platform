/**
 * OSC tracker ids (string) as assigned in SlimeVR Server for VRChat-style output.
 * Adjust these to match your server’s numbered trackers (use debug axes in-scene).
 *
 * Typical VRChat indices: 1=hip/waist, 2=chest, 3–4 feet, 5–6 knees, 7–8 elbows.
 * Your hardware may differ — edit to match.
 */
export const TRACKER_IDS = {
  head: "head",
  hip: "1",
  leftAnkle: "2",
  rightAnkle: "3",
  leftThigh: "4",
  rightThigh: "5",
  chest: "6",
  leftHand: "7",
  rightHand: "8",
} as const;
