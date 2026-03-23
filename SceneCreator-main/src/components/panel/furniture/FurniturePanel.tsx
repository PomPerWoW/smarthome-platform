import * as React from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { FurnitureItem } from "../../../core/objects/FurnitureItem";
import { FurnitureImage } from "./FurnitureImage";
import { RoundedPlane, GradientBackground, CardBackground } from "../common/PanelElements";
import digitalClockIconUrl from "../../../assets/icons/digital-clock.png";

export type FurnitureCategory = "all" | "living-room" | "bedroom" | "office-room" | "kitchen" | "widgets" | "wallpaper";

const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  "all": "All Categories",
  "living-room": "Living Room",
  "bedroom": "Bedroom",
  "office-room": "Office Room",
  "kitchen": "Kitchen",
  "widgets": "Widgets",
  "wallpaper": "Wallpaper",
};

const BACKEND_CATEGORY_MAP: Record<string, FurnitureCategory> = {
  "Living Room": "living-room",
  "Bedroom": "bedroom",
  "Office Room": "office-room",
  "Kitchen": "kitchen",
  "Widgets": "widgets",
  "widget": "widgets",
  "Wallpaper": "wallpaper",
  "wallpaper": "wallpaper",
  "living-room": "living-room",
  "bedroom": "bedroom",
  "office-room": "office-room",
  "kitchen": "kitchen",
  "widgets": "widgets",
};

export interface SystemWidgetDef {
  id: string;
  name: string;
  widgetType: "clock" | "whiteboard" | "weather";
  category: "widgets";
  image?: string;
  type?: string;
}

export const SYSTEM_WIDGETS: SystemWidgetDef[] = [
  {
    id: "sys-widget-clock",
    name: "Clock",
    widgetType: "clock",
    category: "widgets",
    type: "Clock",
  },
  {
    id: "sys-widget-whiteboard",
    name: "Whiteboard",
    widgetType: "whiteboard",
    category: "widgets",
    type: "Whiteboard",
  },
  {
    id: "sys-widget-weather",
    name: "Weather",
    widgetType: "weather",
    category: "widgets",
    type: "Weather Widget",
  },
];

