/**
 * Normalized behavior script actions for NPCs and the robot assistant.
 * Coordinates in "walk" are room-local XZ (same space as navmesh clamp / room bounds).
 */

export type AvatarBehaviorAction =
  | { type: "walk"; target: [number, number]; speed?: number }
  | { type: "wander"; duration: number; speed?: number }
  | { type: "wait"; duration: number }
  | { type: "idle"; duration?: number }
  | { type: "wave" }
  | { type: "sit"; duration?: number };

const ALLOWED = new Set([
  "walk",
  "wander",
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
        const t = (item as { target?: unknown; speed?: unknown }).target;
        if (
          !Array.isArray(t) ||
          t.length < 2 ||
          typeof t[0] !== "number" ||
          typeof t[1] !== "number"
        ) {
          return null;
        }
        const speed = (item as { speed?: number }).speed;
        out.push({
          type: "walk",
          target: [t[0], t[1]],
          speed: typeof speed === "number" ? speed : undefined,
        });
        break;
      }
      case "wander": {
        const dur = (item as { duration?: unknown }).duration;
        if (typeof dur !== "number" || dur <= 0 || !Number.isFinite(dur)) {
          return null;
        }
        const speed = (item as { speed?: number }).speed;
        out.push({
          type: "wander",
          duration: dur,
          speed: typeof speed === "number" ? speed : undefined,
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
