import * as React from "react";
import { Text } from "@react-three/drei";
import { RoundedPlane, GradientBackground } from "./common/PanelElements";

export type WallpaperCutoutStep = "prompt" | "drawing";

export interface LassoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WallpaperCutoutPanelProps {
  show: boolean;
  step: WallpaperCutoutStep;
  wallpaperName: string;
  lassoRegions: LassoRect[];
  panelOpacity: number;
  onYes: () => void;
  onNo: () => void;
  onUndo: () => void;
  onConfirm: () => void;
}

export function WallpaperCutoutPanel({
  show,
  step,
  wallpaperName,
  lassoRegions,
  panelOpacity,
  onYes,
  onNo,
  onUndo,
  onConfirm,
}: WallpaperCutoutPanelProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  if (!show) return null;

  const panelWidth = 0.75;
  const panelHeight = step === "prompt" ? 0.5 : 0.45;
  const buttonHeight = 0.08;

  if (step === "prompt") {
    return (
      <group>
        <mesh position={[0, 0, -0.02]}>
          <GradientBackground
            width={panelWidth}
            height={panelHeight}
            radius={0.06}
            color1="#DBEAFE"
            color2="#BFDBFE"
            opacity={panelOpacity}
          />
        </mesh>
        <Text
          position={[0, panelHeight / 2 - 0.1, 0.01]}
          fontSize={0.04}
          color="#1E40AF"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          Cut out doors or windows?
        </Text>
        <Text
          position={[0, panelHeight / 2 - 0.15, 0.01]}
          fontSize={0.028}
          color="#1E293B"
          anchorX="center"
          anchorY="middle"
          maxWidth={panelWidth - 0.2}
          textAlign="center"
        >
          {wallpaperName}
        </Text>
        <group
          position={[0, 0, 0.01]}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredId("yes");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredId(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onYes();
          }}
        >
          <mesh>
            <RoundedPlane width={panelWidth - 0.25} height={buttonHeight} radius={0.02} />
            <meshStandardMaterial
              color={hoveredId === "yes" ? "#93C5FD" : "#60A5FA"}
              emissive="#2563EB"
              emissiveIntensity={hoveredId === "yes" ? 0.35 : 0.2}
            />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.03} color="#1E3A8A" anchorX="center" anchorY="middle">
            Yes, cut out areas
          </Text>
        </group>
        <group
          position={[0, -0.11, 0.01]}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredId("no");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredId(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onNo();
          }}
        >
          <mesh>
            <RoundedPlane width={panelWidth - 0.25} height={buttonHeight} radius={0.02} />
            <meshStandardMaterial
              color={hoveredId === "no" ? "#E2E8F0" : "#94A3B8"}
              emissive="#64748B"
              emissiveIntensity={hoveredId === "no" ? 0.3 : 0.15}
            />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.03} color="#1E293B" anchorX="center" anchorY="middle">
            No, skip
          </Text>
        </group>
      </group>
    );
  }

  // step === "drawing"
  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground
          width={panelWidth}
          height={panelHeight}
          radius={0.06}
          color1="#D1FAE5"
          color2="#A7F3D0"
          opacity={panelOpacity}
        />
      </mesh>
      <Text
        position={[0, panelHeight / 2 - 0.08, 0.01]}
        fontSize={0.032}
        color="#065F46"
        anchorX="center"
        anchorY="middle"
        maxWidth={panelWidth - 0.15}
        textAlign="center"
      >
        Draw rectangles on the wallpaper to cut doors/windows
      </Text>
      <Text
        position={[0, panelHeight / 2 - 0.14, 0.01]}
        fontSize={0.026}
        color="#047857"
        anchorX="center"
        anchorY="middle"
      >
        {lassoRegions.length} area{lassoRegions.length !== 1 ? "s" : ""} marked
      </Text>
      <group position={[0, 0, 0.01]}>
        <group
          position={[-0.12, -0.08, 0]}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredId("undo");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredId(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onUndo();
          }}
        >
          <mesh>
            <RoundedPlane width={0.2} height={buttonHeight} radius={0.02} />
            <meshStandardMaterial
              color={hoveredId === "undo" ? "#FDE68A" : "#FCD34D"}
              emissive="#F59E0B"
              emissiveIntensity={hoveredId === "undo" ? 0.35 : 0.2}
            />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.025} color="#92400E" anchorX="center" anchorY="middle">
            Undo
          </Text>
        </group>
        <group
          position={[0.12, -0.08, 0]}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredId("confirm");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredId(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onConfirm();
          }}
        >
          <mesh>
            <RoundedPlane width={0.2} height={buttonHeight} radius={0.02} />
            <meshStandardMaterial
              color={hoveredId === "confirm" ? "#86EFAC" : "#4ADE80"}
              emissive="#22C55E"
              emissiveIntensity={hoveredId === "confirm" ? 0.35 : 0.2}
            />
          </mesh>
          <Text position={[0, 0, 0.01]} fontSize={0.025} color="#14532D" anchorX="center" anchorY="middle">
            Confirm
          </Text>
        </group>
      </group>
    </group>
  );
}
