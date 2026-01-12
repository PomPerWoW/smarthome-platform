import { useState, useEffect } from "react";
import { Snowflake, Thermometer, Minus, Plus, Power } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import type { AirConditioner } from "@/models";
import { DeviceService } from "@/services/DeviceService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AirConditionerControlProps {
  device: AirConditioner;
  onUpdate?: () => void;
}

export function AirConditionerControl({
  device,
  onUpdate,
}: AirConditionerControlProps) {
  const [temperature, setTemperature] = useState(device.temperature);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isOn, setIsOn] = useState(device.is_on);

  useEffect(() => {
    setIsOn(device.is_on);
    setTemperature(device.temperature);
  }, [device]);

  const handlePowerToggle = async () => {
    const newIsOn = !isOn;
    setIsOn(newIsOn);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().togglePower(device.id, newIsOn);
      toast.success(newIsOn ? "AC turned on" : "AC turned off");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to toggle power");
      setIsOn(!newIsOn);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleTemperatureChange = (value: number[]) => {
    setTemperature(value[0]);
  };

  const handleTemperatureCommit = async () => {
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setTemperature(device.id, temperature);
      toast.success("Temperature updated");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update temperature");
    } finally {
      setIsUpdating(false);
    }
  };

  const adjustTemperature = async (delta: number) => {
    const newTemp = Math.max(16, Math.min(30, temperature + delta));
    setTemperature(newTemp);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setTemperature(device.id, newTemp);
      toast.success("Temperature updated");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update temperature");
    } finally {
      setIsUpdating(false);
    }
  };

  const getTemperatureColor = () => {
    const ratio = (temperature - 16) / (30 - 16);
    if (ratio < 0.33) return "from-blue-500 to-cyan-400";
    if (ratio < 0.66) return "from-cyan-400 to-green-400";
    return "from-green-400 to-orange-400";
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header with Power Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-sky-500/20 flex items-center justify-center">
            <Snowflake className="w-6 h-6 text-sky-500" />
          </div>
          <div>
            <h3 className="font-semibold">{device.name}</h3>
            <p className="text-sm text-muted-foreground">Air Conditioner</p>
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
          {/* Temperature display */}
          <div
            className={cn(
              "text-center py-8 rounded-2xl bg-gradient-to-br",
              getTemperatureColor(),
            )}
          >
            <div className="text-6xl font-bold text-white drop-shadow-lg">
              {temperature}°
            </div>
            <div className="text-white/80 text-sm mt-1">Celsius</div>
          </div>

          {/* Quick adjust buttons */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => adjustTemperature(-1)}
              disabled={isUpdating || temperature <= 16}
              className="w-16 h-16 rounded-full"
            >
              <Minus className="w-6 h-6" />
            </Button>

            <div className="text-center">
              <Thermometer className="w-8 h-8 mx-auto text-muted-foreground" />
              <span className="text-xs text-muted-foreground">16°C - 30°C</span>
            </div>

            <Button
              variant="outline"
              size="lg"
              onClick={() => adjustTemperature(1)}
              disabled={isUpdating || temperature >= 30}
              className="w-16 h-16 rounded-full"
            >
              <Plus className="w-6 h-6" />
            </Button>
          </div>

          {/* Slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm text-muted-foreground">
                {temperature}°C
              </span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={handleTemperatureChange}
              onValueCommit={handleTemperatureCommit}
              min={16}
              max={30}
              step={1}
              disabled={isUpdating}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Cold (16°)</span>
              <span>Warm (30°)</span>
            </div>
          </div>

          {/* Preset temperatures */}
          <div className="grid grid-cols-3 gap-2">
            {[18, 22, 25].map((temp) => (
              <Button
                key={temp}
                variant={temperature === temp ? "default" : "outline"}
                size="sm"
                onClick={() => adjustTemperature(temp - temperature)}
                disabled={isUpdating}
              >
                {temp}°C
              </Button>
            ))}
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
