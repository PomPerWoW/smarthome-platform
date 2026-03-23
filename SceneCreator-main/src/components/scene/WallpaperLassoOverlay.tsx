import * as React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

export interface LassoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WallpaperLassoOverlayProps {
  getPlaneMesh: () => THREE.Mesh | null;
  lassoRegions: LassoRect[];
  previewRect: { x: number; y: number; width: number; height: number } | null;
  visible: boolean;
}

function makeRectLineSegments(rect: LassoRect, z: number): Float32Array {
  const { x, y, width, height } = rect;
  const x1 = x;
  const y1 = y;
  const x2 = x + width;
  const y2 = y + height;
  const vertices = [
    x1, y1, z, x2, y1, z,
    x2, y1, z, x2, y2, z,
    x2, y2, z, x1, y2, z,
    x1, y2, z, x1, y1, z,
  ];
  return new Float32Array(vertices);
}

export function WallpaperLassoOverlay({
  getPlaneMesh,
  lassoRegions,
  previewRect,
  visible,
}: WallpaperLassoOverlayProps) {
  const groupRef = React.useRef<THREE.Group>(null);

  const allVertices = React.useMemo(() => {
    const chunks: number[] = [];
    for (const rect of lassoRegions) {
      chunks.push(...Array.from(makeRectLineSegments(rect, 0.005)));
    }
    return new Float32Array(chunks);
  }, [lassoRegions]);

  const previewVertices = React.useMemo(() => {
    if (!previewRect || previewRect.width < 0.001 || previewRect.height < 0.001) {
      return new Float32Array(0);
    }
    return makeRectLineSegments(previewRect, 0.006);
  }, [previewRect]);

  useFrame(() => {
    const group = groupRef.current;
    const plane = getPlaneMesh();
    if (!group || !plane || !visible) return;
    plane.updateMatrixWorld(true);
    const parent = group.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      group.matrix.copy(plane.matrixWorld).premultiply(parent.matrixWorld.clone().invert());
      group.matrix.decompose(group.position, group.quaternion, group.scale);
    } else {
      group.position.setFromMatrixPosition(plane.matrixWorld);
      group.quaternion.setFromRotationMatrix(plane.matrixWorld);
      group.scale.setFromMatrixScale(plane.matrixWorld);
    }
  });

  if (!visible) return null;

  const regionsKey = lassoRegions.length + lassoRegions.map((r) => `${r.x.toFixed(3)},${r.y.toFixed(3)},${r.width.toFixed(3)},${r.height.toFixed(3)}`).join("|");

  return (
    <group ref={groupRef}>
      {allVertices.length > 0 && (
        <lineSegments key={`lasso-confirmed-${regionsKey}`}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={allVertices.length / 3}
              array={allVertices}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#22C55E" linewidth={2} />
        </lineSegments>
      )}
      {previewVertices.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={previewVertices.length / 3}
              array={previewVertices}
              itemSize={3}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#F59E0B" linewidth={2} />
        </lineSegments>
      )}
    </group>
  );
}
