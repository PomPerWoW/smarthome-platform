import { useState, useEffect } from "react";
import { Lightbulb as LightbulbIcon, Sun, Palette, Power } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Lightbulb } from "@/models";
import { DeviceService } from "@/services/DeviceService";
import { toast } from "sonner";

interface LightbulbControlProps {
  device: Lightbulb;
  onUpdate?: () => void;
}

const presetColors = [
  { name: "Warm White", value: "#FFE4B5" },
  { name: "Cool White", value: "#F0F8FF" },
  { name: "Daylight", value: "#FFFAF0" },
  { name: "Red", value: "#FF6B6B" },
  { name: "Green", value: "#4ECDC4" },
  { name: "Blue", value: "#45B7D1" },
  { name: "Purple", value: "#9B59B6" },
  { name: "Orange", value: "#F39C12" },
];

export function LightbulbControl({ device, onUpdate }: LightbulbControlProps) {
  const [isOn, setIsOn] = useState(device.is_on);
  const [brightness, setBrightness] = useState(device.brightness);
  const [colour, setColour] = useState(device.colour);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync state
  useEffect(() => {
    setIsOn(device.is_on);
    setBrightness(device.brightness);
    setColour(device.colour);
  }, [device]);

  const handlePowerToggle = async () => {
    const newIsOn = !isOn;
    setIsOn(newIsOn);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().togglePower(device.id, newIsOn);
      toast.success(newIsOn ? "Light turned on" : "Light turned off");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to toggle power");
      setIsOn(!newIsOn); // Revert on failure
    } finally {
      setIsUpdating(false);
    }
  };

  const handleBrightnessChange = async (value: number[]) => {
    const newBrightness = value[0];
    setBrightness(newBrightness);
  };

  const handleBrightnessCommit = async () => {
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setBrightness(device.id, brightness);
      toast.success("Brightness updated");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update brightness");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleColourChange = async (newColour: string) => {
    setColour(newColour);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setColour(device.id, newColour);
      toast.success("Colour updated");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update colour");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header with Power Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${colour}30` }}
          >
            <LightbulbIcon className="w-6 h-6" style={{ color: colour }} />
          </div>
          <div>
            <h3 className="font-semibold">{device.name}</h3>
            <p className="text-sm text-muted-foreground">Smart Bulb</p>
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
          {/* Brightness */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Sun className="w-4 h-4" />
                Brightness
              </Label>
              <span className="text-sm font-medium">{brightness}%</span>
            </div>
            <Slider
              value={[brightness]}
              onValueChange={handleBrightnessChange}
              onValueCommit={handleBrightnessCommit}
              max={100}
              step={1}
              disabled={isUpdating}
              className="w-full"
            />
          </div>

          {/* Colour */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Colour
            </Label>

            {/* Colour presets */}
            <div className="flex flex-wrap gap-2">
              {presetColors.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleColourChange(preset.value)}
                  disabled={isUpdating}
                  className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer"
                  style={{
                    backgroundColor: preset.value,
                    borderColor:
                      colour === preset.value
                        ? "var(--primary)"
                        : "transparent",
                  }}
                  title={preset.name}
                />
              ))}
            </div>

            {/* Custom colour */}
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={colour}
                onChange={(e) => handleColourChange(e.target.value)}
                disabled={isUpdating}
                className="w-12 h-10 p-1 cursor-pointer"
              />
              <Input
                type="text"
                value={colour}
                onChange={(e) => handleColourChange(e.target.value)}
                disabled={isUpdating}
                placeholder="#FFFFFF"
                className="flex-1 font-mono text-sm"
              />
            </div>
          </div>

          {/* Preview */}
          <div
            className="h-20 rounded-lg transition-all duration-300"
            style={{
              backgroundColor: colour,
              opacity: brightness / 100,
              boxShadow: `0 0 ${brightness / 2}px ${colour}`,
            }}
          />
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
