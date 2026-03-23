import { Text } from "@react-three/drei";
import { GradientBackground, RoundedPlane } from "../common/PanelElements";
import { useState, useEffect } from "react";
import { useCursor } from "@react-three/drei";
import * as THREE from "three";

export interface EnvironmentOption {
  id: string;
  name: string;
  type: "floor" | "wall";
  imagePath?: string;
  color: string;
  threeTexture?: THREE.Texture;
}

interface EnvironmentSelectorPanelProps {
  show: boolean;
  onSelectFloor?: (id: string, path: string) => void;
  onSelectWall?: (id: string, path: string) => void;
  onClose: () => void;
  floorTextures?: EnvironmentOption[];
  wallTextures?: EnvironmentOption[];
  selectedFloorId?: string;
  selectedWallId?: string;
  title?: string;
  loadingFloor?: boolean;
  loadingWall?: boolean;
}

function EnvironmentButton({
  texture,
  isSelected,
  isHovered,
  onClick,
  onHover,
  size = 0.12,
}: {
  texture: EnvironmentOption;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onHover: (hovered: boolean) => void;
  size?: number;
}) {
  useCursor(isHovered, "pointer");
  const [_textureLoaded, setTextureLoaded] = useState(false);

  useEffect(() => {
    if (texture.threeTexture) {
      setTextureLoaded(true);
    } else if (texture.imagePath) {
    
      const loader = new THREE.TextureLoader();
      loader.load(
        texture.imagePath,
        () => setTextureLoaded(true),
        undefined,
        (err) => {
          console.error("[ENV-BUTTON] Failed to load texture:", err);
          setTextureLoaded(false);
        }
      );
    }
  }, [texture.threeTexture, texture.imagePath]);

  return (
    <group
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      onPointerDown={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
    
      <mesh position={[0, 0, 0]}>
        <RoundedPlane width={size} height={size} radius={0.01} />
        <meshStandardMaterial
          color={isSelected ? "#10B981" : isHovered ? "#E5E7EB" : "#F3F4F6"}
          emissive={isHovered ? "#D1D5DB" : "#000000"}
          emissiveIntensity={isHovered ? 0.2 : 0}
          metalness={0.1}
          roughness={0.6}
        />
      </mesh>

     
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[size * 0.85, size * 0.85]} />
        {texture.threeTexture ? (
        
          <meshStandardMaterial
            map={texture.threeTexture}
            metalness={0}
            roughness={0.8}
          />
        ) : texture.imagePath ? (
      
          <meshStandardMaterial
            metalness={0}
            roughness={0.8}
          >
            <primitive
              attach="map"
              object={new THREE.TextureLoader().load(texture.imagePath)}
            />
          </meshStandardMaterial>
        ) : (
       
          <meshStandardMaterial
            color={texture.color}
            metalness={0}
            roughness={0.5}
          />
        )}
      </mesh>

      {isSelected && (
        <mesh position={[0, 0, 0.002]}>
          <ringGeometry args={[size * 0.44, size * 0.48, 32]} />
          <meshBasicMaterial color="#10B981" />
        </mesh>
      )}

   
      {isSelected && (
        <Text
          position={[0, 0, 0.003]}
          fontSize={0.04}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          ✓
        </Text>
      )}

    
      {isHovered && (
        <group position={[0, -size / 2 - 0.05, 0.01]}>
          <mesh>
            <planeGeometry args={[0.18, 0.035]} />
            <meshBasicMaterial color="#1F2937" opacity={0.95} transparent />
          </mesh>
          <Text
            position={[0, 0, 0.001]}
            fontSize={0.018}
            color="#FFFFFF"
            anchorX="center"
            anchorY="middle"
          >
            {texture.name}
          </Text>
        </group>
      )}
    </group>
  );
}

