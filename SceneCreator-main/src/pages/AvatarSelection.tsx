import * as React from "react";
import { useState, useRef, useEffect, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { AVATAR_URL_MAP } from "../components/scene/AvatarController";
import { AVATAR_INDICES } from "../components/panel/AvatarControlPanel";

const AVATAR_COLORS: Record<number, string> = {
  4:  "#6366f1",
  5:  "#8b5cf6",
  6:  "#a855f7",
  7:  "#3b82f6",
  8:  "#06b6d4",
  9:  "#14b8a6",
  10: "#22c55e",
  11: "#f59e0b",
  12: "#f97316",
};

function AvatarModel({ url }: { url: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions } = useAnimations(animations, groupRef);

  useEffect(() => {
    const entry = Object.entries(actions).find(([key]) =>
      key.toLowerCase().includes("idle")
    );
    if (entry) entry[1]?.play();
  }, [actions]);

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.4;
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

function AvatarCard({
  index,
  isSelected,
  isHovered,
  available,
  onSelect,
  onHover,
  onLeave,
}: {
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  available: boolean;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  const accent = AVATAR_COLORS[index] ?? "#6366f1";
  const active = isSelected || isHovered;

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={available ? onSelect : undefined}
      style={{
        cursor: available ? "pointer" : "not-allowed",
        borderRadius: "14px",
        overflow: "hidden",
        background: "#ffffff",
        border: isSelected
          ? `2px solid ${accent}`
          : isHovered
          ? "2px solid rgba(99,102,241,0.35)"
          : "2px solid rgba(0,0,0,0.07)",
        transition: "transform 0.18s, box-shadow 0.18s, border-color 0.18s",
        transform: active ? "translateY(-3px)" : "none",
        boxShadow: active
          ? "0 8px 20px rgba(0,0,0,0.12)"
          : "0 2px 6px rgba(0,0,0,0.06)",
        opacity: available ? 1 : 0.45,
      }}
    >
      <div
        style={{
          height: "76px",
          background: `linear-gradient(135deg, ${accent}18, ${accent}35)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2rem",
        }}
      >
        👤
      </div>

      <div style={{ padding: "0.45rem 0.4rem", textAlign: "center" }}>
        <div style={{ color: "#1e293b", fontSize: "0.78rem", fontWeight: 600 }}>
          Resident #{index}
        </div>
        {!available && (
          <div style={{ color: "#ef4444", fontSize: "0.66rem", marginTop: "2px" }}>
            Not available
          </div>
        )}
        {isSelected && available && (
          <div style={{ color: accent, fontSize: "0.66rem", marginTop: "2px", fontWeight: 600 }}>
            ✓ Selected
          </div>
        )}
      </div>
    </div>
  );
}

export function AvatarSelection() {
  const navigate = useNavigate();

  const initIdx = (): number => {
    const stored = parseInt(localStorage.getItem("selectedAvatarIndex") ?? "4", 10);
    if (AVATAR_URL_MAP[stored]) return stored;
    const first = Object.keys(AVATAR_URL_MAP)[0];
    return first ? parseInt(first, 10) : 4;
  };

  const [selectedIdx, setSelectedIdx] = useState<number>(initIdx);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const previewIdx = hoveredIdx ?? selectedIdx;
  const previewUrl = AVATAR_URL_MAP[previewIdx];
  const accent = AVATAR_COLORS[previewIdx] ?? "#6366f1";

  const handleConfirm = () => {
    localStorage.setItem("selectedAvatarIndex", String(selectedIdx));
    navigate("/");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#e7e9eb",
        color: "#1e293b",
        fontFamily: "system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "1rem 2rem",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "#ffffff",
          gap: "1rem",
        }}
      >
        <button
          onClick={() => navigate("/")}
          style={{
            background: "transparent",
            border: "1px solid rgba(0,0,0,0.15)",
            color: "#64748b",
            borderRadius: "8px",
            padding: "0.45rem 1rem",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontFamily: "inherit",
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = "#f1f5f9")}
          onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
        >
          ← Back
        </button>

        <div style={{ flex: 1, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700, color: "#1e293b" }}>
            Choose Your Avatar
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
            Select the resident you want to appear as in your digital home
          </p>
        </div>

        <div style={{ width: "90px" }} />
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        <div
          style={{
            flex: "0 0 56%",
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid rgba(0,0,0,0.08)",
            background: "#f8fafc",
          }}
        >
          <div style={{ flex: 1 }}>
            <Canvas
              camera={{ position: [0, 1.2, 3.5], fov: 40 }}
              style={{ background: "#e2e8f0", height: "100%" }}
            >
              <ambientLight intensity={2} />
              <directionalLight position={[2, 5, 3]} intensity={1.5} />
              <directionalLight position={[-2, 2, -3]} intensity={0.4} />

              <Suspense fallback={null}>
                {previewUrl && <AvatarModel key={previewUrl} url={previewUrl} />}
              </Suspense>

              <OrbitControls
                target={[0, 0.85, 0]}
                minDistance={1.5}
                maxDistance={6}
                enablePan={false}
              />

              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[1.4, 48]} />
                <meshBasicMaterial color="#cbd5e1" />
              </mesh>
            </Canvas>
          </div>

          <div
            style={{
              textAlign: "center",
              padding: "0.9rem",
              background: "#ffffff",
              borderTop: "1px solid rgba(0,0,0,0.07)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                background: `${accent}18`,
                border: `1px solid ${accent}55`,
                color: accent,
                borderRadius: "999px",
                padding: "0.28rem 1.2rem",
                fontSize: "0.88rem",
                fontWeight: 600,
              }}
            >
              Resident #{previewIdx}
            </span>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.76rem", color: "#94a3b8" }}>
              {previewUrl ? "Drag to rotate · Scroll to zoom" : "Avatar GLB not found"}
            </p>
          </div>
        </div>

        <div
          style={{
            flex: "0 0 44%",
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 0.2rem", fontSize: "1rem", fontWeight: 600, color: "#1e293b" }}>
              Available Avatars
            </h2>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#64748b" }}>
              Hover to preview · Click to select
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.7rem",
            }}
          >
            {AVATAR_INDICES.map((idx) => (
              <AvatarCard
                key={idx}
                index={idx}
                isSelected={selectedIdx === idx}
                isHovered={hoveredIdx === idx}
                available={!!AVATAR_URL_MAP[idx]}
                onSelect={() => setSelectedIdx(idx)}
                onHover={() => setHoveredIdx(idx)}
                onLeave={() => setHoveredIdx(null)}
              />
            ))}
          </div>

          <div style={{ marginTop: "auto" }}>
            <button
              onClick={handleConfirm}
              style={{
                width: "100%",
                padding: "0.85rem",
                background: "#6366f1",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.2s",
                fontFamily: "inherit",
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#4f46e5")}
              onMouseOut={(e) => (e.currentTarget.style.background = "#6366f1")}
            >
              ✓ Confirm — Resident #{selectedIdx}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
