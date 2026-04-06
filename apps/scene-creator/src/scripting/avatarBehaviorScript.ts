/**
 * Normalized behavior script actions for NPCs and the robot assistant.
 *
 * `walk` — patrol routine: forward by `distance` (or default), turn 180°, return to
 * spawn, turn 180° again; then the script advances. All walks use the same fixed speed in-engine.
 */

export type AvatarBehaviorAction =
  | { type: "walk"; distance?: number }
  | { type: "wait"; duration: number }
  | { type: "idle"; duration?: number }
  | { type: "wave" }
  | { type: "sit"; duration?: number };

const ALLOWED = new Set([
  "walk",
  "wait",
  "idle",
  "wave",
  "sit",
]);

export function normalizeAvatarBehaviorScript(raw: unknown): AvatarBehaviorAction[] | null {
  let arr: unknown = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "actions" in raw) {
    arr = (raw as { actions: unknown }).actions;
  }
  if (!Array.isArray(arr)) return null;
  const out: AvatarBehaviorAction[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") return null;
    const type = (item as { type?: string }).type;
    if (!type || !ALLOWED.has(type)) return null;
    switch (type) {
      case "walk": {
        const d = (item as { distance?: unknown }).distance;
        if (d !== undefined) {
          if (typeof d !== "number" || d < 0.25 || d > 8) return null;
        }
        out.push({
          type: "walk",
          distance: typeof d === "number" ? d : undefined,
        });
        break;
      }
      case "wait": {
        const d = (item as { duration?: unknown }).duration;
        if (typeof d !== "number" || d < 0) return null;
        out.push({ type: "wait", duration: d });
        break;
      }
      case "idle": {
        const d = (item as { duration?: unknown }).duration;
        out.push({
          type: "idle",
          duration: typeof d === "number" && d >= 0 ? d : 2,
        });
        break;
      }
      case "wave":
        out.push({ type: "wave" });
        break;
      case "sit": {
        const d = (item as { duration?: unknown }).duration;
        out.push({
          type: "sit",
          duration: typeof d === "number" && d >= 0 ? d : 4,
        });
        break;
      }
      default:
        return null;
    }
  }
  return out;
}
