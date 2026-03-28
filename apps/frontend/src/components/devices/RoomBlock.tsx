import React, { useState } from "react";
import {
  DoorOpen,
  Lightbulb,
  Tv,
  Fan,
  Snowflake,
  Pencil,
  Trash2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Room } from "@/models";
import { DeviceType } from "@/types/device.types";

interface RoomBlockProps {
  room: Room;
  onClick?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  isSelected?: boolean;
  onDrop?: (deviceId: string, deviceType: string) => void;
}

const deviceIcons = {
  [DeviceType.Lightbulb]: Lightbulb,
  [DeviceType.Television]: Tv,
  [DeviceType.Fan]: Fan,
  [DeviceType.AirConditioner]: Snowflake,
  [DeviceType.SmartMeter]: Zap,
};

export function RoomBlock({
  room,
  onClick,
  onRename,
  onDelete,
  isSelected,
  onDrop,
}: RoomBlockProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleInternalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const deviceId = e.dataTransfer.getData("deviceId");
    const deviceType = e.dataTransfer.getData("deviceType");
    
    if (deviceId && deviceType) {
      onDrop?.(deviceId, deviceType);
    }
  };

  return (
    <div
      onClick={onClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleInternalDrop}
      className={cn(
        "group relative cursor-pointer transition-all duration-300",
        "transform-gpu hover:-translate-y-1 hover:scale-102",
      )}
    >
      {/* Room block */}
      <div
        className={cn(
          "relative w-40 h-32 rounded-xl",
          "border border-border shadow-md",
          "flex flex-col items-center justify-center gap-2 p-3",
          isSelected 
            ? "bg-muted shadow-inner border-primary/20" 
            : isDragOver
            ? "bg-primary/5 border-primary shadow-md scale-105"
            : "bg-gradient-to-br from-card to-muted/80 shadow-md",
          "group-hover:shadow-lg group-hover:border-primary/50",
          "transition-all duration-300",
        )}
      >
        {/* Room icon */}
        <DoorOpen className="w-6 h-6 text-primary/70 shrink-0" />

        {/* Room name */}
        <h4 className="font-medium text-sm text-foreground truncate w-full text-center shrink-0">
          {room.name}
        </h4>

        {/* Device icons */}
        <div className="flex gap-1.5 flex-nowrap justify-center items-center overflow-visible">
          {room.devices.slice(0, 4).map((device) => {
            const Icon = deviceIcons[device.type] || Lightbulb;
            return (
              <div
                key={device.id}
                className={cn(
                  "w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center",
                  "border border-border/50",
                )}
              >
                <Icon className="w-3 h-3 text-muted-foreground" />
              </div>
            );
          })}
          {room.devices.length > 4 && (
            <span className="text-xs text-muted-foreground self-center">
              +{room.devices.length - 4}
            </span>
          )}
          {room.devices.length === 0 && (
            <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider font-medium">
              Empty
            </span>
          )}
        </div>
      </div>

      {/* Action buttons - appear on hover */}
      <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        {onRename && (
          <Button
            variant="secondary"
            size="icon"
            className="h-6 w-6 shadow-md hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
            title="Rename"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="destructive"
            size="icon"
            className="h-6 w-6 shadow-md hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
