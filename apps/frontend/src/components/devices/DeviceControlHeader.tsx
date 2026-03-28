import { useState, useEffect } from "react";
import { type LucideIcon, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeviceService } from "@/services/DeviceService";
import { toast } from "sonner";
import type { BaseDevice } from "@/models";
import { cn } from "@/lib/utils";

interface DeviceControlHeaderProps {
  device: BaseDevice;
  displayLabel: string;
  icon: LucideIcon;
  iconColorClass?: string;
  iconBgColorClass?: string;
  iconStyle?: React.CSSProperties;
  onUpdate?: () => void;
  children?: React.ReactNode; // Power button or other actions
}

export function DeviceControlHeader({
  device,
  displayLabel,
  icon: Icon,
  iconColorClass,
  iconBgColorClass,
  iconStyle,
  onUpdate,
  children,
}: DeviceControlHeaderProps) {
  const [isEditingTag, setIsEditingTag] = useState(false);
  const [editingTag, setEditingTag] = useState(device.tag || "");

  useEffect(() => {
    setEditingTag(device.tag || "");
  }, [device.tag]);

  const handleSaveTag = async () => {
    try {
      await DeviceService.getInstance().setTag(
        device.type,
        device.id,
        editingTag.trim(),
      );
      toast.success("Tag updated successfully");
      setIsEditingTag(false);
      onUpdate?.();
    } catch (err) {
      toast.error(`Failed to update tag: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            iconBgColorClass || "bg-muted",
          )}
        >
          <Icon className={cn("w-6 h-6", iconColorClass)} style={iconStyle} />
        </div>
        <div>
          <h3 className="font-semibold">{device.name}</h3>
          <div className="flex flex-col">
            <p className="text-sm text-muted-foreground">{displayLabel}</p>
            <div className="flex items-center gap-1 group min-h-[16px] mt-1">
              {isEditingTag ? (
                <div className="flex items-center gap-1 mt-0.5">
                  <Input
                    value={editingTag}
                    onChange={(e) => setEditingTag(e.target.value)}
                    className="h-6 w-28 text-[10px] px-1.5"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleSaveTag()}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={handleSaveTag}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setIsEditingTag(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-tight">
                    {device.tag || "No tag"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setIsEditingTag(true)}
                  >
                    <Pencil className="h-2.5 w-2.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
