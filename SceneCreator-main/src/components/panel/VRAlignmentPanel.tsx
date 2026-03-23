import { Text } from "@react-three/drei";
import { GradientBackground, RoundedPlane, ButtonBackground } from "./common/PanelElements";
import { useState } from "react";

interface VRAlignmentPanelProps {
  show: boolean;
  arFirstRequiresAlignment?: boolean;
  onSelectMode: (mode: "world" | "free") => void;
}

export function VRAlignmentPanel({
  show,
  arFirstRequiresAlignment = false,
  onSelectMode,
}: VRAlignmentPanelProps) {
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

  if (!show) return null;

  const panelWidth = 1.0;
  const panelHeight = arFirstRequiresAlignment ? 0.55 : 0.7;
  const buttonWidth = 0.8;
  const buttonHeight = 0.15;

  return (
    <group>
      {/* Main background panel */}
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground width={panelWidth} height={panelHeight} radius={0.1} color1="#EAF4FA" color2="#F0F2F5" opacity={0.85} />
      </mesh>

      {/* Background Shadow */}
      <mesh position={[0, 0, -0.03]}>
        <RoundedPlane width={panelWidth} height={panelHeight} radius={0.1} />
        <meshStandardMaterial
          color="#000000"
          opacity={0.15}
          transparent
          roughness={1.0}
        />
      </mesh>

      {/* Header */}
      <Text
        position={[0, panelHeight / 2 - 0.12, 0.01]}
        fontSize={0.06}
        color="#334155"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        Welcome to your Virtual Home
      </Text>

      {/* Description */}
      {arFirstRequiresAlignment ? (
        <>
          <Text
            position={[0, panelHeight / 2 - 0.21, 0.01]}
            fontSize={0.032}
            color="#475569"
            anchorX="center"
            anchorY="middle"
            maxWidth={panelWidth * 0.92}
            textAlign="center"
          >
            In passthrough AR, aligning the home to your real space is required
          </Text>
          <Text
            position={[0, panelHeight / 2 - 0.28, 0.01]}
            fontSize={0.028}
            color="#64748B"
            anchorX="center"
            anchorY="middle"
            maxWidth={panelWidth * 0.92}
            textAlign="center"
          >
            Start when you are ready. You will enter alignment setup process
          </Text>
        </>
      ) : (
        <Text
          position={[0, panelHeight / 2 - 0.19, 0.01]}
          fontSize={0.035}
          color="#64748B"
          anchorX="center"
          anchorY="middle"
        >
          Please choose your navigation mode:
        </Text>
      )}

      {/* Align World Button */}
      <group position={[0, arFirstRequiresAlignment ? -0.12 : 0.04, 0.01]}>
        <mesh
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton("world");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onSelectMode("world");
          }}
        >
          <RoundedPlane width={buttonWidth} height={buttonHeight} radius={0.04} />
          <meshStandardMaterial
            color={hoveredButton === "world" ? "#66B9E2" : "#3FA4CE"}
            emissive={hoveredButton === "world" ? "#66B9E2" : "#66B9E2"}
            emissiveIntensity={hoveredButton === "world" ? 0.5 : 0.3}
          />
        </mesh>
        <Text
          position={[0, 0.01, 0.01]}
          fontSize={0.045}
          color="#334155"
          anchorX="center"
          anchorY="middle"
          fontWeight={600}
        >
          {arFirstRequiresAlignment ? "Start alignment" : "Align Home Model to Real World"}
        </Text>
        <Text
          position={[0, -0.04, 0.01]}
          fontSize={0.028}
          color="#64748B"
          anchorX="center"
          anchorY="middle"
        >
          Enter alignment mode setup
        </Text>
      </group>

      <group position={[0, arFirstRequiresAlignment ? -0.13 : 0.03, 0]}>
        <mesh>
          <ButtonBackground width={buttonWidth} height={buttonHeight} radius={0.04} colorTop="#000000" colorBottom="#000000" opacity={0.15} />
        </mesh>
      </group>

      {!arFirstRequiresAlignment && (
        <>
          {/* Free Roam Button */}
          <group position={[0, -0.16, 0.01]}>
            <mesh
              onPointerEnter={(e) => {
                e.stopPropagation();
                setHoveredButton("free");
              }}
              onPointerLeave={(e) => {
                e.stopPropagation();
                setHoveredButton(null);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectMode("free");
              }}
            >
              <RoundedPlane width={buttonWidth} height={buttonHeight} radius={0.04} />
              <meshStandardMaterial
                color={hoveredButton === "free" ? "#A5D1E7" : "#66B9E2"}
                emissive={hoveredButton === "free" ? "#66B9E2" : "#66B9E2"}
                emissiveIntensity={hoveredButton === "free" ? 0.5 : 0.3}
              />
            </mesh>
            <Text
              position={[0, 0.01, 0.01]}
              fontSize={0.045}
              color="#334155"
              anchorX="center"
              anchorY="middle"
              fontWeight={600}
            >
              Free Roaming Mode
            </Text>
            <Text
              position={[0, -0.04, 0.01]}
              fontSize={0.028}
              color="#64748B"
              anchorX="center"
              anchorY="middle"
            >
              Navigate freely with controllers
            </Text>
          </group>

          <group position={[0, -0.17, 0]}>
            <mesh>
              <ButtonBackground width={buttonWidth} height={buttonHeight} radius={0.04} colorTop="#000000" colorBottom="#000000" opacity={0.15} />
            </mesh>
          </group>
        </>
      )}
    </group>
  );
}

