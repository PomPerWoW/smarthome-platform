import { useRef, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

interface SmartMeterModelProps {
    isOn: boolean;
}

export function SmartMeterModel({ isOn }: SmartMeterModelProps) {
    const groupRef = useRef<THREE.Group>(null);
    const { scene } = useGLTF(`${import.meta.env.BASE_URL}models/devices/smartmeter/scene.gltf`);

    const clonedScene = useMemo(() => {
        const cloned = scene.clone();

        // Optional: Add glow/emissive effect when on
        cloned.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
                const material = child.material as THREE.MeshStandardMaterial;
                if (material.isMeshStandardMaterial) {
                    const newMaterial = material.clone();
                    // Fix intrinsic model transparency issues
                    newMaterial.transparent = false;
                    newMaterial.depthWrite = true;
                    newMaterial.opacity = 1;

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
        <group ref={groupRef} scale={0.2} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <primitive object={clonedScene} />
        </group>
    );
}

useGLTF.preload(`${import.meta.env.BASE_URL}models/devices/smartmeter/scene.gltf`);
