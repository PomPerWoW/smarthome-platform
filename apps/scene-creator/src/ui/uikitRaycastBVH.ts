import { BufferGeometry, Object3D } from "three";

/**
 * IWSDK / @pmndrs/pointer-events use three-mesh-bvh accelerated `Mesh.raycast`.
 * The XR hit dot only renders on a valid intersection — stale BVHs → line only, no dot.
 *
 * @pmndrs/uikit meshes often share one `BufferGeometry`. We dedupe by geometry when
 * rebuilding. `scheduleUIKitInteractableBVHRefresh` keeps a per-`Object3D` generation so
 * multiple panel instances do not cancel each other's pending refreshes.
 */
type RaycastBVHGeometry = BufferGeometry & {
  boundsTree?: unknown;
  computeBoundsTree?: () => void;
  disposeBoundsTree?: () => void;
};

const scheduleGenByPanelRoot = new WeakMap<Object3D, { gen: number }>();

function getScheduleState(root: Object3D): { gen: number } {
  let s = scheduleGenByPanelRoot.get(root);
  if (!s) {
    s = { gen: 0 };
    scheduleGenByPanelRoot.set(root, s);
  }
  return s;
}

/** Drop pending double-rAF refresh for this panel (e.g. on destroy). */
export function invalidateUIKitInteractableBVHSchedule(
  root: Object3D | null | undefined,
): void {
  if (!root) return;
  const s = scheduleGenByPanelRoot.get(root);
  if (s) s.gen++;
}

export function refreshUIKitInteractableBVH(
  root: Object3D | null | undefined,
): void {
  if (!root) return;
  const seen = new WeakSet<BufferGeometry>();
  root.traverse((child) => {
    const o = child as Object3D & { isMesh?: boolean; geometry?: BufferGeometry };
    if (o.isMesh !== true || !o.geometry) return;
    const geom = o.geometry as RaycastBVHGeometry;
    if (seen.has(geom)) return;
    seen.add(geom);
    try {
      if (typeof geom.disposeBoundsTree === "function") {
        geom.disposeBoundsTree();
      } else if (geom.boundsTree != null) {
        geom.boundsTree = null;
      }
      if (typeof geom.computeBoundsTree === "function") {
        geom.computeBoundsTree();
      }
    } catch {
      /* non-BVH geometry or compute failed — ignore */
    }
  });
}

/** After UIKit `setProperties` / layout changes, run after DOM updates (double rAF). */
export function scheduleUIKitInteractableBVHRefresh(
  root: Object3D | null | undefined,
): void {
  if (!root) return;
  const state = getScheduleState(root);
  const myGen = ++state.gen;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (myGen !== state.gen) return;
      refreshUIKitInteractableBVH(root);
    });
  });
}
