import * as React from "react";
import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";

const _globs = import.meta.glob(
  "/src/assets/avatars/resident*.glb",
  { eager: true, query: "?url", import: "default" }
) as Record<string, string>;

export const AVATAR_URL_MAP: Partial<Record<number, string>> = {};
for (const [path, url] of Object.entries(_globs)) {
  const m = path.match(/resident(\d+)\.glb$/);
  if (m) AVATAR_URL_MAP[Number(m[1])] = url;
}

export const DEFAULT_AVATAR_URL = AVATAR_URL_MAP[4] ?? "";

const WALK_SPEED = 2.0;
const FADE_DURATION = 0.2;
const CAMERA_HEIGHT = 2.5;
const CAMERA_DISTANCE = 5.0;

const RPM_FORWARD_OFFSET = Math.PI;

interface AvatarControllerInnerProps {
  avatarUrl: string;
}

function AvatarControllerInner({ avatarUrl }: AvatarControllerInnerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, scene: threeScene } = useThree();
  const { scene, animations } = useGLTF(avatarUrl);
  const { actions } = useAnimations(animations, groupRef);

  const keysRef = useRef<Record<string, boolean>>({});

  const pendingJumpRef = useRef(false);
  const pendingWaveRef = useRef(false);
  const pendingSitRef = useRef(false);
  const pendingSleepRef = useRef(false);

  const currentActionRef = useRef("");
  const isJumpingRef = useRef(false);
  const isWavingRef = useRef(false);
  const isSittingRef = useRef(false);
  const isSleepingRef = useRef(false);
  const prevActionRef = useRef("Idle");

  const cameraInitRef = useRef(false);
  const rigRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    if (!groupRef.current) return;
    const camWorldPos = new THREE.Vector3();
    camera.getWorldPosition(camWorldPos);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() > 0.001) forward.normalize();
    groupRef.current.position.set(
      camWorldPos.x + forward.x * CAMERA_DISTANCE,
      0,
      camWorldPos.z + forward.z * CAMERA_DISTANCE
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      const key = e.key.toLowerCase();
      keysRef.current[key] = true;

      if (key === " ") {
        e.preventDefault();
        pendingJumpRef.current = true;
      }
      if (key === "u") {
        e.preventDefault();
        pendingWaveRef.current = true;
      }
      if (key === "m") {
        e.preventDefault();
        pendingSitRef.current = true;
      }
      if (key === "n") {
        e.preventDefault();
        pendingSleepRef.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  function findKey(keyword: string): string | null {
    const names = Object.keys(actions);
    const kw = keyword.toLowerCase();
    return (
      names.find((n) => n.toLowerCase() === kw) ??
      names.find((n) => n.toLowerCase().endsWith(kw)) ??
      names.find((n) => n.toLowerCase().includes(kw)) ??
      null
    );
  }

  function findAction(keyword: string): THREE.AnimationAction | null {
    const key = findKey(keyword);
    return key ? (actions[key] ?? null) : null;
  }

  function switchAction(keyword: string) {
    const key = findKey(keyword);
    if (!key || !actions[key]) return;
    if (currentActionRef.current === key) return; // already playing
    const prev = actions[currentActionRef.current];
    if (prev) prev.fadeOut(FADE_DURATION);
    actions[key]!.reset().fadeIn(FADE_DURATION).play();
    currentActionRef.current = key;
  }

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const pos = groupRef.current.position;

    if (!rigRef.current) {
      const found = threeScene.getObjectByName("CustomXRRig");
      if (found instanceof THREE.Group) rigRef.current = found;
    }
    const isXR = rigRef.current != null && camera.parent === rigRef.current;
    const followTarget: THREE.Object3D = isXR ? rigRef.current! : camera;

    const rotY = groupRef.current.rotation.y;
    if (!cameraInitRef.current && Object.keys(actions).length > 0) {
      cameraInitRef.current = true;
      console.log("[AvatarController] clips:", Object.keys(actions));
      followTarget.position.set(
        pos.x - Math.sin(rotY) * CAMERA_DISTANCE,
        isXR ? pos.y : pos.y + CAMERA_HEIGHT,
        pos.z - Math.cos(rotY) * CAMERA_DISTANCE
      );
      if (!isXR) camera.lookAt(pos.x, pos.y + 1, pos.z);
      const idleKey = findKey("idle");
      if (idleKey && actions[idleKey]) {
        actions[idleKey]!.play();
        currentActionRef.current = idleKey;
      }
    }

    if (!isXR) camera.lookAt(pos.x, pos.y + 1, pos.z);

    if (pendingJumpRef.current) {
      pendingJumpRef.current = false;
      const jumpAction = findAction("jump");
      if (
        jumpAction &&
        !isJumpingRef.current &&
        !isSittingRef.current &&
        !isSleepingRef.current
      ) {
        prevActionRef.current = currentActionRef.current;
        isJumpingRef.current = true;
        const prev = findAction(currentActionRef.current);
        if (prev) prev.fadeOut(FADE_DURATION);
        jumpAction.setLoop(THREE.LoopOnce, 1);
        jumpAction.clampWhenFinished = true;
        jumpAction.reset().fadeIn(FADE_DURATION).play();
        currentActionRef.current = findKey("jump") ?? "Jump";
        const onFinished = () => {
          jumpAction.getMixer().removeEventListener("finished", onFinished);
          isJumpingRef.current = false;
          jumpAction.fadeOut(FADE_DURATION);
          const restore = findAction(prevActionRef.current);
          if (restore) {
            restore.reset().fadeIn(FADE_DURATION).play();
            currentActionRef.current = prevActionRef.current;
          }
        };
        jumpAction.getMixer().addEventListener("finished", onFinished);
      }
    }

    if (pendingWaveRef.current) {
      pendingWaveRef.current = false;
      const waveAction = findAction("wave");
      if (
        waveAction &&
        !isWavingRef.current &&
        !isSittingRef.current &&
        !isSleepingRef.current
      ) {
        prevActionRef.current = currentActionRef.current;
        isWavingRef.current = true;
        const prev = findAction(currentActionRef.current);
        if (prev) prev.fadeOut(FADE_DURATION);
        waveAction.setLoop(THREE.LoopOnce, 1);
        waveAction.clampWhenFinished = true;
        waveAction.reset().fadeIn(FADE_DURATION).play();
        currentActionRef.current = findKey("wave") ?? "Wave";
        const onFinished = () => {
          waveAction.getMixer().removeEventListener("finished", onFinished);
          isWavingRef.current = false;
          waveAction.fadeOut(FADE_DURATION);
          const restore = findAction(prevActionRef.current);
          if (restore) {
            restore.reset().fadeIn(FADE_DURATION).play();
            currentActionRef.current = prevActionRef.current;
          }
        };
        waveAction.getMixer().addEventListener("finished", onFinished);
      }
    }

    if (pendingSitRef.current) {
      pendingSitRef.current = false;
      const sitAction = findAction("sit");
      if (sitAction && !isJumpingRef.current && !isWavingRef.current) {
        if (isSittingRef.current) {
          // Stand up
          sitAction.fadeOut(FADE_DURATION);
          const restore = findAction(prevActionRef.current);
          if (restore) {
            restore.reset().fadeIn(FADE_DURATION).play();
            currentActionRef.current = prevActionRef.current;
          }
          isSittingRef.current = false;
        } else {
          // Sit down
          prevActionRef.current = currentActionRef.current;
          if (isSleepingRef.current) {
            findAction("sleep")?.fadeOut(FADE_DURATION);
            isSleepingRef.current = false;
          }
          const prev = findAction(currentActionRef.current);
          if (prev) prev.fadeOut(FADE_DURATION);
          sitAction.reset().fadeIn(FADE_DURATION).play();
          currentActionRef.current = findKey("sit") ?? "Sit";
          isSittingRef.current = true;
        }
      }
    }

    if (pendingSleepRef.current) {
      pendingSleepRef.current = false;
      const sleepAction = findAction("sleep");
      if (sleepAction && !isJumpingRef.current && !isWavingRef.current) {
        if (isSleepingRef.current) {
          // Wake up
          sleepAction.fadeOut(FADE_DURATION);
          const restore = findAction(prevActionRef.current);
          if (restore) {
            restore.reset().fadeIn(FADE_DURATION).play();
            currentActionRef.current = prevActionRef.current;
          }
          isSleepingRef.current = false;
        } else {
          // Sleep
          prevActionRef.current = currentActionRef.current;
          if (isSittingRef.current) {
            findAction("sit")?.fadeOut(FADE_DURATION);
            isSittingRef.current = false;
          }
          const prev = findAction(currentActionRef.current);
          if (prev) prev.fadeOut(FADE_DURATION);
          sleepAction.reset().fadeIn(FADE_DURATION).play();
          currentActionRef.current = findKey("sleep") ?? "Sleep";
          isSleepingRef.current = true;
        }
      }
    }

    if (
      !isJumpingRef.current &&
      !isWavingRef.current &&
      !isSittingRef.current &&
      !isSleepingRef.current
    ) {
      const keys = keysRef.current;
      const isMoving = !!(keys["i"] || keys["k"] || keys["j"] || keys["l"]);
      if (isMoving) {
        const walkKey = findKey("walk");
        if (walkKey) switchAction(walkKey);
      } else {
        const idleKey = findKey("idle");
        if (idleKey) switchAction(idleKey);
      }
    }

    const keys = keysRef.current;
    const I = keys["i"],
      K = keys["k"],
      J = keys["j"],
      L = keys["l"];
    const isMoving = !!(I || K || J || L);

    if (
      isMoving &&
      !isWavingRef.current &&
      !isSittingRef.current &&
      !isSleepingRef.current
    ) {
      let dirOffset = 0;
      if (I) {
        if (J) dirOffset = Math.PI / 4;
        else if (L) dirOffset = -Math.PI / 4;
      } else if (K) {
        if (J) dirOffset = (3 * Math.PI) / 4;
        else if (L) dirOffset = (-3 * Math.PI) / 4;
        else dirOffset = Math.PI;
      } else if (J) dirOffset = Math.PI / 2;
      else if (L) dirOffset = -Math.PI / 2;

      const camWorldPos = new THREE.Vector3();
      camera.getWorldPosition(camWorldPos);
      const angleYCameraDirection = Math.atan2(
        camWorldPos.x - pos.x,
        camWorldPos.z - pos.z
      );

      const targetRotY =
        angleYCameraDirection + dirOffset + RPM_FORWARD_OFFSET;
      const currentRotY = groupRef.current.rotation.y;
      let diff = targetRotY - currentRotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      groupRef.current.rotation.y += diff * Math.min(8 * delta, 1);

      const walkDir = new THREE.Vector3();
      camera.getWorldDirection(walkDir);
      walkDir.y = 0;
      walkDir.normalize();
      walkDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), dirOffset);

      const moveX = walkDir.x * WALK_SPEED * delta;
      const moveZ = walkDir.z * WALK_SPEED * delta;

      groupRef.current.position.x += moveX;
      groupRef.current.position.z += moveZ;
      followTarget.position.x += moveX;
      followTarget.position.z += moveZ;

    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} dispose={null} />
    </group>
  );
}
interface ErrorBoundaryState {
  hasError: boolean;
}

class AvatarErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: () => void },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export interface AvatarControllerProps {
  avatarUrl?: string;
  initialPosition?: [number, number, number];
  onLoadError?: () => void;
}

export function AvatarController({
  avatarUrl = DEFAULT_AVATAR_URL,
  initialPosition = [0, 0, 0],
  onLoadError,
}: AvatarControllerProps) {
  return (
    <AvatarErrorBoundary onError={onLoadError ?? (() => {})}>
      <React.Suspense fallback={null}>
        <AvatarControllerInner avatarUrl={avatarUrl} />
      </React.Suspense>
    </AvatarErrorBoundary>
  );
}
