import * as React from "react";
import { Text } from "@react-three/drei";
import { RoundedPlane, GradientBackground } from "../common/PanelElements";

interface VRPreciseCollisionPanelProps {
  show: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isChecking?: boolean;
  title?: string;
  message?: string;
}

export function VRPreciseCollisionPanel({
  show,
  onConfirm,
  onCancel,
  isChecking = false,
  title = "The furniture is close to another object.",
  message = "Run precise collision check to move closer? (This may take a moment)",
}: VRPreciseCollisionPanelProps) {
  const [hoveredButton, setHoveredButton] = React.useState<string | null>(null);

  if (!show) return null;

  const panelWidth = 0.9;
  const panelHeight = 0.6;

  return (
    <group>
      {/* Main background panel */}
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground
          width={panelWidth}
          height={panelHeight}
          radius={0.1}
          color1="#FEF3C7"
          color2="#FEF9E7"
          opacity={0.95}
        />
      </mesh>

      {/* Shadow */}
      <mesh position={[0, -0.01, -0.03]}>
        <RoundedPlane width={panelWidth} height={panelHeight} radius={0.1} />
        <meshStandardMaterial
          color="#000000"
          opacity={0.2}
          transparent
          roughness={1.0}
        />
      </mesh>

      {/* Warning Icon */}
      <group position={[0, 0.18, 0.01]}>
        <Text
          position={[0, -0.01, 0.01]}
          fontSize={0.05}
          color="#1F2937"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          ⚠
        </Text>
      </group>

      {/* Title */}
      <Text
        position={[0, 0.08, 0.01]}
        fontSize={0.045}
        color="#92400E"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {title}
      </Text>

      {/* Message */}
      <Text
        position={[0, -0.02, 0.01]}
        fontSize={0.035}
        color="#1F2937"
        anchorX="center"
        anchorY="middle"
        maxWidth={panelWidth - 0.2}
        textAlign="center"
        lineHeight={1.3}
      >
        {message}
      </Text>

      {/* Yes Button */}
      <group
        position={[-0.22, -0.2, 0.01]}
        onPointerEnter={(e) => {
          e.stopPropagation();
          if (!isChecking) setHoveredButton("yes");
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredButton(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!isChecking) onConfirm();
        }}
      >
        <mesh>
          <RoundedPlane width={0.35} height={0.1} radius={0.03} />
          <meshStandardMaterial
            color={isChecking ? "#9CA3AF" : hoveredButton === "yes" ? "#10B981" : "#059669"}
            emissive={isChecking ? "#6B7280" : "#059669"}
            emissiveIntensity={hoveredButton === "yes" && !isChecking ? 0.5 : 0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.04}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fontWeight="semi-bold"
        >
          {isChecking ? "Checking..." : "Yes"}
        </Text>
      </group>

      {/* Yes Button Shadow */}
      <group position={[-0.22, -0.21, 0]}>
        <mesh>
          <RoundedPlane width={0.35} height={0.1} radius={0.03} />
          <meshStandardMaterial
            color="#000000"
            opacity={0.15}
            transparent
            roughness={1.0}
          />
        </mesh>
      </group>

      {/* No Button */}
      <group
        position={[0.22, -0.2, 0.01]}
        onPointerEnter={(e) => {
          e.stopPropagation();
          if (!isChecking) setHoveredButton("no");
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredButton(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!isChecking) onCancel();
        }}
      >
        <mesh>
          <RoundedPlane width={0.35} height={0.1} radius={0.03} />
          <meshStandardMaterial
            color={isChecking ? "#9CA3AF" : hoveredButton === "no" ? "#F87171" : "#EF4444"}
            emissive={isChecking ? "#6B7280" : "#EF4444"}
            emissiveIntensity={hoveredButton === "no" && !isChecking ? 0.5 : 0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.04}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fontWeight="semi-bold"
        >
          No
        </Text>
      </group>

      {/* No Button Shadow */}
      <group position={[0.22, -0.21, 0]}>
        <mesh>
          <RoundedPlane width={0.35} height={0.1} radius={0.03} />
          <meshStandardMaterial
            color="#000000"
            opacity={0.15}
            transparent
            roughness={1.0}
          />
        </mesh>
      </group>
    </group>
  );
}