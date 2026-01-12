import React from "react";
import { cn } from "@/lib/utils";
import type { BaseDevice } from "@/models";
import { DeviceModel3D } from "./models";

interface DeviceCardProps {
  device: BaseDevice;
  onControl?: () => void;
  onDelete?: () => void;
}

const deviceColors = {
  Lightbulb: "from-yellow-500/20 to-amber-500/20 border-yellow-500/30",
  Television: "from-blue-500/20 to-indigo-500/20 border-blue-500/30",
  Fan: "from-cyan-500/20 to-teal-500/20 border-cyan-500/30",
  AirConditioner: "from-sky-500/20 to-blue-500/20 border-sky-500/30",
};

// Memoized to prevent re-renders that cause WebGL context recreation
export const DeviceCard = React.memo(
  function DeviceCard({ device, onControl, onDelete }: DeviceCardProps) {
    const colorClass =
      deviceColors[device.type as keyof typeof deviceColors] ||
      deviceColors.Lightbulb;

    return (
      <div
        className={cn(
          "relative p-4 rounded-xl border",
          "bg-gradient-to-br",
          colorClass,
          "transition-all duration-300",
          "hover:shadow-lg hover:scale-[1.02]",
          "cursor-pointer",
        )}
        onClick={onControl}
      >
        {/* 3D Model */}
        <div className="w-full h-40 mb-3 rounded-lg overflow-hidden bg-background/20">
          <DeviceModel3D device={device} />
        </div>

        {/* Info */}
        <div className="space-y-1">
          <h4 className="font-semibold text-sm truncate">{device.name}</h4>
          <p className="text-xs text-muted-foreground">
            {device.getDisplayLabel()}
          </p>
          {device.roomName && (
            <p className="text-xs text-muted-foreground/70">
              {device.roomName}
            </p>
          )}
        </div>

        {/* Properties preview */}
        <div className="mt-3 flex flex-wrap gap-1">
          {Object.entries(device.getProperties())
            .slice(0, 2)
            .map(([key, value]) => (
              <span
                key={key}
                className="text-[10px] px-2 py-0.5 rounded-full bg-background/50 text-muted-foreground"
              >
                {key}: {String(value)}
              </span>
            ))}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if device data actually changed
    if (prevProps.device.id !== nextProps.device.id) return false;
    if (prevProps.onControl !== nextProps.onControl) return false;
    if (prevProps.onDelete !== nextProps.onDelete) return false;

    // Compare device properties to detect state changes
    const prevProperties = prevProps.device.getProperties();
    const nextProperties = nextProps.device.getProperties();
    return JSON.stringify(prevProperties) === JSON.stringify(nextProperties);
  },
);
