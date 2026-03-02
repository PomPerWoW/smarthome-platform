import { useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface SmartMeterModelProps {
    isOn: boolean;
}

export function SmartMeterModel({ isOn }: SmartMeterModelProps) {
    const groupRef = useRef<THREE.Group>(null);
    const { scene } = useGLTF("/models/devices/smartmeter/scene.gltf");

    const clonedScene = useMemo(() => {
        const cloned = scene.clone();

        // Optional: Add glow/emissive effect when on
        cloned.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const material = child.material as THREE.MeshStandardMaterial;
                if (material.isMeshStandardMaterial) {
                    const newMaterial = material.clone();
                    if (isOn) {
                        // Example: A blueish/green glow when active
                        // newMaterial.emissive = new THREE.Color(0x00ff88);
                        // newMaterial.emissiveIntensity = 0.5;
                    } else {
                        newMaterial.emissive = new THREE.Color(0x000000);
                        newMaterial.emissiveIntensity = 0;
                    }
                    child.material = newMaterial;
                }
            }
        });

        return cloned;
    }, [scene, isOn]);

    return (
        <group ref={groupRef} scale={0.005} position={[-0.5, 1, 0]}>
            <primitive object={clonedScene} />
        </group>
    );
}

useGLTF.preload("/models/devices/smartmeter/scene.gltf");
