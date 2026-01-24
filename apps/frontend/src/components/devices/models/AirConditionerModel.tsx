import { useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface AirConditionerModelProps {
  isOn: boolean;
  temperature: number;
}

export function AirConditionerModel({
  isOn,
  temperature,
}: AirConditionerModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/models/devices/air_conditioner/scene.gltf");

  // Calculate color based on temperature (cold = blue, warm = orange)
  const normalizedTemp = Math.max(0, Math.min(1, (temperature - 16) / 14));

  const clonedScene = useMemo(() => {
    const cloned = scene.clone();
    const tintColor = new THREE.Color().lerpColors(
      new THREE.Color(0x4488ff),
      new THREE.Color(0xff8844),
      normalizedTemp,
    );

    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const material = child.material as THREE.MeshStandardMaterial;
        if (material.isMeshStandardMaterial) {
          const newMaterial = material.clone();
          // Only apply emissive glow when device is on
          newMaterial.emissive = isOn ? tintColor : new THREE.Color(0x000000);
          newMaterial.emissiveIntensity = isOn ? 0.15 : 0;
          child.material = newMaterial;
        }
      }
    });

    return cloned;
  }, [scene, normalizedTemp, isOn]);

  return (
    <group ref={groupRef} scale={0.8} position={[0, 0, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

useGLTF.preload("/models/devices/air_conditioner/scene.gltf");
