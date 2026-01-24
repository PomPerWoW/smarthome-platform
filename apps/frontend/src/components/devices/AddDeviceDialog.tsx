import { useState } from "react";
import { Lightbulb, Tv, Fan, Snowflake, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeviceType } from "@/types/device.types";
import { DeviceService } from "@/services/DeviceService";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  onSuccess?: () => void;
}

const deviceTypes = [
  {
    type: DeviceType.Lightbulb,
    label: "Lightbulb",
    icon: Lightbulb,
    color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30",
  },
  {
    type: DeviceType.Television,
    label: "Television",
    icon: Tv,
    color: "bg-blue-500/20 text-blue-500 border-blue-500/30",
  },
  {
    type: DeviceType.Fan,
    label: "Fan",
    icon: Fan,
    color: "bg-cyan-500/20 text-cyan-500 border-cyan-500/30",
  },
  {
    type: DeviceType.AirConditioner,
    label: "Air Conditioner",
    icon: Snowflake,
    color: "bg-sky-500/20 text-sky-500 border-sky-500/30",
  },
];

export function AddDeviceDialog({
  open,
  onOpenChange,
  roomId,
  onSuccess,
}: AddDeviceDialogProps) {
  const [selectedType, setSelectedType] = useState<DeviceType | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!selectedType || !deviceName.trim()) return;

    setIsCreating(true);
    try {
      const service = DeviceService.getInstance();
      const data = { device_name: deviceName.trim(), room: roomId };

      switch (selectedType) {
        case DeviceType.Lightbulb:
          await service.createLightbulb(data);
          break;
        case DeviceType.Television:
          await service.createTelevision(data);
          break;
        case DeviceType.Fan:
          await service.createFan(data);
          break;
        case DeviceType.AirConditioner:
          await service.createAirConditioner(data);
          break;
      }

      toast.success("Device created successfully");
      onSuccess?.();
      handleClose();
    } catch (err) {
      toast.error(`Failed to create device: ${(err as Error).message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSelectedType(null);
    setDeviceName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Device</DialogTitle>
          <DialogDescription>
            Select a device type and give it a name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Device type selection */}
          <div className="space-y-2">
            <Label>Device Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {deviceTypes.map(({ type, label, icon: Icon, color }) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border-2 transition-all",
                    color,
                    selectedType === type
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent hover:border-muted-foreground/30",
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Device name */}
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              placeholder="e.g., Living Room Light"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!selectedType || !deviceName.trim() || isCreating}
          >
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Device
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
