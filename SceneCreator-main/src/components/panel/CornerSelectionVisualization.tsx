import * as React from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

interface Corner {
  position: THREE.Vector3;
  index: number;
}

interface CornerSelectionVisualizationProps {
  corners: Corner[];
  selectedCornerIndex: number | null;
  onCornerSelect: (index: number) => void;
  visible: boolean;
}

export function CornerSelectionVisualization({
  corners,
  selectedCornerIndex,
  onCornerSelect,
  visible,
}: CornerSelectionVisualizationProps) {
  const cornerRefs = React.useRef<(THREE.Mesh | null)[]>([]);
  const raycaster = React.useRef(new THREE.Raycaster());
  const camera = React.useRef<THREE.Camera | null>(null);

  React.useEffect(() => {
    cornerRefs.current = corners.map(() => null);
  }, [corners.length]);

  useFrame((state) => {
    if (!visible || !camera.current) return;
    camera.current = state.camera;

    const cameraPosition = new THREE.Vector3();
    state.camera.getWorldPosition(cameraPosition);
    
    const cameraDirection = new THREE.Vector3();
    state.camera.getWorldDirection(cameraDirection);

    raycaster.current.set(cameraPosition, cameraDirection);

    for (let i = 0; i < corners.length; i++) {
      const cornerMesh = cornerRefs.current[i];
      if (!cornerMesh) continue;

      const intersects = raycaster.current.intersectObject(cornerMesh);
      if (intersects.length > 0) {
      }
    }
  });

  if (!visible) return null;

  return (
    <group>
      {corners.map((corner, arrayIndex) => {
        const isSelected = selectedCornerIndex === corner.index;
        const scale = isSelected ? 1.5 : 1.0;
        const color = isSelected ? "#4CAF50" : "#3FA4CE";

        return (
          <group key={corner.index}>
            {/* Corner marker sphere */}
            <mesh
              ref={(el) => {
                cornerRefs.current[arrayIndex] = el;
              }}
              position={corner.position}
              scale={scale}
              onPointerEnter={(e) => {
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onCornerSelect(corner.index);
              }}
            >
              <sphereGeometry args={[0.1, 16, 16]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.5}
                transparent
                opacity={0.8}
              />
            </mesh>

            {/* Corner highlight ring */}
            <mesh position={corner.position} rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.12, 0.15, 32]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.3}
                transparent
                opacity={0.6}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Corner label number */}
            <mesh position={[corner.position.x, corner.position.y + 0.2, corner.position.z]}>
              <boxGeometry args={[0.15, 0.15, 0.05]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.4}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

