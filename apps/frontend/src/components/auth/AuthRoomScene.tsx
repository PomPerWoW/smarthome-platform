import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Environment, Center } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const ROOM_MODEL_PATH = "/models/rooms/modern_dining_room/scene.gltf";

// Rotation limits (180 degrees = PI radians, centered around the front view)
const MIN_AZIMUTH = -Math.PI / 2; // -90 degrees
const MAX_AZIMUTH = Math.PI / 2; // +90 degrees

function DiningRoomModel() {
  const { scene } = useGLTF(ROOM_MODEL_PATH);

  return (
    <Center>
      <primitive object={scene} scale={1.5} />
    </Center>
  );
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#3f3f46" wireframe />
    </mesh>
  );
}

function AnimatedControls() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (controlsRef.current) {
      timeRef.current += delta * 0.3;
      const oscillation = Math.sin(timeRef.current);
      const targetAzimuth = oscillation * (Math.PI / 3);

      controlsRef.current.setAzimuthalAngle(
        THREE.MathUtils.lerp(
          controlsRef.current.getAzimuthalAngle(),
          targetAzimuth,
          0.02,
        ),
      );
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableZoom={false}
      enablePan={false}
      autoRotate={false}
      minPolarAngle={Math.PI / 2.5}
      maxPolarAngle={Math.PI / 2}
      minAzimuthAngle={MIN_AZIMUTH}
      maxAzimuthAngle={MAX_AZIMUTH}
    />
  );
}

export function AuthRoomScene() {
  return (
    <div className="absolute inset-0">
      <Canvas
        camera={{ position: [6, 1.5, 6], fov: 50 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Suspense fallback={<LoadingFallback />}>
          {/* Lighting - brighter for better visibility */}
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[5, 10, 5]}
            intensity={1.5}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <pointLight position={[-5, 5, -5]} intensity={0.8} color="#ffd9b3" />
          <pointLight position={[5, 2, 5]} intensity={0.4} color="#b3d9ff" />

          {/* Environment for reflections */}
          <Environment preset="apartment" />

          {/* The Room Model */}
          <DiningRoomModel />

          {/* Controls - limited to 180 degree rotation */}
          <AnimatedControls />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Preload the model
useGLTF.preload(ROOM_MODEL_PATH);
