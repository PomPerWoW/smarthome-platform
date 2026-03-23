import { Suspense, useMemo, useState } from "react";
import { Text, useCursor, RenderTexture, PerspectiveCamera, useGLTF } from "@react-three/drei";
import { RoundedPlane } from "./common/PanelElements";
import { AVATAR_URL_MAP } from "../scene/AvatarController";

export const AVATAR_INDICES = [4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type AvatarIndex = (typeof AVATAR_INDICES)[number];

function AvatarPickerButton({
  index,
  isSelected,
  xPos,
  yPos,
  onSelect,
}: {
  index: number;
  isSelected: boolean;
  xPos: number;
  yPos: number;
  onSelect: (idx: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const available = !!AVATAR_URL_MAP[index];
  useCursor(hovered && available, "pointer");

  const bg = !available
    ? "#0A0F1A"
    : isSelected
    ? "#6366F1"
    : hovered
    ? "#334155"
    : "#0F172A";
  const textColor = !available
    ? "#1E293B"
    : isSelected
    ? "#FFFFFF"
    : hovered
    ? "#C4B5FD"
    : "#64748B";

  return (
    <group position={[xPos, yPos, 0]}>
      <group
        onPointerEnter={(e) => { e.stopPropagation(); if (available) setHovered(true); }}
        onPointerLeave={(e) => { e.stopPropagation(); setHovered(false); }}
        onPointerDown={(e) => { e.stopPropagation(); if (available) onSelect(index); }}
      >
        <mesh>
          <RoundedPlane width={0.044} height={0.036} radius={0.006} />
          <meshStandardMaterial color={bg} />
        </mesh>
        <Text
          position={[0, 0, 0.004]}
          fontSize={0.014}
          color={textColor}
          anchorX="center"
          anchorY="middle"
        >
          {String(index)}
        </Text>
      </group>
    </group>
  );
}

function AvatarPreviewScene({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  return (
    <>
      <ambientLight intensity={2.5} />
      <directionalLight position={[1, 3, 2]} intensity={2} />
      <primitive object={cloned} position={[0, 0, 0]} scale={0.5} />
    </>
  );
}

function AvatarPreview({
  url,
  width,
  height,
  x = 0,
  y = 0,
}: {
  url: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}) {
  return (
    <group position={[x, y, 0.003]}>
      {/* Indigo border frame */}
      <mesh position={[0, 0, -0.002]}>
        <RoundedPlane width={width + 0.012} height={height + 0.012} radius={0.01} />
        <meshBasicMaterial color="#6366F1" />
      </mesh>
      {/* Avatar portrait */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial>
          <RenderTexture attach="map" width={256} height={320}>
            <color attach="background" args={["#0B1120"]} />
            {/* Camera: slightly above centre, tilted down to see head-to-waist */}
            <PerspectiveCamera
              makeDefault
              fov={45}
              position={[0, 0.6, 1.5]}
              rotation={[-0.22, 0, 0]}
            />
            <Suspense fallback={null}>
              <AvatarPreviewScene url={url} />
            </Suspense>
          </RenderTexture>
        </meshBasicMaterial>
      </mesh>
    </group>
  );
}

interface AvatarControlPanelProps {
  show: boolean;
  hasLoadError?: boolean;
  selectedAvatarIndex?: number;
  onAvatarSelect?: (idx: number) => void;
}

export function AvatarControlPanel({
  show,
  hasLoadError = false,
  selectedAvatarIndex = 4,
  onAvatarSelect,
}: AvatarControlPanelProps) {
  if (!show) return null;

  const avatarUrl = AVATAR_URL_MAP[selectedAvatarIndex];

  const PANEL_W = 0.52;
  const PANEL_H = hasLoadError ? 0.26 : 0.58;
  const TOP_Y = PANEL_H / 2 - 0.03;

  const PREVIEW_W = 0.22;
  const PREVIEW_H = 0.20;
  const previewY = TOP_Y - 0.042 - PREVIEW_H / 2;
  const previewBottom = previewY - PREVIEW_H / 2;

  const pickerLabelY = previewBottom - 0.022;
  const pickerRowY = pickerLabelY - 0.024;

  const BTN_W = 0.044;
  const BTN_GAP = 0.01;
  const totalBtnRowW = AVATAR_INDICES.length * BTN_W + (AVATAR_INDICES.length - 1) * BTN_GAP;
  const btnStartX = -totalBtnRowW / 2 + BTN_W / 2;

  return (
    <group>
      {/* Panel background */}
      <mesh position={[0, 0, -0.005]}>
        <RoundedPlane width={PANEL_W} height={PANEL_H} radius={0.02} />
        <meshBasicMaterial color="#1E293B" opacity={0.93} transparent />
      </mesh>

      {/* Title */}
      <Text
        position={[0, TOP_Y - 0.018, 0]}
        fontSize={0.022}
        color="#FFFFFF"
        anchorX="center"
        anchorY="middle"
      >
        3rd Person Avatar Mode
      </Text>

      <mesh position={[0, TOP_Y - 0.034, 0.001]}>
        <planeGeometry args={[0.38, 0.002]} />
        <meshBasicMaterial color="#6366F1" />
      </mesh>

      {hasLoadError ? (
        <>
          <Text position={[0, 0.04, 0]} fontSize={0.017} color="#F87171" anchorX="center" anchorY="middle">
            Avatar model not found
          </Text>
          <Text position={[0, 0.008, 0]} fontSize={0.013} color="#94A3B8" anchorX="center" anchorY="middle">
            {`Add processed GLB files to:`}
          </Text>
          <Text position={[0, -0.018, 0]} fontSize={0.013} color="#60A5FA" anchorX="center" anchorY="middle">
            src/assets/avatars/resident4.glb …
          </Text>
          <Text position={[0, -0.055, 0]} fontSize={0.012} color="#475569" anchorX="center" anchorY="middle">
            Process each with Blender + Mixamo first
          </Text>
        </>
      ) : (
        <>
          {/* ── Avatar portrait preview ── */}
          {avatarUrl && (
            <AvatarPreview
              url={avatarUrl}
              width={PREVIEW_W}
              height={PREVIEW_H}
              y={previewY}
            />
          )}

          <Text
            position={[0, pickerLabelY, 0]}
            fontSize={0.013}
            color="#94A3B8"
            anchorX="center"
            anchorY="middle"
          >
            Select Avatar
          </Text>

          {AVATAR_INDICES.map((idx, i) => (
            <AvatarPickerButton
              key={idx}
              index={idx}
              isSelected={selectedAvatarIndex === idx}
              xPos={btnStartX + i * (BTN_W + BTN_GAP)}
              yPos={pickerRowY}
              onSelect={onAvatarSelect ?? (() => {})}
            />
          ))}

          <mesh position={[0, pickerRowY - 0.028, 0.001]}>
            <planeGeometry args={[0.44, 0.001]} />
            <meshBasicMaterial color="#334155" opacity={0.6} transparent />
          </mesh>

          {/* ── Controls ── */}
          <Text position={[-0.1, pickerRowY - 0.052, 0]} fontSize={0.016} color="#A78BFA" anchorX="center" anchorY="middle">
            I / K
          </Text>
          <Text position={[0.04, pickerRowY - 0.052, 0]} fontSize={0.014} color="#94A3B8" anchorX="left" anchorY="middle">
            Forward / Backward
          </Text>

          <Text position={[-0.1, pickerRowY - 0.076, 0]} fontSize={0.016} color="#A78BFA" anchorX="center" anchorY="middle">
            J / L
          </Text>
          <Text position={[0.04, pickerRowY - 0.076, 0]} fontSize={0.014} color="#94A3B8" anchorX="left" anchorY="middle">
            Left / Right
          </Text>

          <Text position={[-0.1, pickerRowY - 0.1, 0]} fontSize={0.016} color="#34D399" anchorX="center" anchorY="middle">
            Space
          </Text>
          <Text position={[0.04, pickerRowY - 0.1, 0]} fontSize={0.014} color="#94A3B8" anchorX="left" anchorY="middle">
            Jump
          </Text>

          <Text position={[-0.1, pickerRowY - 0.124, 0]} fontSize={0.016} color="#F59E0B" anchorX="center" anchorY="middle">
            U / M / N
          </Text>
          <Text position={[0.04, pickerRowY - 0.124, 0]} fontSize={0.014} color="#94A3B8" anchorX="left" anchorY="middle">
            Wave / Sit / Sleep
          </Text>

          <Text
            position={[0, -PANEL_H / 2 + 0.022, 0]}
            fontSize={0.012}
            color="#475569"
            anchorX="center"
            anchorY="middle"
          >
            Click Avatar in sidebar to exit
          </Text>
        </>
      )}
    </group>
  );
}
