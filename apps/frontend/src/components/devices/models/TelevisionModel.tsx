import { useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface TelevisionModelProps {
  isOn: boolean;
}

export function TelevisionModel({ isOn }: TelevisionModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/models/devices/television/scene.gltf");

  const clonedScene = useMemo(() => {
    const cloned = scene.clone();

    if (isOn) {
      cloned.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const name = child.name.toLowerCase();
          if (name.includes("screen") || name.includes("display")) {
            const material = child.material as THREE.MeshStandardMaterial;
            if (material.isMeshStandardMaterial) {
              const newMaterial = material.clone();
              newMaterial.emissive = new THREE.Color(0x4488ff);
              newMaterial.emissiveIntensity = 0.5;
              child.material = newMaterial;
            }
          }
        }
      });
    }

    return cloned;
  }, [scene, isOn]);

  return (
    <group ref={groupRef} scale={0.8} position={[0, 0, 0]}>
      <primitive object={clonedScene} />
      {isOn && (
        <rectAreaLight
          color={0x4488ff}
          intensity={2}
          width={0.5}
          height={0.3}
          position={[0, 0.2, 0.3]}
        />
      )}
    </group>
  );
}

useGLTF.preload("/models/devices/television/scene.gltf");