export function VRFurniturePanel({
  show,
  catalog,
  loading,
  onSelectItem,
  placedFurnitureIds = [],
  onClose,
  onRefresh
}: {
  show: boolean;
  catalog: FurnitureItem[];
  loading: boolean;
  onSelectItem: (f: FurnitureItem) => void;
  placedFurnitureIds?: string[];
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);
  const [hoveredButton, setHoveredButton] = React.useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = React.useState<FurnitureCategory>("all");
  const [currentPage, setCurrentPage] = React.useState(0);

  if (!show) return null;

  
  React.useEffect(() => {
    setCurrentPage(0);
  }, [selectedCategory]);


  const filteredCatalog = React.useMemo(() => {
    if (selectedCategory === "all") {
      return catalog;
    }
    return catalog.filter((item: any) => {
      let itemCategory: FurnitureCategory = "all";
      let rawCategory: string | undefined;

      if (typeof item.getMetadata === 'function') {
        rawCategory = item.getMetadata().category;
      } else if (item?.metadata?.category) {
        rawCategory = item.metadata.category;
      } else if (item?.category) {
        rawCategory = item.category;
      }

      if (rawCategory) {
        itemCategory = BACKEND_CATEGORY_MAP[rawCategory] || "all";
      }

      return itemCategory === selectedCategory;
    });
  }, [catalog, selectedCategory]);

  const itemsPerRow = 3;
  const itemsPerPage = 6; 

  const headerHeight = 0.25;
  const categoryBarHeight = 0.35;
  const itemHeight = 0.5;
  const paginationHeight = 0.15;
  const topPadding = 0;
  const bottomPadding = 0.01;


  const panelHeight = 1.6;
  const panelWidth = 1;


  const totalPages = Math.ceil(filteredCatalog.length / itemsPerPage);
  const startIndex = currentPage * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCatalog = filteredCatalog.slice(startIndex, endIndex);

  return (
    <group>
    
      <mesh position={[0, 0, -0.02]}>
        <GradientBackground width={panelWidth} height={panelHeight} radius={0.1} color1="#EAF4FA" color2="#F5F7FA" opacity={0.7} />
      </mesh>

 
      <mesh position={[0, -0.01, -0.03]}>
        <RoundedPlane width={panelWidth} height={panelHeight} radius={0.1} />
        <meshStandardMaterial
          color="#000000"
          opacity={0.15}
          transparent
          roughness={1.0}
        />
      </mesh>

      
      <Text
        position={[0, panelHeight / 2 - 0.12, 0.01]}
        fontSize={0.05}
        color="#334155"
        anchorX="center"
        anchorY="middle"
        fontWeight="semi-bold"
      >
        📦 My Inventory
      </Text>

      <group
        position={[0.4, panelHeight / 2 - 0.08, 0.01]}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHoveredButton("close");
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHoveredButton(null);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <mesh>
          <RoundedPlane width={0.08} height={0.08} radius={0.03} />
          <meshStandardMaterial
            color="#334155"
            emissive={hoveredButton === "close" ? "#ccc" : "#ccc"}
            emissiveIntensity={hoveredButton === "close" ? 0.6 : 0.4}
          />
        </mesh>
        <Text
          position={[-0.005, -0.01, 0.01]}
          fontSize={0.05}
          color="#fff"
          anchorX="center"
          anchorY="middle"
        >
          ✕
        </Text>
      </group>

    
      {onRefresh && (
        <group
          position={[-0.4, panelHeight / 2 - 0.08, 0.01]}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton("refresh");
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
        >
          <mesh>
            <RoundedPlane width={0.08} height={0.08} radius={0.03} />
            <meshStandardMaterial
              color="#66B9E2"
              emissive={hoveredButton === "refresh" ? "#ccc" : "#ccc"}
              emissiveIntensity={hoveredButton === "refresh" ? 0.6 : 0.4}
            />
          </mesh>
          <Text
            position={[-0.005, -0.01, 0.01]}
            fontSize={0.05}
            color="#fff"
            anchorX="center"
            anchorY="middle"
          >
            🔄
          </Text>
        </group>
      )}


      <CategoryButtons
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        hoveredButton={hoveredButton}
        setHoveredButton={setHoveredButton}
        yPosition={panelHeight / 2 - 0.25}
      />

 
      <group>
        {loading ? (
          <group position={[0, 0, 0.01]}>
            <Text
              position={[0, 0, 0]}
              fontSize={0.03}
              color="#334155"
              anchorX="center"
              anchorY="middle"
            >
              Loading furniture...
            </Text>
          </group>
        ) : filteredCatalog.length === 0 ? (
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.03}
            color="#334155"
            anchorX="center"
            anchorY="middle"
          >
            No furniture available in this category
          </Text>
        ) : (
          <group>
            {paginatedCatalog.map((f: any, itemIndex) => {
              const col = itemIndex % itemsPerRow;
              const row = Math.floor(itemIndex / itemsPerRow);

              const cardWidth = 0.25;
              const cardHeight = 0.4;
              const cardSpacing = 0.05;
              const totalWidth = itemsPerRow * cardWidth + (itemsPerRow - 1) * cardSpacing;
              const x = -totalWidth / 2 + col * (cardWidth + cardSpacing) + cardWidth / 2;
              const contentStartY = panelHeight / 1.6 - headerHeight - categoryBarHeight - topPadding - cardHeight / 2;
              const y = contentStartY - (row * itemHeight);

              const isHovered = hoveredItem === f.id;
              const isPlaced = placedFurnitureIds.includes(f.id);

              return (
                <group key={`${f.id}-${itemIndex}`} position={[x, y, 0.02]}>

            
                  <mesh
                    position={[0, 0, 0]}
                    onPointerEnter={(e) => {
                      e.stopPropagation();
                      setHoveredItem(f.id);
                    }}
                    onPointerLeave={(e) => {
                      e.stopPropagation();
                      setHoveredItem(null);
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectItem(f);
                    }}
                  >
                    <CardBackground
                      width={cardWidth}
                      height={cardHeight}
                      radius={0.04}
                      colorTop={isPlaced ? "#C7E4FA" : isHovered ? "#C7E4FA" : "#DCEEFB"}
                      colorBottom={isPlaced ? "#A5D1E7" : isHovered ? "#E6F0F7" : "#F0F2F5"}
                      opacity={0.5}
                      topStrength={isPlaced ? 2.5 : isHovered ? 2.8 : 2.5}
                    />
                  </mesh>

                  <mesh position={[0, -0.01, -0.01]}>
                    <RoundedPlane width={cardWidth} height={cardHeight} radius={0.04} />
                    <meshStandardMaterial
                      color="#000000"
                      opacity={0.1}
                      transparent
                      roughness={1.0}
                    />
                  </mesh>

                  <group position={[0, 0.08, 0.01]}>

                    {f.image ? (
                      <mesh>
                        <planeGeometry args={[0.2, 0.2]} />
                        <FurnitureImageMaterial image={f.image} />
                      </mesh>
                    ) : (f as any).widgetType === "clock" ? (
                      <mesh>
                        <planeGeometry args={[0.2, 0.2]} />
                        <ClockPreviewTexture url={digitalClockIconUrl} />
                      </mesh>
                    ) : (f as any).widgetType === "whiteboard" ? (
                      <group>
                        <mesh>
                          <planeGeometry args={[0.2, 0.2]} />
                          <meshStandardMaterial color="#f8fafc" />
                        </mesh>
                        <Text
                          position={[0, 0, 0.01]}
                          fontSize={0.025}
                          color="#64748b"
                          anchorX="center"
                          anchorY="middle"
                        >
                          Whiteboard
                        </Text>
                      </group>
                    ) : (f as any).widgetType === "weather" ? (
                      <group>
                        <mesh>
                          <planeGeometry args={[0.2, 0.2]} />
                          <meshStandardMaterial color="#E0F2FE" />
                        </mesh>
                        <Text
                          position={[0, 0, 0.01]}
                          fontSize={0.06}
                          color="#0EA5E9"
                          anchorX="center"
                          anchorY="middle"
                        >
                          ☀
                        </Text>
                        <Text
                          position={[0, -0.08, 0.01]}
                          fontSize={0.02}
                          color="#64748b"
                          anchorX="center"
                          anchorY="middle"
                        >
                          Weather
                        </Text>
                      </group>
                    ) : (
                      <mesh>
                        <planeGeometry args={[0.2, 0.2]} />
                        <meshStandardMaterial color="#d0d6dd" />
                        <Text
                          fontSize={0.03}
                          color="#ffffffff"
                          anchorX="center"
                          anchorY="middle"
                        >
                          No Image
                        </Text>
                      </mesh>
                    )}
                  </group>

                  {f.type && (
                    <group position={[-0.04, -0.06, 0.02]}>
                      <mesh>
                        <planeGeometry args={[0.12, 0.05]} />
                        <meshStandardMaterial
                          color="#66B9E2"
                          roughness={0.5}
                        />
                      </mesh>
                      <Text
                        position={[0, 0, 0.001]}
                        fontSize={0.02}
                        color="#ffffff"
                        anchorX="center"
                        anchorY="middle"
                        fontWeight="600"
                      >
                        {f.type}
                      </Text>
                    </group>
                  )}

                  <Text
                    position={[0, -0.14, 0.02]}
                    fontSize={0.03}
                    color="#334155"
                    anchorX="center"
                    anchorY="middle"
                    maxWidth={cardWidth - 0.08}
                    textAlign="center"
                    fontWeight="500"
                  >
                    {f.name}
                  </Text>
                </group>
              );
            })}
          </group>
        )}
      </group>


      {totalPages > 1 && (
        <PaginationControls
          totalPages={totalPages}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          hoveredButton={hoveredButton}
          setHoveredButton={setHoveredButton}
          yPosition={-panelHeight / 2 + paginationHeight / 2 + bottomPadding}
        />
      )}
    </group>
  );
}

