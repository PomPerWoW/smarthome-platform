import * as React from "react";
import { Text } from "@react-three/drei";
import { RoundedPlane, GradientBackground } from "./common/PanelElements";

const STEP = 0.02;

interface WallPositionPanelProps {
  show: boolean;
  distanceFromWall: number;
  maxDistance: number;
  onMoveIn: () => void;
  onMoveOut: () => void;
  onClose: () => void;
}

export function WallPositionPanel({
  show,
  distanceFromWall,
  maxDistance,
  onMoveIn,
  onMoveOut,
  onClose,
}: WallPositionPanelProps) {
  const [hovered, setHovered] = React.useState<string | null>(null);

  if (!show) return null;

  const panelWidth = 0.6;
  const panelHeight = 0.35;

  return (
    <group>
      <mesh position={[0, 0.5, -0.02]}>
        <GradientBackground
          width={panelWidth}
          height={panelHeight}
          radius={0.06}
          color1="#E0F2FE"
          color2="#F0F9FF"
          opacity={0.95}
        />
      </mesh>

      <Text
        position={[0, 0.58, 0.01]}
        fontSize={0.04}
        color="#0C4A6E"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        Distance from wall
      </Text>

      <Text
        position={[0, 0.5, 0.01]}
        fontSize={0.035}
        color="#0369A1"
        anchorX="center"
        anchorY="middle"
      >
        {(distanceFromWall ?? 0).toFixed(2)} m / {maxDistance.toFixed(2)} m
      </Text>

      <group
        position={[-0.12, 0.4, 0.01]}
        onPointerEnter={(e) => { e.stopPropagation(); setHovered("in"); }}
        onPointerLeave={(e) => { e.stopPropagation(); setHovered(null); }}
        onPointerDown={(e) => { e.stopPropagation(); onMoveIn(); }}
      >
        <mesh>
          <RoundedPlane width={0.18} height={0.08} radius={0.02} />
          <meshStandardMaterial
            color={hovered === "in" ? "#0EA5E9" : "#0284C7"}
            emissive="#0284C7"
            emissiveIntensity={hovered === "in" ? 0.4 : 0.2}
          />
        </mesh>
        <Text position={[0.04, -0.133, 0.51]} fontSize={0.03} color="#FFFFFF" anchorX="center" anchorY="middle">
          In
        </Text>
      </group>

      <group
        position={[0.12, 0.4, 0.01]}
        onPointerEnter={(e) => { e.stopPropagation(); setHovered("out"); }}
        onPointerLeave={(e) => { e.stopPropagation(); setHovered(null); }}
        onPointerDown={(e) => { e.stopPropagation(); onMoveOut(); }}
      >
        <mesh>
          <RoundedPlane width={0.18} height={0.08} radius={0.02} />
          <meshStandardMaterial
            color={hovered === "out" ? "#0EA5E9" : "#0284C7"}
            emissive="#0284C7"
            emissiveIntensity={hovered === "out" ? 0.4 : 0.2}
          />
        </mesh>
        <Text position={[-0.04, -0.133, 0.51]} fontSize={0.03} color="#FFFFFF" anchorX="center" anchorY="middle">
          Out
        </Text>
      </group>

      <group
        position={[0.24, 0.6, 0.01]}
        onPointerEnter={(e) => { e.stopPropagation(); setHovered("close"); }}
        onPointerLeave={(e) => { e.stopPropagation(); setHovered(null); }}
        onPointerDown={(e) => { e.stopPropagation(); onClose(); }}
      >
        <mesh>
          <RoundedPlane width={0.06} height={0.06} radius={0.02} />
          <meshStandardMaterial
            color={hovered === "close" ? "#64748B" : "#475569"}
            emissive="#64748B"
            emissiveIntensity={hovered === "close" ? 0.3 : 0.1}
          />
        </mesh>
        <Text position={[0, -0.009, 0.01]} fontSize={0.025} color="#E2E8F0" anchorX="center" anchorY="middle">
          ✕
        </Text>
      </group>
    </group>
  );
}

export { STEP as WALL_PANEL_STEP };
