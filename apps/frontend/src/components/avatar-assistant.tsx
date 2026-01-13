import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import { useRef, useState, useEffect, Suspense } from "react";
import * as THREE from "three";

const AVATAR_URL = "/models/avatar/assistant/robot.glb";

interface Avatar3DProps {
  isSpeaking?: boolean;
  isListening?: boolean;
  isShaking?: boolean;
  audioData?: number;
}

function Avatar3DComponent({
  isSpeaking = false,
  isListening = false,
  isShaking = false,
  audioData = 0,
}: Avatar3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(AVATAR_URL);
  const clonedScene = scene.clone();
  const shakeTimeRef = useRef(0);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const t = state.clock.elapsedTime;

    const breathIntensity = 0.08;
    const baseY = Math.sin(t * 1.5) * breathIntensity;

    if (isShaking) {
      shakeTimeRef.current += delta * 4;
      groupRef.current.position.y = baseY;
      groupRef.current.rotation.z = Math.sin(shakeTimeRef.current) * 0.3;
      groupRef.current.rotation.y = Math.sin(shakeTimeRef.current * 0.5) * 0.15;

    } else if (isSpeaking) {
      const speakBounce = Math.sin(t * 5) * 0.08 * (0.6 + audioData * 0.4);
      groupRef.current.position.y = baseY + speakBounce;

      // Subtle head movement - not rotating the whole body
      groupRef.current.rotation.y = Math.sin(t * 3) * 0.08;
      groupRef.current.rotation.x = Math.sin(t * 2.5) * 0.04;
      groupRef.current.rotation.z = Math.sin(t * 2) * 0.03;

    } else if (isListening) {
      groupRef.current.position.y = baseY;
      groupRef.current.rotation.x = 0.08;
      groupRef.current.rotation.y = Math.sin(t * 1.5) * 0.04;
      groupRef.current.rotation.z = Math.sin(t * 1.2) * 0.02;

    } else {
      shakeTimeRef.current = 0;
      groupRef.current.position.y = baseY;
      groupRef.current.rotation.y *= 0.92;
      groupRef.current.rotation.x *= 0.92;
      groupRef.current.rotation.z *= 0.92;
    }
  });

  return (
    <>
      <Environment preset="studio" />
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} />
      <directionalLight position={[-4, 3, -2]} intensity={0.6} />
      <pointLight
        position={[0, 2, 2]}
        intensity={0.8}
        color={isSpeaking ? "#4ade80" : isShaking ? "#f59e0b" : "#60a5fa"}
      />

      <group ref={groupRef}>
        <primitive
          object={clonedScene}
          position={[0, -0.6, 0]}
          scale={[2.6, 2.6, 2.6]}
        />
      </group>

      {/* Glow effects */}
      {isSpeaking && (
        <pointLight
          position={[0, 0.3, 0.5]}
          intensity={1.5}
          color="#4ade80"
          distance={2}
        />
      )}
      {isShaking && (
        <pointLight
          position={[0, 0.3, 0.5]}
          intensity={1.5}
          color="#f59e0b"
          distance={2}
        />
      )}
    </>
  );
}

interface AvatarAssistantProps {
  isSpeaking?: boolean;
  isListening?: boolean;
  isShaking?: boolean;
  audioData?: number;
}

