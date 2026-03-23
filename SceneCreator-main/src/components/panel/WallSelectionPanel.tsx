import * as React from "react";
import { Text } from "@react-three/drei";
import { RoundedPlane, GradientBackground } from "./common/PanelElements";
import type { WallInfo } from "../../core/managers/SceneManager";

interface WallSelectionPanelProps {
  show: boolean;
  walls: WallInfo[];
  wallpaperName: string;
  onSelectWall: (wall: WallInfo) => void;
  onCancel: () => void;
}

export function WallSelectionPanel({
  show,
  walls,
  wallpaperName,
  onSelectWall,
  onCancel,
}: WallSelectionPanelProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);

  if (!show) return null;

  const panelWidth = 0.8;
  const panelHeight = 0.85;
  const buttonHeight = 0.1;
  const spacing = 0.04;

  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground
          width={panelWidth}
          height={panelHeight}
          radius={0.06}
          color1="#FEF3C7"
          color2="#FDE68A"
          opacity={0.95}
        />
      </mesh>

      <Text
        position={[0, panelHeight / 2 - 0.08, 0.01]}
        fontSize={0.04}
        color="#92400E"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        Select a wall for wallpaper
      </Text>
      <Text
        position={[0, panelHeight / 2 - 0.15, 0.01]}
        fontSize={0.03}
        color="#B45309"
        anchorX="center"
        anchorY="middle"
        maxWidth={panelWidth - 0.2}
        textAlign="center"
      >
        {wallpaperName}
      </Text>

      {walls.map((wall, index) => {
        const y = panelHeight / 2 - 0.28 - index * (buttonHeight + spacing);
        const isHovered = hoveredId === wall.id;

        return (
          <group
            key={wall.id}
            position={[0, y, 0.01]}
            onPointerEnter={(e) => {
              e.stopPropagation();
              setHoveredId(wall.id);
            }}
            onPointerLeave={(e) => {
              e.stopPropagation();
              setHoveredId(null);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelectWall(wall);
            }}
          >
            <mesh>
              <RoundedPlane
                width={panelWidth - 0.2}
                height={buttonHeight}
                radius={0.02}
              />
              <meshStandardMaterial
                color={isHovered ? "#FCD34D" : "#FDE68A"}
                emissive="#F59E0B"
                emissiveIntensity={isHovered ? 0.3 : 0.15}
              />
            </mesh>
            <Text
              position={[0, 0, 0.01]}
              fontSize={0.028}
              color="#92400E"
              anchorX="center"
              anchorY="middle"
            >
              {wall.label} ({wall.width.toFixed(1)}m × {wall.height.toFixed(1)}m)
            </Text>
          </group>
        );
      })}

      <group
        position={[0.33, panelHeight / 2 - 0.08, 0.01]}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHoveredId("cancel");
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredId(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onCancel();
        }}
      >
        <mesh>
          <RoundedPlane width={0.08} height={0.08} radius={0.02} />
          <meshStandardMaterial
            color={hoveredId === "cancel" ? "#64748B" : "#475569"}
            emissive="#64748B"
            emissiveIntensity={hoveredId === "cancel" ? 0.3 : 0.1}
          />
        </mesh>
        <Text
          position={[-0.002, -0.005, 0.01]}
          fontSize={0.04}
          color="#E2E8F0"
          anchorX="center"
          anchorY="middle"
        >
          ✕
        </Text>
      </group>
    </group>
  );
}
