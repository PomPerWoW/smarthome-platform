import { useState, useEffect } from "react";
import { Fan as FanIcon, Wind, RotateCw, Power } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { Fan } from "@/models";
import { DeviceService } from "@/services/DeviceService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FanControlProps {
  device: Fan;
  onUpdate?: () => void;
}

const speedLabels = [
  "Off",
  "Low",
  "Medium-Low",
  "Medium",
  "Medium-High",
  "High",
];

export function FanControl({ device, onUpdate }: FanControlProps) {
  const [isOn, setIsOn] = useState(device.is_on);
  const [speed, setSpeed] = useState(device.speed);
  const [swing, setSwing] = useState(device.swing);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setIsOn(device.is_on);
    setSpeed(device.speed);
    setSwing(device.swing);
  }, [device]);

  const handlePowerToggle = async () => {
    const newIsOn = !isOn;
    setIsOn(newIsOn);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().togglePower(device.id, newIsOn);
      toast.success(newIsOn ? "Fan turned on" : "Fan turned off");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to toggle power");
      setIsOn(!newIsOn);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSpeedChange = (value: number[]) => {
    setSpeed(value[0]);
  };

  const handleSpeedCommit = async () => {
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setSpeed(device.id, speed);
      toast.success("Speed updated");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update speed");
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
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update swing");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header with Power Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
            <FanIcon
              className={cn(
                "w-6 h-6 text-cyan-500 transition-transform",
                isOn && speed > 0 && "animate-spin",
              )}
              style={{ animationDuration: `${2 - speed * 0.3}s` }}
            />
          </div>
          <div>
            <h3 className="font-semibold">{device.name}</h3>
            <p className="text-sm text-muted-foreground">Tower Fan</p>
          </div>
        </div>
        <Button
          variant={isOn ? "default" : "outline"}
          size="icon"
          onClick={handlePowerToggle}
          disabled={isUpdating}
          className={isOn ? "bg-green-500 hover:bg-green-600" : ""}
        >
          <Power className="w-5 h-5" />
        </Button>
      </div>

      {/* Controls - only show when on */}
      {isOn && (
        <>
          {/* Speed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Wind className="w-4 h-4" />
                Speed
              </Label>
              <span className="text-sm font-medium">{speedLabels[speed]}</span>
            </div>
            <Slider
              value={[speed]}
              onValueChange={handleSpeedChange}
              onValueCommit={handleSpeedCommit}
              max={5}
              step={1}
              disabled={isUpdating}
              className="w-full"
            />

            {/* Speed preset buttons */}
            <div className="flex gap-2">
              {speedLabels.map((_, index) => (
                <Button
                  key={index}
                  variant={speed === index ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setSpeed(index);
                    handleSpeedCommit();
                  }}
                  disabled={isUpdating}
                  className="flex-1 text-xs"
                >
                  {index}
                </Button>
              ))}
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
                  isOn && speed > 0 && "animate-spin",
                )}
                style={{ animationDuration: `${2 - speed * 0.3}s` }}
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
