import React, { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Center } from "@react-three/drei";
import type { BaseDevice } from "@/models";
import { DeviceType } from "@/types/device.types";
import type { Lightbulb } from "@/models/devices/Lightbulb";
import type { Fan } from "@/models/devices/Fan";
import type { Television } from "@/models/devices/Television";
import type { AirConditioner } from "@/models/devices/AirConditioner";
import { LightbulbModel } from "./LightbulbModel";
import { FanModel } from "./FanModel";
import { TelevisionModel } from "./TelevisionModel";
import { AirConditionerModel } from "./AirConditionerModel";

interface DeviceModel3DProps {
  device: BaseDevice;
  className?: string;
}

function DeviceScene({ device }: { device: BaseDevice }) {
  switch (device.type) {
    case DeviceType.Lightbulb: {
      const lightbulb = device as Lightbulb;
      return (
        <LightbulbModel
          brightness={lightbulb.brightness}
          colour={lightbulb.colour}
        />
      );
    }
    case DeviceType.Fan: {
      const fan = device as Fan;
      return (
        <FanModel
          speed={fan.is_on ? fan.speed : 0}
          swing={fan.is_on && fan.swing}
        />
      );
    }
    case DeviceType.Television: {
      const tv = device as Television;
      return <TelevisionModel isOn={!tv.isMute} />;
    }
    case DeviceType.AirConditioner: {
      const ac = device as AirConditioner;
      return <AirConditionerModel temperature={ac.temperature} />;
    }
    default:
      return null;
  }
}

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#666" wireframe />
    </mesh>
  );
}

function needsAnimation(device: BaseDevice): boolean {
  switch (device.type) {
    case DeviceType.Fan: {
      const fan = device as Fan;
      return fan.is_on && fan.speed > 0;
    }
    default:
      return false;
  }
}

export const DeviceModel3D = React.memo(
  function DeviceModel3D({ device, className }: DeviceModel3DProps) {
    const frameloop = useMemo(
      () => (needsAnimation(device) ? "always" : "demand"),
      [device],
    );

    return (
      <div className={className} style={{ width: "100%", height: "100%" }}>
        <Canvas
          camera={{ position: [0, 0, 2], fov: 45 }}
          style={{ background: "transparent" }}
          frameloop={frameloop}
          gl={{
            alpha: true,
            antialias: true,
            powerPreference: "low-power",
            preserveDrawingBuffer: true,
          }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener("webglcontextlost", (e) => {
              e.preventDefault();
              console.warn("WebGL context lost, will attempt restore");
            });
            gl.domElement.addEventListener("webglcontextrestored", () => {
              console.log("WebGL context restored");
            });
          }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <directionalLight position={[-5, -5, -5]} intensity={0.3} />
          <Suspense fallback={<LoadingFallback />}>
            <Center>
              <DeviceScene device={device} />
            </Center>
            <Environment preset="studio" />
          </Suspense>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate={false}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 2}
          />
        </Canvas>
      </div>
    );
  },
  (prevProps, nextProps) => {
    if (prevProps.device.id !== nextProps.device.id) return false;
    if (prevProps.className !== nextProps.className) return false;

    const prevProperties = prevProps.device.getProperties();
    const nextProperties = nextProps.device.getProperties();
    return JSON.stringify(prevProperties) === JSON.stringify(nextProperties);
  },
);
