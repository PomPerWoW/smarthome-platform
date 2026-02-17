import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { useRef, Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { LoopOnce, LoopRepeat } from "three";
import { useUIStore } from "@/stores/ui_store";

const AVATAR_URL = "/models/avatar/assistant/robot_3D_scene.glb";

const DEFAULT_ANIMATION = "Idle";
const FADE_DURATION = 0.25;

const VOICE_STANDING = "Standing";
const EMOTE_YES = "Yes";
const EMOTE_THUMBS_UP = "ThumbsUp";
const EMOTE_WAVE = "Wave";

function RobotAssistantScene() {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(AVATAR_URL);
  const clonedScene = useMemo(() => cloneSkinned(scene), [scene]);
  // Pass the scene object directly so the mixer roots at the skeleton (avoids ref timing)
  const { actions, mixer } = useAnimations(animations, clonedScene);

  const voiceStatus = useUIStore((s) => s.voice_status);
  const voicePayload = useUIStore((s) => s.voice_payload);
  const clearVoicePayload = useUIStore((s) => s.clear_voice_payload);

  const currentActionNameRef = useRef<string>(DEFAULT_ANIMATION);
  const sequenceRef = useRef<{ names: string[]; index: number } | null>(null);
  const finishedHandlerRef = useRef<((e: any) => void) | null>(null);

  const configureAction = (name: string, action: THREE.AnimationAction) => {
    // Base loops
    if (name === "Idle" || name === "Walking") {
      action.loop = LoopRepeat;
      action.clampWhenFinished = false;
      return;
    }
    action.loop = LoopOnce;
    action.clampWhenFinished = true;
  };

  const fadeToAction = (name: string, duration = FADE_DURATION) => {
    const next = actions[name];
    if (!next) return;

    configureAction(name, next);

    const prevName = currentActionNameRef.current;
    const prev = prevName ? actions[prevName] : undefined;

    if (prev && prev !== next) {
      prev.fadeOut(duration);
    }

    next
      .reset()
      .setEffectiveTimeScale(1)
      .setEffectiveWeight(1)
      .fadeIn(duration)
      .play();

    currentActionNameRef.current = name;
  };

  const cancelSequence = () => {
    sequenceRef.current = null;
    if (finishedHandlerRef.current) {
      mixer.removeEventListener("finished", finishedHandlerRef.current);
      finishedHandlerRef.current = null;
    }
  };

  const playEmoteSequence = (names: string[]) => {
    if (names.length === 0) return;
    cancelSequence();
    sequenceRef.current = { names, index: 0 };

    const playNext = () => {
      const seq = sequenceRef.current;
      if (!seq) return;
      const nextName = seq.names[seq.index];
      if (!actions[nextName]) {
        // Skip missing clips
        sequenceRef.current = null;
        fadeToAction(DEFAULT_ANIMATION);
        return;
      }

      fadeToAction(nextName, 0.2);

      // Ensure only one listener is active
      if (finishedHandlerRef.current) {
        mixer.removeEventListener("finished", finishedHandlerRef.current);
        finishedHandlerRef.current = null;
      }

      const onFinished = (e: any) => {
        const finishedName =
          e?.action?.getClip?.()?.name ?? e?.action?._clip?.name ?? "";
        if (finishedName !== nextName) return;

        mixer.removeEventListener("finished", onFinished);
        finishedHandlerRef.current = null;

        const currentSeq = sequenceRef.current;
        if (!currentSeq) return;
        currentSeq.index++;
        if (currentSeq.index < currentSeq.names.length) {
          playNext();
        } else {
          sequenceRef.current = null;
          fadeToAction(DEFAULT_ANIMATION);
        }
      };

      finishedHandlerRef.current = onFinished;
      mixer.addEventListener("finished", onFinished);
    };

    playNext();
  };

  useEffect(() => {
    // Start in Idle by default
    if (actions[DEFAULT_ANIMATION]) {
      fadeToAction(DEFAULT_ANIMATION, 0.3);
    } else {
      const first = Object.values(actions)[0];
      if (first) first.reset().fadeIn(0.3).play();
    }
  }, [actions]);

  useEffect(() => {
    // 1) Listening/Processing: Standing pose (hold)
    if (voiceStatus === "listening" || voiceStatus === "processing") {
      cancelSequence();
      // Don't restart Standing when status changes listening → processing
      if (actions[VOICE_STANDING] && currentActionNameRef.current !== VOICE_STANDING) {
        fadeToAction(VOICE_STANDING);
      }
      return;
    }

    // 2) Finished: success → Yes then ThumbsUp
    // 3) Cancel (toggle off) → Wave
    if (voiceStatus === "idle" && voicePayload) {
      if (voicePayload.cancelled) {
        clearVoicePayload();
        playEmoteSequence([EMOTE_WAVE]);
      } else if (voicePayload.success === true) {
        clearVoicePayload();
        playEmoteSequence([EMOTE_YES, EMOTE_THUMBS_UP]);
      } else {
        // Ignore failures/unknown payloads (prevents unexpected emotes)
        clearVoicePayload();
      }
    }
  }, [voiceStatus, voicePayload, actions]);

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
      <ambientLight intensity={0.4} />
      <hemisphereLight
        args={["#ffffff", "#8d8d8d", 1.2]}
        position={[0, 10, 0]}
      />
      <directionalLight
        position={[0, 8, 10]}
        intensity={2}
        castShadow={false}
      />

      <group ref={groupRef}>
        <primitive
          object={clonedScene}
          position={[0, -3.7, 0]}
          scale={[1.2, 1.2, 1.2]}
        />
      </group>
    </>
  );
}

export function RobotAssistant() {
  return (
    <div className="fixed bottom-8 right-8 z-[1000]">
      <div
        className="relative w-full h-full rounded-full border-4 bg-gradient-to-br from-blue-400/10 to-blue-500/10 flex items-center justify-center overflow-hidden shadow-lg"
        style={{
          width: "180px",
          height: "180px",
          borderColor: "#93c5fd",
          boxShadow: "0 0 20px rgba(147, 197, 253, 0.2)",
        }}
      >
        <Canvas
            camera={{
              position: [0, 0.85, 6.5],
              fov: 38,
            }}
            gl={{ antialias: true, alpha: true }}
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
            }}
          >
            <Suspense fallback={null}>
              <RobotAssistantScene />
            </Suspense>
        </Canvas>
      </div>
    </div>
  );
}

useGLTF.preload(AVATAR_URL);