function PaginationControls({
  totalPages,
  currentPage,
  onPageChange,
  hoveredButton,
  setHoveredButton,
  yPosition,
}: {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  hoveredButton: string | null;
  setHoveredButton: (button: string | null) => void;
  yPosition: number;
}) {
  const pageButtons: number[] = Array.from({ length: totalPages }, (_, i) => i);
  const buttonSize = 0.07;
  const spacing = 0.02;
  const totalWidth = pageButtons.length * buttonSize + (pageButtons.length - 1) * spacing;

  return (
    <group position={[0, yPosition, 0.01]}>
      {pageButtons.map((page) => {
        const isSelected = currentPage === page;
        const isHovered = hoveredButton === `page-${page}`;
        const xOffset = -totalWidth / 2 + page * (buttonSize + spacing) + buttonSize / 2;

        return (
          <group
            key={page}
            position={[xOffset, 0, 0]}
            onPointerEnter={(e) => {
              e.stopPropagation();
              setHoveredButton(`page-${page}`);
            }}
            onPointerLeave={(e) => {
              e.stopPropagation();
              setHoveredButton(null);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPageChange(page);
            }}
          >
  
            <mesh position={[0, 0, 0]}>
              <RoundedPlane width={buttonSize} height={buttonSize} radius={0.015} />
              <meshStandardMaterial
                color={isSelected ? "#66B9E2" : isHovered ? "#A5D1E7" : "#DCEEFB"}
                emissive={isSelected || isHovered ? "#ffffff" : "#f5f5f5"}
                emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.2 : 0.1}
                roughness={0.5}
              />
            </mesh>

       
            <mesh position={[0, -0.003, -0.01]}>
              <RoundedPlane width={buttonSize} height={buttonSize} radius={0.015} />
              <meshStandardMaterial
                color="#000000"
                opacity={0.08}
                transparent
                roughness={1.0}
              />
            </mesh>

        
            <Text
              position={[0, 0, 0.01]}
              fontSize={0.024}
              color={isSelected ? "#150606" : "#334155"}
              anchorX="center"
              anchorY="middle"
              fontWeight={isSelected ? "600" : "400"}
            >
              {page + 1}
            </Text>
          </group>
        );
      })}
    </group>
  );
}

