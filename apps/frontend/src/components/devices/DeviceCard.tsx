import React from "react";
import { cn } from "@/lib/utils";
import type { BaseDevice } from "@/models";
import { DeviceModel3D } from "./models";
import {
  Sun,
  Thermometer,
  Volume2,
  Fan,
  Power,
  Zap,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeviceCardProps {
  device: BaseDevice;
  onControl?: () => void;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
}

const deviceColors = {
  Lightbulb: "from-yellow-500/20 to-amber-500/20 border-yellow-500/30",
  Television: "from-blue-500/20 to-indigo-500/20 border-blue-500/30",
  Fan: "from-cyan-500/20 to-teal-500/20 border-cyan-500/30",
  AirConditioner: "from-sky-500/20 to-blue-500/20 border-sky-500/30",
};

const getPropertyIcon = (key: string) => {
  switch (key.toLowerCase()) {
    case "brightness":
      return <Sun className="w-3 h-3" />;
    case "temperature":
      return <Thermometer className="w-3 h-3" />;
    case "volume":
      return <Volume2 className="w-3 h-3" />;
    case "speed":
      return <Fan className="w-3 h-3" />;
    default:
      return <Zap className="w-3 h-3" />;
  }
};

const formatPropertyValue = (key: string, value: any) => {
  if (key === "brightness" || key === "volume") return `${value}%`;
  if (key === "temperature") return `${value}°C`;
  return String(value);
};

// Memoized to prevent re-renders that cause WebGL context recreation
export const DeviceCard = React.memo(
  function DeviceCard({
    device,
    onControl,
    onDelete,
    onRename,
  }: DeviceCardProps) {
    const colorClass =
      deviceColors[device.type as keyof typeof deviceColors] ||
      deviceColors.Lightbulb;

    const properties = device.getProperties();

    return (
      <div
        className={cn(
          "group relative p-4 rounded-xl border",
          "bg-gradient-to-br",
          colorClass,
          "transition-all duration-300",
          "hover:shadow-lg hover:scale-[1.02]",
          "cursor-pointer",
        )}
        onClick={onControl}
      >
        {/* Action buttons - appear on hover */}
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
          {onRename && (
            <Button
              variant="secondary"
              size="icon"
              className="h-7 w-7 shadow-md bg-background/80 backdrop-blur-sm hover:bg-background hover:scale-110 transition-all duration-200"
              onClick={(e) => {
                e.stopPropagation();
                onRename(device.name);
              }}
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              size="icon"
              className="h-7 w-7 shadow-md opacity-90 hover:opacity-100 hover:scale-110 transition-all duration-200"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* 3D Model */}
        <div className="w-full h-48 mb-3 rounded-lg overflow-hidden bg-background/20">
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
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Status Badge */}
          {"is_on" in properties && (
            <span
              className={cn(
                "text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium border",
                properties.is_on
                  ? "bg-green-500/10 text-green-500 border-green-500/20"
                  : "bg-slate-500/10 text-slate-500 border-slate-500/20",
              )}
            >
              <Power className="w-3 h-3" />
              {properties.is_on ? "On" : "Off"}
            </span>
          )}

          {Object.entries(properties)
            .filter(([key]) => key !== "is_on")
            .slice(0, 2)
            .map(([key, value]) => (
              <span
                key={key}
                className="text-[10px] px-2 py-0.5 rounded-full bg-background/50 text-muted-foreground flex items-center gap-1 border border-white/5"
              >
                {getPropertyIcon(key)}
                {formatPropertyValue(key, value)}
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
    if (prevProps.onRename !== nextProps.onRename) return false;

    // Compare device properties to detect state changes
    const prevProperties = prevProps.device.getProperties();
    const nextProperties = nextProps.device.getProperties();
    return JSON.stringify(prevProperties) === JSON.stringify(nextProperties);
  },
);
