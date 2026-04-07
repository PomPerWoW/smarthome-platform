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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Television } from "@/models";
import { DeviceService } from "@/services/DeviceService";
import { WebSocketService } from "@/services/WebSocketService";
import { toast } from "sonner";
import { useNotificationStore } from "@/stores/notification_store";
import { DeviceControlHeader } from "./DeviceControlHeader";

interface TelevisionControlProps {
  device: Television;
  onUpdate?: () => void;
}

export function TelevisionControl({
  device,
  onUpdate,
}: TelevisionControlProps) {
  const [isOn, setIsOn] = useState(device.is_on);
  const [channel, setChannel] = useState(device.channel);
  const [isMute, setIsMute] = useState(device.isMute);
  const [isUpdating, setIsUpdating] = useState(false);
  const addNotification = useNotificationStore((s) => s.addNotification);

  // Sync state when device prop changes
  useEffect(() => {
    setIsOn(device.is_on);
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
      addNotification({
        category: "device",
        iconType: newIsOn ? "power_on" : "power_off",
        title: newIsOn ? "TV turned on" : "TV turned off",
        description: `'${device.name}' is now ${newIsOn ? "on" : "off"}`,
        severity: newIsOn ? "success" : "info",
        deviceType: "Television",
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

  const handleVolumeAdjust = async (direction: number) => {
    setIsUpdating(true);
    try {
      WebSocketService.getInstance().sendMessage({
        action: "tv_volume",
        device_id: device.id,
        value: direction
      });
      toast.success(direction === 1 ? "Volume up command sent" : "Volume down command sent");
      addNotification({
        category: "device",
        iconType: "volume",
        title: "Volume adjusted",
        description: `'${device.name}' volume was ${direction === 1 ? "increased" : "decreased"}`,
        severity: "info",
        deviceType: "Television",
        deviceName: device.name,
      });
      onUpdate?.();
    } catch {
      toast.error("Failed to adjust volume");
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
      addNotification({
        category: "device",
        iconType: "channel",
        title: "Channel changed",
        description: `'${device.name}' switched to channel ${newChannel}`,
        severity: "info",
        deviceType: "Television",
        deviceName: device.name,
        numericValue: newChannel,
        unit: " ch",
      });
      onUpdate?.();
    } catch {
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
      addNotification({
        category: "device",
        iconType: muted ? "mute" : "unmute",
        title: muted ? "TV muted" : "TV unmuted",
        description: `'${device.name}' ${muted ? "audio is now muted" : "audio has been restored"}`,
        severity: "info",
        deviceType: "Television",
        deviceName: device.name,
      });
      onUpdate?.();
    } catch {
      toast.error("Failed to update mute");
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      {/* Header with Power Button */}
      <DeviceControlHeader
        device={device}
        displayLabel="Smart TV"
        icon={Tv}
        iconColorClass="text-blue-500"
        iconBgColorClass="bg-blue-500/20"
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
            </div>

            <div className="flex gap-4">
              <Button
                variant="outline"
                className="flex-1 text-lg font-bold"
                onClick={() => handleVolumeAdjust(0)}
                disabled={isUpdating || isMute}
              >
                -
              </Button>
              <Button
                variant="outline"
                className="flex-1 text-lg font-bold"
                onClick={() => handleVolumeAdjust(1)}
                disabled={isUpdating || isMute}
              >
                +
              </Button>
            </div>
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