function CategoryButtons({
  selectedCategory,
  onSelectCategory,
  hoveredButton,
  setHoveredButton,
  yPosition,
}: {
  selectedCategory: FurnitureCategory;
  onSelectCategory: (category: FurnitureCategory) => void;
  hoveredButton: string | null;
  setHoveredButton: (button: string | null) => void;
  yPosition: number;
}) {
  const categories: FurnitureCategory[] = ["all", "living-room", "bedroom", "office-room", "kitchen", "widgets", "wallpaper"];
  const [scrollOffset, setScrollOffset] = React.useState(0);
  
  const buttonWidth = 0.16;
  const buttonHeight = 0.08;
  const spacing = 0.02;
  const viewportWidth = 0.7;
  const arrowButtonWidth = 0.06;
  const arrowSpacing = 0.015;
  
  const totalContentWidth = categories.length * (buttonWidth + spacing) - spacing;
  const maxScrollOffset = Math.max(0, totalContentWidth - viewportWidth);
  
  const canScrollLeft = scrollOffset > 0;
  const canScrollRight = scrollOffset < maxScrollOffset;

  const handleScrollLeft = () => {
    setScrollOffset(Math.max(0, scrollOffset - (buttonWidth + spacing) * 2));
  };

  const handleScrollRight = () => {
    setScrollOffset(Math.min(maxScrollOffset, scrollOffset + (buttonWidth + spacing) * 2));
  };

  const leftClipPlane = React.useMemo(() => new THREE.Plane(new THREE.Vector3(1, 0, 0), viewportWidth / 2), [viewportWidth]);
  const rightClipPlane = React.useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), viewportWidth / 2), [viewportWidth]);

  return (
    <group position={[0, yPosition, 0.01]}>
      {/* Left scroll arrow */}
      {canScrollLeft && (
        <group
          position={[-viewportWidth + arrowButtonWidth + arrowSpacing + 0.23, 0, 0]}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton('scroll-left');
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handleScrollLeft();
          }}
        >
          <mesh>
            <RoundedPlane width={arrowButtonWidth} height={buttonHeight} radius={0.02} />
            <meshStandardMaterial
              color={hoveredButton === 'scroll-left' ? "#A5D1E7" : "#DCEEFB"}
              emissive="#ffffff"
              emissiveIntensity={hoveredButton === 'scroll-left' ? 0.2 : 0.1}
              roughness={0.5}
            />
          </mesh>
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.04}
            color="#334155"
            anchorX="center"
            anchorY="middle"
          >
            ‹
          </Text>
        </group>
      )}

      {/*category buttons*/}
      <group position={[0, 0, 0]}>
        {categories.map((category, index) => {
          const isSelected = selectedCategory === category;
          const isHovered = hoveredButton === `category-${category}`;
          const xOffset = -viewportWidth / 2 + buttonWidth / 2 + index * (buttonWidth + spacing) - scrollOffset;

          const buttonLeft = xOffset - buttonWidth / 2;
          const buttonRight = xOffset + buttonWidth / 2;
          const viewportLeft = -viewportWidth / 2;
          const viewportRight = viewportWidth / 2;

          if (buttonRight < viewportLeft || buttonLeft > viewportRight) {
            return null;
          }

          return (
            <group
              key={category}
              position={[xOffset, 0, 0]}
              onPointerEnter={(e) => {
                e.stopPropagation();
                if (xOffset >= viewportLeft && xOffset <= viewportRight) {
                  setHoveredButton(`category-${category}`);
                }
              }}
              onPointerLeave={(e) => {
                e.stopPropagation();
                setHoveredButton(null);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (xOffset >= viewportLeft && xOffset <= viewportRight) {
                  onSelectCategory(category);
                }
              }}
            >
              <mesh position={[0, 0, 0]}>
                <RoundedPlane width={buttonWidth} height={buttonHeight} radius={0.02} />
                <meshStandardMaterial
                  color={isSelected ? "#66B9E2" : isHovered ? "#A5D1E7" : "#DCEEFB"}
                  emissive={isSelected || isHovered ? "#ffffff" : "#f5f5f5"}
                  emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.2 : 0.1}
                  roughness={0.5}
                  clippingPlanes={[leftClipPlane, rightClipPlane]}
                  clipIntersection={false}
                />
              </mesh>

              <mesh position={[0, -0.005, -0.01]}>
                <RoundedPlane width={buttonWidth} height={buttonHeight} radius={0.02} />
                <meshStandardMaterial
                  color="#000000"
                  opacity={0.08}
                  transparent
                  roughness={1.0}
                  clippingPlanes={[leftClipPlane, rightClipPlane]}
                  clipIntersection={false}
                />
              </mesh>

              <Text
                position={[0, 0, 0.01]}
                fontSize={0.025}
                color={isSelected ? "#161111" : "#334155"}
                anchorX="center"
                anchorY="middle"
                fontWeight={isSelected ? "600" : "400"}
              >
                {CATEGORY_LABELS[category]}
              </Text>
            </group>
          );
        })}
      </group>

      {/* Right scroll arrow */}
      {canScrollRight && (
        <group
          position={[viewportWidth - arrowButtonWidth - arrowSpacing - 0.24, 0, 0]}
          onPointerEnter={(e) => {
            e.stopPropagation();
            setHoveredButton('scroll-right');
          }}
          onPointerLeave={(e) => {
            e.stopPropagation();
            setHoveredButton(null);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handleScrollRight();
          }}
        >
          <mesh>
            <RoundedPlane width={arrowButtonWidth} height={buttonHeight} radius={0.02} />
            <meshStandardMaterial
              color={hoveredButton === 'scroll-right' ? "#A5D1E7" : "#DCEEFB"}
              emissive="#ffffff"
              emissiveIntensity={hoveredButton === 'scroll-right' ? 0.2 : 0.1}
              roughness={0.5}
            />
          </mesh>
          <Text
            position={[0, 0, 0.01]}
            fontSize={0.04}
            color="#334155"
            anchorX="center"
            anchorY="middle"
          >
            ›
          </Text>
        </group>
      )}
    </group>
  );
}

function FurnitureImageMaterial({ image }: { image: string }) {
  return <FurnitureImage image={image} />;
}

function ClockPreviewTexture({ url }: { url: string }) {
  const texture = useLoader(THREE.TextureLoader, url);
  React.useEffect(() => {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
  }, [texture]);
  return (
    <meshBasicMaterial
      map={texture}
      transparent
      side={THREE.FrontSide}
      toneMapped={false}
    />
  );
}