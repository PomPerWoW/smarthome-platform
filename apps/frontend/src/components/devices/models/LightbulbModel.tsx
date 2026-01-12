import { useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface LightbulbModelProps {
  brightness: number;
  colour: string;
}

export function LightbulbModel({ brightness, colour }: LightbulbModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/models/devices/lightbulb/scene.gltf");

  const glowIntensity = brightness / 100;
  const glowColor = new THREE.Color(colour);

  const clonedScene = useMemo(() => {
    const cloned = scene.clone();

    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const material = child.material as THREE.MeshStandardMaterial;

        if (
          material.name === "bulb" ||
          material.name?.toLowerCase().includes("bulb")
        ) {
          const newMaterial = material.clone();
          newMaterial.emissive = glowColor;
          newMaterial.emissiveIntensity = glowIntensity * 2;
          if (brightness > 0) {
            newMaterial.transparent = true;
            newMaterial.opacity = 0.9;
          }
          child.material = newMaterial;
        }
      }
    });

    return cloned;
  }, [scene, glowColor, glowIntensity, brightness]);

  return (
    <group ref={groupRef} scale={0.25} position={[0, 0, 0]}>
      <primitive object={clonedScene} />
      {brightness > 0 && (
        <pointLight
          color={colour}
          intensity={glowIntensity * 3}
          distance={5}
          position={[0, 40, 0]}
        />
      )}
    </group>
  );
}

useGLTF.preload("/models/devices/lightbulb/scene.gltf");