export function AvatarAssistant({
  isSpeaking = false,
  isListening = false,
  isShaking = false,
  audioData = 0,
}: AvatarAssistantProps) {
  const getBorderColor = () => {
    if (isSpeaking) return "#4ade80";
    if (isShaking) return "#f59e0b";
    if (isListening) return "#60a5fa";
    return "#93c5fd";
  };

  const getBoxShadow = () => {
    if (isSpeaking) return "0 0 30px rgba(74, 222, 128, 0.4)";
    if (isShaking) return "0 0 30px rgba(245, 158, 11, 0.4)";
    if (isListening) return "0 0 30px rgba(96, 165, 250, 0.4)";
    return "0 0 20px rgba(147, 197, 253, 0.2)";
  };

  const getStatus = () => {
    if (isSpeaking) return "Speaking";
    if (isShaking) return "Shaking";
    if (isListening) return "Listening";
    return "Idle";
  };

  const getStatusColor = () => {
    if (isSpeaking) return "#4ade80";
    if (isShaking) return "#f59e0b";
    if (isListening) return "#60a5fa";
    return "#94a3b8";
  };

  return (
    <div className="fixed bottom-8 right-8 z-[1000]">
      <div className="relative" style={{ width: "180px", height: "180px" }}>
        <div
          className="w-full h-full rounded-full border-4 bg-gradient-to-br from-blue-400/10 to-blue-500/10 flex items-center justify-center overflow-hidden relative shadow-lg"
          style={{
            width: "180px",
            height: "180px",
            borderColor: getBorderColor(),
            boxShadow: getBoxShadow()
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
              <Avatar3DComponent
                isSpeaking={isSpeaking}
                isListening={isListening}
                isShaking={isShaking}
                audioData={audioData}
              />
            </Suspense>
          </Canvas>

          {isListening && (
            <div
              className="absolute inset-0 rounded-full border-4 border-blue-500 opacity-60"
              style={{
                animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
          )}

          {isSpeaking && (
            <>
              <div
                className="absolute inset-0 rounded-full border-4 border-green-400 opacity-40"
                style={{
                  animation: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite",
                }}
              />
              <div
                className="absolute inset-0 rounded-full border-4 border-green-500 opacity-30"
                style={{
                  animation: "ping 1s cubic-bezier(0, 0, 0.2, 1) infinite 0.5s",
                }}
              />
            </>
          )}

          {isShaking && (
            <div
              className="absolute inset-0 rounded-full border-4 border-orange-400 opacity-50"
              style={{
                animation: "pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite",
              }}
            />
          )}
        </div>

        <div
          className="absolute -top-2 -right-2 px-2 py-1 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: getStatusColor(),
            color: "white"
          }}
        >
          {getStatus()}
        </div>
      </div>
    </div>
  );
}

export default function AvatarDemo() {
  const [state, setState] = useState<"idle" | "listening" | "speaking" | "shaking">("idle");
  const [audioData, setAudioData] = useState(0);
  const audioIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (state === "speaking") {
      audioIntervalRef.current = window.setInterval(() => {
        setAudioData(Math.random() * 0.7 + 0.3);
      }, 100);
    } else {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
        audioIntervalRef.current = null;
      }
      setAudioData(0);
    }

    return () => {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
      }
    };
  }, [state]);

  const handleSpeak = () => {
    setState("speaking");
    setTimeout(() => setState("idle"), 5000);
  };

  const handleListen = () => {
    setState("listening");
    setTimeout(() => setState("idle"), 3000);
  };

  const handleShake = () => {
    setState("shaking");
    setTimeout(() => setState("idle"), 3000);
  };

  return (
    <div className="w-full h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 relative overflow-hidden flex items-center justify-center">
      {/* Background effects */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
      </div>

      <div className="relative z-10 bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white/20 max-w-2xl w-full">
        <h2 className="text-2xl font-semibold text-white mb-6 text-center">
          Avatar Control Panel (For testing actions)
        </h2>

        <div className="grid grid-cols-4 gap-4">
          <button
            onClick={() => setState("idle")}
            className="px-4 py-4 rounded-xl font-semibold transition-all transform hover:scale-105"
            style={{
              backgroundColor: state === "idle" ? "#94a3b8" : "#475569",
              color: "white"
            }}
          >
            Idle
          </button>

          <button
            onClick={handleListen}
            disabled={state !== "idle"}
            className="px-4 py-4 rounded-xl font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: state === "listening" ? "#60a5fa" : "#3b82f6",
              color: "white"
            }}
          >
            Listen
          </button>

          <button
            onClick={handleSpeak}
            disabled={state !== "idle"}
            className="px-4 py-4 rounded-xl font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: state === "speaking" ? "#4ade80" : "#22c55e",
              color: "white"
            }}
          >
            Speak
          </button>

          <button
            onClick={handleShake}
            disabled={state !== "idle"}
            className="px-4 py-4 rounded-xl font-semibold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: state === "shaking" ? "#f59e0b" : "#f97316",
              color: "white"
            }}
          >
            Shake
          </button>
        </div>

        <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-center mt-8">
          <p className="text-sm text-blue-200">Current Status:</p>
          <p className="text-xl font-bold text-white mt-1 capitalize">{state}</p>
        </div>
      </div>

      <AvatarAssistant
        isSpeaking={state === "speaking"}
        isListening={state === "listening"}
        isShaking={state === "shaking"}
        audioData={audioData}
      />

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 0.6;
            transform: scale(1);
          }
          50% {
            opacity: 0.3;
            transform: scale(1.05);
          }
        }
        
        @keyframes ping {
          0% {
            transform: scale(1);
            opacity: 0.4;
          }
          75%, 100% {
            transform: scale(1.2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

useGLTF.preload(AVATAR_URL);