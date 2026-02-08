import { Home as HomeIcon, DoorOpen, Trash2, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Home } from "@/models";

interface HomeBlockProps {
  home: Home;
  onDelete?: () => void;
  onRename?: (newName: string) => void;
  isSelected?: boolean;
}

export function HomeBlock({
  home,
  onDelete,
  onRename,
  isSelected,
}: HomeBlockProps) {
  return (
    <div
      className={cn(
        "group relative flex items-start gap-2",
        isSelected && "ring-2 ring-primary ring-offset-2 rounded-xl",
      )}
    >
      {/* Card - clickable, navigates to home detail */}
      <Link
        to="/homes/$homeId"
        params={{ homeId: home.id }}
        className="relative w-44 overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-all duration-300 transform-gpu hover:-translate-y-1 hover:shadow-xl cursor-pointer"
      >
        {/* Top section - colored header with icon */}
        <div
          className={cn(
            "h-16 bg-gradient-to-br from-primary to-primary/70",
            "flex items-center justify-center",
            "group-hover:from-primary/90 group-hover:to-primary/60",
            "transition-colors duration-300",
          )}
        >
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <HomeIcon className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>

        {/* Bottom section - content */}
        <div className="p-3 bg-card">
          {/* Home name */}
          <h3 className="font-semibold text-sm text-foreground truncate text-center mb-1">
            {home.name}
          </h3>

          {/* Stats */}
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mb-2">
            <DoorOpen className="w-3 h-3" />
            <span>{home.roomCount} rooms</span>
          </div>

          {/* Device status dots */}
          <div className="flex justify-center gap-1">
            {home.deviceCount > 0 ? (
              [...Array(Math.min(home.deviceCount, 5))].map((_, i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-green-500/80 animate-pulse"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground/60">
                No devices
              </span>
            )}
            {home.deviceCount > 5 && (
              <span className="text-[10px] text-muted-foreground ml-1">
                +{home.deviceCount - 5}
              </span>
            )}
          </div>
        </div>
      </Link>

      {/* Action buttons - appear on hover */}
      <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
        {onRename && (
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 shadow-md hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onRename(home.name);
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
            className="h-7 w-7 shadow-md hover:scale-110 transition-transform"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDelete();
            }}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