export function EnvironmentSelectorPanel({
  show,
  onSelectFloor,
  onSelectWall,
  onClose,
  floorTextures = [],
  wallTextures = [],
  selectedFloorId,
  selectedWallId,
  title = "Environment",
  loadingFloor = false,
  loadingWall = false,
}: EnvironmentSelectorPanelProps) {
  const [hoveredFloor, setHoveredFloor] = useState<string | null>(null);
  const [hoveredWall, setHoveredWall] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"floor" | "wall">("floor");

  if (!show) return null;

  const PANEL_WIDTH = 0.9;
  const PANEL_HEIGHT = 0.6;
  const BUTTON_SIZE = 0.1;
  const GAP = 0.02;
  const BUTTONS_PER_ROW = 4;

  const displayTextures = activeTab === "floor" ? floorTextures : wallTextures;
  const selectedId = activeTab === "floor" ? selectedFloorId : selectedWallId;
  const isLoading = activeTab === "floor" ? loadingFloor : loadingWall;

  const handleSelectTexture = (id: string, path: string | undefined) => {
    if (activeTab === "floor") {
      onSelectFloor?.(id, path || "");
    } else {
      onSelectWall?.(id, path || "");
    }
  };

  return (
    <group>
  
      <mesh position={[0, 0, 0]}>
        <RoundedPlane width={PANEL_WIDTH} height={PANEL_HEIGHT} radius={0.1} />
        <GradientBackground
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          radius={0.1}
          color1="#EAF4FA" 
          color2="#F5F7FA"
          opacity={0.05}
        />
      </mesh>

  
      <mesh position={[0, -0.01, -0.03]}>
        <RoundedPlane width={PANEL_WIDTH} height={PANEL_HEIGHT} radius={0.1} />
        <meshStandardMaterial
          color="#000000"
          opacity={0.2}
          transparent
          roughness={1.0}
        />
      </mesh>

      <Text
        position={[0, PANEL_HEIGHT / 2 - 0.03, 0.01]}
        fontSize={0.045}
        color="#1F2937"
        anchorX="center"
        anchorY="top"
        fontWeight="semi-bold"
      >
        {title}
      </Text>

  
      <group
        position={[PANEL_WIDTH / 2 - 0.04, PANEL_HEIGHT / 2 - 0.04, 0.01]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <mesh>
          <RoundedPlane width={0.03} height={0.03} radius={0.005} />
          <meshStandardMaterial
            color="#EF4444"
            emissive="#000000"
            opacity={0.8}
            transparent
          />
        </mesh>
        <Text
          position={[0, 0, 0.005]}
          fontSize={0.02}
          color="#FFFFFF"
          anchorX="center"
          anchorY="middle"
        >
          ×
        </Text>
      </group>

    
      <group position={[0, PANEL_HEIGHT / 2 - 0.12, 0]}>
      
        <group
          onPointerDown={(e) => {
            e.stopPropagation();
            setActiveTab("floor");
          }}
        >
          <mesh position={[-0.1, 0, 0]}>
            <RoundedPlane width={0.15} height={0.04} radius={0.005} />
            <meshStandardMaterial
              color={activeTab === "floor" ? "#10B981" : "#E5E7EB"}
              emissive={activeTab === "floor" ? "#10B981" : "#000000"}
              emissiveIntensity={activeTab === "floor" ? 0.3 : 0}
            />
          </mesh>
          <Text
            position={[-0.1, 0, 0.005]}
            fontSize={0.025}
            color={activeTab === "floor" ? "#FFFFFF" : "#6B7280"}
            anchorX="center"
            anchorY="middle"
            fontWeight={activeTab === "floor" ? "bold" : "normal"}
          >
            🟫 Floor
          </Text>
        </group>

     
        <group
          onPointerDown={(e) => {
            e.stopPropagation();
            setActiveTab("wall");
          }}
        >
          <mesh position={[0.1, 0, 0]}>
            <RoundedPlane width={0.15} height={0.04} radius={0.005} />
            <meshStandardMaterial
              color={activeTab === "wall" ? "#3B82F6" : "#E5E7EB"}
              emissive={activeTab === "wall" ? "#3B82F6" : "#000000"}
              emissiveIntensity={activeTab === "wall" ? 0.3 : 0}
            />
          </mesh>
          <Text
            position={[0.1, 0, 0.005]}
            fontSize={0.025}
            color={activeTab === "wall" ? "#FFFFFF" : "#6B7280"}
            anchorX="center"
            anchorY="middle"
            fontWeight={activeTab === "wall" ? "bold" : "normal"}
          >
            🧱 Wall
          </Text>
        </group>
      </group>

 
      <mesh position={[0, PANEL_HEIGHT / 2 - 0.18, 0.005]}>
        <planeGeometry args={[PANEL_WIDTH - 0.1, 0.002]} />
        <meshBasicMaterial color="#D1D5DB" opacity={0.3} transparent />
      </mesh>

   
      <group position={[0, PANEL_HEIGHT / 2 - 0.28, 0]}>
        {isLoading ? (
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.035}
            color="#9CA3AF"
            anchorX="center"
            anchorY="middle"
          >
            Loading...
          </Text>
        ) : displayTextures.length === 0 ? (
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.035}
            color="#9CA3AF"
            anchorX="center"
            anchorY="middle"
          >
            No {activeTab} textures available
          </Text>
        ) : (
          <>
            {displayTextures.map((texture, index) => {
              const col = index % BUTTONS_PER_ROW;
              const row = Math.floor(index / BUTTONS_PER_ROW);
              const xPos = (col - 1.5) * (BUTTON_SIZE + GAP);
              const yPos = -row * (BUTTON_SIZE + GAP);

              return (
                <group key={texture.id} position={[xPos, yPos, 0]}>
                  <EnvironmentButton
                    texture={texture}
                    isSelected={selectedId === texture.id}
                    isHovered={
                      activeTab === "floor"
                        ? hoveredFloor === texture.id
                        : hoveredWall === texture.id
                    }
                    onClick={() =>
                      handleSelectTexture(texture.id, texture.imagePath)
                    }
                    onHover={(hovered) => {
                      if (activeTab === "floor") {
                        setHoveredFloor(hovered ? texture.id : null);
                      } else {
                        setHoveredWall(hovered ? texture.id : null);
                      }
                    }}
                    size={BUTTON_SIZE}
                  />
                </group>
              );
            })}
          </>
        )}
      </group>


      <Text
        position={[0, -PANEL_HEIGHT / 2 + 0.05, 0.01]}
        fontSize={0.02}
        color="#6B7280"
        anchorX="center"
        anchorY="middle"
      >
        Click to select {activeTab} texture
      </Text>
    </group>
  );
}