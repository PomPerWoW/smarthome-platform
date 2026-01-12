import { useState, useEffect } from "react";
import {
  Tv,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
  Hash,
  Power,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Television } from "@/models";
import { DeviceService } from "@/services/DeviceService";
import { toast } from "sonner";

interface TelevisionControlProps {
  device: Television;
  onUpdate?: () => void;
}

export function TelevisionControl({
  device,
  onUpdate,
}: TelevisionControlProps) {
  const [isOn, setIsOn] = useState(device.is_on);
  const [volume, setVolume] = useState(device.volume);
  const [channel, setChannel] = useState(device.channel);
  const [isMute, setIsMute] = useState(device.isMute);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sync state
  useEffect(() => {
    setIsOn(device.is_on);
    setVolume(device.volume);
    setChannel(device.channel);
    setIsMute(device.isMute);
  }, [device]);

  const handlePowerToggle = async () => {
    const newIsOn = !isOn;
    setIsOn(newIsOn);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().togglePower(device.id, newIsOn);
      toast.success(newIsOn ? "TV turned on" : "TV turned off");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to toggle power");
      setIsOn(!newIsOn);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    setVolume(value[0]);
  };

  const handleVolumeCommit = async () => {
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setVolume(device.id, volume);
      toast.success("Volume updated");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update volume");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChannelChange = async (newChannel: number) => {
    if (newChannel < 1) return;
    setChannel(newChannel);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setChannel(device.id, newChannel);
      toast.success("Channel updated");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update channel");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleMuteToggle = async (muted: boolean) => {
    setIsMute(muted);
    setIsUpdating(true);
    try {
      await DeviceService.getInstance().setMute(device.id, muted);
      toast.success(muted ? "Muted" : "Unmuted");
      onUpdate?.();
    } catch (err) {
      toast.error("Failed to update mute");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header with Power Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Tv className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold">{device.name}</h3>
            <p className="text-sm text-muted-foreground">Smart TV</p>
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
          {/* Volume */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                {isMute ? (
                  <VolumeX className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                Volume
              </Label>
              <span className="text-sm font-medium">{volume}%</span>
            </div>
            <Slider
              value={[volume]}
              onValueChange={handleVolumeChange}
              onValueCommit={handleVolumeCommit}
              max={100}
              step={1}
              disabled={isUpdating || isMute}
              className="w-full"
            />
          </div>

          {/* Mute toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="mute" className="flex items-center gap-2">
              <VolumeX className="w-4 h-4" />
              Mute
            </Label>
            <Switch
              id="mute"
              checked={isMute}
              onCheckedChange={handleMuteToggle}
              disabled={isUpdating}
            />
          </div>

          {/* Channel */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Channel
            </Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleChannelChange(channel - 1)}
                disabled={isUpdating || channel <= 1}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                value={channel}
                onChange={(e) =>
                  handleChannelChange(parseInt(e.target.value) || 1)
                }
                disabled={isUpdating}
                min={1}
                className="text-center w-20"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleChannelChange(channel + 1)}
                disabled={isUpdating}
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Quick channel buttons */}
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
              <Button
                key={num}
                variant="outline"
                size="sm"
                onClick={() => handleChannelChange(num || 10)}
                disabled={isUpdating}
                className="font-mono"
              >
                {num}
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
