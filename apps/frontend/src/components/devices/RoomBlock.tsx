import { DoorOpen, Lightbulb, Tv, Fan, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Room } from "@/models";
import { DeviceType } from "@/types/device.types";

interface RoomBlockProps {
  room: Room;
  onClick?: () => void;
  isSelected?: boolean;
}

const deviceIcons = {
  [DeviceType.Lightbulb]: Lightbulb,
  [DeviceType.Television]: Tv,
  [DeviceType.Fan]: Fan,
  [DeviceType.AirConditioner]: Snowflake,
};

export function RoomBlock({ room, onClick, isSelected }: RoomBlockProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "group relative cursor-pointer transition-all duration-300",
        "transform-gpu hover:-translate-y-1 hover:scale-102",
        isSelected && "ring-2 ring-primary ring-offset-2",
      )}
    >
      {/* Room block */}
      <div
        className={cn(
          "relative w-36 h-28 rounded-lg",
          "bg-gradient-to-br from-card to-muted/80",
          "border border-border shadow-md",
          "flex flex-col items-center justify-center gap-2 p-3",
          "group-hover:shadow-lg group-hover:border-primary/50",
          "transition-all duration-300",
        )}
      >
        {/* Room icon */}
        <DoorOpen className="w-6 h-6 text-primary/70" />

        {/* Room name */}
        <h4 className="font-medium text-sm text-foreground truncate w-full text-center">
          {room.name}
        </h4>

        {/* Device icons */}
        <div className="flex gap-1.5 flex-wrap justify-center">
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
            <span className="text-xs text-muted-foreground/60">
              Click to add devices
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
