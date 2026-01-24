import { useRef, useMemo, useEffect } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface FanModelProps {
  speed: number;
  swing: boolean;
}

export function FanModel({ speed, swing }: FanModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF("/models/devices/fan/scene.gltf");
  const { actions } = useAnimations(animations, groupRef);

  const clonedScene = useMemo(() => scene.clone(), [scene]);

  useEffect(() => {
    const action = actions["Motor_Housing|Motor_HousingAction"];
    if (action) {
      // Animation depends on swing property from backend
      if (swing) {
        action.timeScale = speed > 0 ? speed / 2 : 1;
        action.play();
      } else {
        action.stop();
      }
    }
  }, [actions, swing, speed]);

  useFrame((state) => {
    if (groupRef.current && swing && speed > 0) {
      groupRef.current.rotation.y =
        Math.sin(state.clock.elapsedTime * 0.5) * 0.3;
    } else if (groupRef.current && !swing) {
      groupRef.current.rotation.y = 0;
    }
  });

  return (
    <group ref={groupRef} scale={0.8} position={[0, 0, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

useGLTF.preload("/models/devices/fan/scene.gltf");
