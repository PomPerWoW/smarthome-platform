import * as React from "react";
import { Text } from "@react-three/drei";
import { RoundedPlane } from "./common/PanelElements";
import type { WhiteboardTool } from "../../core/objects/WhiteboardWidget";

export function VRWhiteboardPanel({
  show,
  currentTool,
  onSelectTool,
  onExit,
  onClear,
}: {
  show: boolean;
  currentTool: WhiteboardTool;
  onSelectTool: (tool: WhiteboardTool) => void;
  onExit: () => void;
  onClear?: () => void;
}) {
  const [hoveredButton, setHoveredButton] = React.useState<string | null>(null);

  if (!show) return null;

  const button = (id: string, label: string, isActive: boolean, y: number) => (
    <group key={id} position={[0, y, 0.01]}>
      <mesh
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHoveredButton(id);
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredButton(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelectTool(id as WhiteboardTool);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectTool(id as WhiteboardTool);
        }}
      >
        <RoundedPlane width={0.2} height={0.08} radius={0.03} />
        <meshStandardMaterial
          color={isActive ? "#1e40af" : hoveredButton === id ? "#3b82f6" : "#64748b"}
          emissive={isActive || hoveredButton === id ? "#60a5fa" : "#94a3b8"}
          emissiveIntensity={isActive ? 0.5 : hoveredButton === id ? 0.4 : 0.2}
        />
      </mesh>
      <Text
        position={[0, 0, 0.01]}
        fontSize={0.035}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {label}
      </Text>
    </group>
  );

  return (
    <group>
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.9} />
      </mesh>
      <Text
        position={[0, 0.2, 0.01]}
        fontSize={0.04}
        color="#f1f5f9"
        anchorX="center"
        anchorY="middle"
      >
        Whiteboard
      </Text>
      {button("pen", "Pen", currentTool === "pen", 0.06)}
      {button("eraser", "Eraser", currentTool === "eraser", -0.06)}
      {onClear ? (
          <group position={[0, -0.18, 0.01]}>
            <mesh
              onPointerEnter={(e) => {
                e.stopPropagation();
                setHoveredButton("clear");
              }}
              onPointerLeave={(e) => {
                e.stopPropagation();
                setHoveredButton(null);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onClear();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              <RoundedPlane width={0.18} height={0.06} radius={0.02} />
              <meshStandardMaterial
                color={hoveredButton === "clear" ? "#475569" : "#334155"}
                emissive={hoveredButton === "clear" ? "#64748b" : "#475569"}
                emissiveIntensity={hoveredButton === "clear" ? 0.3 : 0.2}
              />
            </mesh>
            <Text
              position={[0, 0, 0.01]}
              fontSize={0.028}
              color="#cbd5e1"
              anchorX="center"
              anchorY="middle"
            >
              Clear
            </Text>
          </group>
      ) : null}
      <group position={[0.18, 0.2, 0.01]}>
        <mesh
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton("exit");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onExit();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onExit();
          }}
        >
          <RoundedPlane width={0.08} height={0.06} radius={0.02} />
          <meshStandardMaterial
            color={hoveredButton === "exit" ? "#dc2626" : "#64748b"}
            emissive={hoveredButton === "exit" ? "#ef4444" : "#94a3b8"}
            emissiveIntensity={hoveredButton === "exit" ? 0.5 : 0.2}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.025}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          Exit
        </Text>
      </group>
    </group>
  );
}
