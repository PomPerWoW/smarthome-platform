import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

export function WallpaperLassoPointerRaycast({
  active,
  getPlaneMesh,
  lassoFirstCorner,
  onUpdatePreview,
  onLassoPoint,
  lassoHandledByPrimitiveRef,
}: {
  active: boolean;
  getPlaneMesh: () => THREE.Mesh | null;
  lassoFirstCorner: { x: number; y: number } | null;
  onUpdatePreview: (rect: { x: number; y: number; width: number; height: number }) => void;
  onLassoPoint: (localPoint: { x: number; y: number }) => void;
  lassoHandledByPrimitiveRef?: React.MutableRefObject<boolean>;
}) {
  const { camera, gl } = useThree();
  const ndcRef = React.useRef<{ x: number; y: number } | null>(null);
  const raycaster = React.useRef(new THREE.Raycaster());
  const mouse = React.useRef(new THREE.Vector2());
  const getPlaneMeshRef = React.useRef(getPlaneMesh);
  const onLassoPointRef = React.useRef(onLassoPoint);
  getPlaneMeshRef.current = getPlaneMesh;
  onLassoPointRef.current = onLassoPoint;

  React.useEffect(() => {
    if (!active || !gl.domElement) return;
    const el = gl.domElement;
    const onPointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ndcRef.current = { x, y };
    };
    const onPointerDown = (e: PointerEvent) => {
      if (lassoHandledByPrimitiveRef?.current) {
        lassoHandledByPrimitiveRef.current = false;
        return;
      }
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const plane = getPlaneMeshRef.current();
      if (!plane) return;
      mouse.current.set(x, y);
      raycaster.current.setFromCamera(mouse.current, camera);
      plane.updateMatrixWorld(true);
      const hits = raycaster.current.intersectObject(plane, true);
      if (hits.length === 0) return;
      const local = new THREE.Vector3().copy(hits[0].point);
      plane.worldToLocal(local);
      onLassoPointRef.current({ x: local.x, y: local.y });
      if (lassoHandledByPrimitiveRef) lassoHandledByPrimitiveRef.current = true;
    };
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerdown", onPointerDown);
    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerdown", onPointerDown);
      ndcRef.current = null;
    };
  }, [active, gl.domElement, camera]);

  useFrame(() => {
    if (!active || !lassoFirstCorner) return;
    const ndc = ndcRef.current;
    if (!ndc) return;
    const plane = getPlaneMesh();
    if (!plane) return;
    mouse.current.set(ndc.x, ndc.y);
    raycaster.current.setFromCamera(mouse.current, camera);
    plane.updateMatrixWorld(true);
    const hits = raycaster.current.intersectObject(plane, true);
    if (hits.length === 0) return;
    const local = new THREE.Vector3().copy(hits[0].point);
    plane.worldToLocal(local);
    const first = lassoFirstCorner;
    const x = Math.min(first.x, local.x);
    const y = Math.min(first.y, local.y);
    const width = Math.abs(local.x - first.x);
    const height = Math.abs(local.y - first.y);
    onUpdatePreview({ x, y, width, height });
  });

  return null;
}
