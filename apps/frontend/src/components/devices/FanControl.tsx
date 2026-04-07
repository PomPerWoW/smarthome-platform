import { useState, useEffect } from "react";
import { Fan as FanIcon, Wind, RotateCw, Power } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { Fan } from "@/models";
import { DeviceService } from "@/services/DeviceService";
import { WebSocketService } from "@/services/WebSocketService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/stores/notification_store";
import { DeviceControlHeader } from "./DeviceControlHeader";

interface FanControlProps {
  device: Fan;
  onUpdate?: () => void;
}

// Removed speedLabels as UI doesn't track absolute fan speed anymore

export function FanControl({ device, onUpdate }: FanControlProps) {
  const [isOn, setIsOn] = useState(device.is_on);
  const [swing, setSwing] = useState(device.swing);
  const [isUpdating, setIsUpdating] = useState(false);
  const addNotification = useNotificationStore((s) => s.addNotification);

  useEffect(() => {
    setIsOn(device.is_on);
    setSwing(device.swing);
  }, [device]);

  const handlePowerToggle = async () => {
    const newIsOn = !isOn;
    setIsOn(newIsOn);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().togglePower(device.id, newIsOn);
      toast.success(newIsOn ? "Fan turned on" : "Fan turned off");
      addNotification({
        category: "device",
        iconType: newIsOn ? "power_on" : "power_off",
        title: newIsOn ? "Fan turned on" : "Fan turned off",
        description: `'${device.name}' is now ${newIsOn ? "running" : "off"}`,
        severity: newIsOn ? "success" : "info",
        deviceType: "Fan",
        deviceName: device.name,
      });
      onUpdate?.();
    } catch {
      toast.error("Failed to toggle power");
      setIsOn(!newIsOn);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSpeedAdjust = async (direction: number) => {
    setIsUpdating(true);

    try {
      WebSocketService.getInstance().sendMessage({
        action: "fan_speed",
        device_id: device.id,
        value: direction
      });
      // We don't await because it's a websocket message, we just assume it's sent

      toast.success(direction === 1 ? "Increased fan speed command sent" : "Decreased fan speed command sent");
      addNotification({
        category: "device",
        iconType: "fan_speed",
        title: "Fan speed adjusted",
        description: `'${device.name}' speed was ${direction === 1 ? "increased" : "decreased"}`,
        severity: "info",
        deviceType: "Fan",
        deviceName: device.name,
      });
      onUpdate?.();
    } catch {
      toast.error("Failed to adjust speed");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSwingToggle = async (enabled: boolean) => {
    setSwing(enabled);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setSwing(device.id, enabled);
      toast.success(enabled ? "Swing enabled" : "Swing disabled");
      addNotification({
        category: "device",
        iconType: enabled ? "fan_swing_on" : "fan_swing_off",
        title: enabled ? "Fan oscillation enabled" : "Fan oscillation disabled",
        description: `'${device.name}' ${enabled ? "is now oscillating side-to-side" : "oscillation has stopped"}`,
        severity: "info",
        deviceType: "Fan",
        deviceName: device.name,
      });
      onUpdate?.();
    } catch {
      toast.error("Failed to update swing");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header with Power Button */}
      <DeviceControlHeader
        device={device}
        displayLabel="Tower Fan"
        icon={FanIcon}
        iconColorClass="text-cyan-500"
        iconBgColorClass="bg-cyan-500/20"
        iconStyle={{ animationDuration: `1s` }}
        onUpdate={onUpdate}
      >
        <Button
          variant={isOn ? "default" : "outline"}
          size="icon"
          onClick={handlePowerToggle}
          disabled={isUpdating}
          className={isOn ? "bg-green-500 hover:bg-green-600" : ""}
        >
          <Power className="w-5 h-5" />
        </Button>
      </DeviceControlHeader>

      {/* Controls - only show when on */}
      {isOn && (
        <>
          {/* Speed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Wind className="w-4 h-4" />
                Fan Speed
              </Label>
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1 text-lg font-bold"
                onClick={() => handleSpeedAdjust(0)}
                disabled={isUpdating}
              >
                -
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-lg font-bold"
                onClick={() => handleSpeedAdjust(1)}
                disabled={isUpdating}
              >
                +
              </Button>
            </div>
          </div>

          {/* Swing */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <RotateCw
                className={cn(
                  "w-5 h-5 text-muted-foreground",
                  swing && "animate-pulse text-primary",
                )}
              />
              <div>
                <Label htmlFor="swing">Oscillation</Label>
                <p className="text-xs text-muted-foreground">
                  Rotate fan side to side
                </p>
              </div>
            </div>
            <Switch
              id="swing"
              checked={swing}
              onCheckedChange={handleSwingToggle}
              disabled={isUpdating}
            />
          </div>

          {/* Visualization */}
          <div className="flex justify-center py-4">
            <div
              className={cn(
                "w-16 h-16 rounded-full border-4 border-cyan-500/50",
                "flex items-center justify-center",
                swing && "animate-bounce",
              )}
            >
              <FanIcon
                className={cn(
                  "w-8 h-8 text-cyan-500",
                  isOn && "animate-spin",
                )}
                style={{ animationDuration: `1s` }}
              />
            </div>
          </div>
        </>
      )}

      {/* Off state message */}
      {!isOn && (
        <div className="text-center py-8 text-muted-foreground">
          <p>Device is off</p>
          <p className="text-sm">Turn on to access controls</p>
        </div>
      )}
    </div>
  );
}
