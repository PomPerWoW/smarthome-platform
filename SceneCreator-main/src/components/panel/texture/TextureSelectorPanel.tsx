import * as React from "react";
import { Text } from "@react-three/drei";
import { RoundedPlane, GradientBackground } from "../common/PanelElements";
import * as THREE from "three";

export interface TextureOption {
  id: string;
  name: string;
  imagePath: string;
  color?: string;
  threeTexture?: THREE.Texture; 
}

export function TextureSelectorPanel({
  show,
  onSelectTexture,
  onClose,
  textures,
  selectedTextureId,
  title = "Select Texture",
}: {
  show: boolean;
  onSelectTexture: (textureId: string, texturePath: string) => void;
  onClose: () => void;
  textures: TextureOption[];
  selectedTextureId?: string;
  title?: string;
}) {
  const [hoveredTextureId, setHoveredTextureId] = React.useState<string | null>(null);


  if (!show) return null;

  const textureCount = textures.length;
  const texturesPerRow = Math.min(4, textureCount);
  const rows = Math.ceil(textureCount / texturesPerRow);

  const textureRadius = 0.12;
  const spacing = 0.35;
  const gridWidth = (texturesPerRow - 1) * spacing + textureRadius * 2;
  const gridHeight = rows * spacing + textureRadius * 2;

  const panelWidth = Math.max(1.2, gridWidth + 0.2);
  const panelHeight = gridHeight + 0.4;

  const startX = -(texturesPerRow - 1) * spacing / 2;
  const startY = (gridHeight / 2) - 0.15;

  return (
    <group>
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground width={panelWidth} height={panelHeight} radius={0.1} color1="#EAF4FA" color2="#F0F2F5" opacity={0.85} />
      </mesh>

      <mesh position={[0, 0, -0.03]}>
        <RoundedPlane width={panelWidth} height={panelHeight} radius={0.1} />
        <meshStandardMaterial color="#000000" opacity={0.2} transparent roughness={1.0} />
      </mesh>

      <Text
        position={[0, panelHeight / 2 - 0.12, 0.01]}
        fontSize={0.06}
        color="#334155"
        anchorX="center"
        anchorY="middle"
        fontWeight="bold"
      >
        {title}
      </Text>

      {textures.map((texture, index) => {
        const row = Math.floor(index / texturesPerRow);
        const col = index % texturesPerRow;
        const posX = startX + col * spacing;
        const posY = startY - row * spacing;
        const isHovered = hoveredTextureId === texture.id;
        const isSelected = selectedTextureId === texture.id;
        
      
        const hasTexture = !!texture.threeTexture;

        return (
          <group key={texture.id} position={[posX, posY, 0.01]}>
            <mesh
              onPointerEnter={(e) => {
                e.stopPropagation();
                setHoveredTextureId(texture.id);
              }}
              onPointerLeave={(e) => {
                e.stopPropagation();
                setHoveredTextureId(null);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectTexture(texture.id, texture.imagePath);
              }}
            >
              <circleGeometry args={[textureRadius, 32]} />
              <meshBasicMaterial
               
                map={hasTexture ? texture.threeTexture : undefined}
                color={hasTexture ? "#ffffff" : "#cccccc"}
              />
            </mesh>

            {isSelected && (
              <mesh position={[0, 0, 0.005]}>
                <circleGeometry args={[textureRadius + 0.02, 32]} />
                <meshBasicMaterial color="#3FA4CE" wireframe={true} />
              </mesh>
            )}

            {isHovered && !isSelected && (
              <mesh position={[0, 0, 0.004]}>
                <circleGeometry args={[textureRadius + 0.015, 32]} />
                <meshBasicMaterial color="#66B9E2" wireframe={true} />
              </mesh>
            )}

          </group>
        );
      })}

      <group position={[0, -panelHeight / 2 + 0.1, 0.01]}>
        <mesh
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredTextureId("close");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredTextureId(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <RoundedPlane width={0.3} height={0.08} radius={0.02} />
          <meshStandardMaterial
            color={hoveredTextureId === "close" ? "#A5D1E7" : "#66B9E2"}
            emissive={hoveredTextureId === "close" ? "#66B9E2" : "#66B9E2"}
            emissiveIntensity={hoveredTextureId === "close" ? 0.5 : 0.3}
          />
        </mesh>
        <Text
          position={[0, 0, 0.01]}
          fontSize={0.03}
          color="#334155"
          anchorX="center"
          anchorY="middle"
          fontWeight={550}
        >
          Close
        </Text>
      </group>
    </group>
  );
}