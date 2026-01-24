import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import { useRef, Suspense } from "react";
import * as THREE from "three";

const AVATAR_URL = "/models/avatar/assistant/robot.glb";

function RobotAssistantComponent() {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(AVATAR_URL);
  const clonedScene = scene.clone();

  useFrame((state) => {
    if (!groupRef.current) return;

    const t = state.clock.elapsedTime;
    const breathIntensity = 0.08;
    const baseY = Math.sin(t * 1.5) * breathIntensity;

    groupRef.current.position.y = baseY;

    groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.05;
  });

  return (
    <>
      <Environment preset="studio" />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} />
      <directionalLight position={[-4, 3, -2]} intensity={0.6} />
      <pointLight position={[0, 2, 2]} intensity={0.8} color="#60a5fa" />

      <group ref={groupRef}>
        <primitive
          object={clonedScene}
          position={[0, -0.6, 0]}
          scale={[2.6, 2.6, 2.6]}
        />
      </group>
    </>
  );
}

export function RobotAssistant() {
  return (
    <div className="fixed bottom-8 right-8 z-[1000]">
      <div className="relative" style={{ width: "180px", height: "180px" }}>
        <div
          className="w-full h-full rounded-full border-4 bg-gradient-to-br from-blue-400/10 to-blue-500/10 flex items-center justify-center overflow-hidden relative shadow-lg"
          style={{
            width: "180px",
            height: "180px",
            borderColor: "#93c5fd",
            boxShadow: "0 0 20px rgba(147, 197, 253, 0.2)"
          }}
        >
          <Canvas
            camera={{
              position: [0, 0.9, 3.0],
              fov: 35,
            }}
            gl={{ antialias: true, alpha: true }}
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
            }}
          >
            <Suspense fallback={null}>
              <RobotAssistantComponent />
            </Suspense>
          </Canvas>
        </div>
      </div>
    </div>
  );
}

useGLTF.preload(AVATAR_URL);