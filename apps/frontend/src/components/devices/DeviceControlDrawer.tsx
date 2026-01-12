import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  BaseDevice,
  Lightbulb,
  Television,
  Fan,
  AirConditioner,
} from "@/models";
import { DeviceType } from "@/types/device.types";
import { LightbulbControl } from "./LightbulbControl";
import { TelevisionControl } from "./TelevisionControl";
import { FanControl } from "./FanControl";
import { AirConditionerControl } from "./AirConditionerControl";

interface DeviceControlDrawerProps {
  device: BaseDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

export function DeviceControlDrawer({
  device,
  open,
  onOpenChange,
  onUpdate,
}: DeviceControlDrawerProps) {
  if (!device) return null;

  const renderControl = () => {
    switch (device.type) {
      case DeviceType.Lightbulb:
        return (
          <LightbulbControl device={device as Lightbulb} onUpdate={onUpdate} />
        );
      case DeviceType.Television:
        return (
          <TelevisionControl
            device={device as Television}
            onUpdate={onUpdate}
          />
        );
      case DeviceType.Fan:
        return <FanControl device={device as Fan} onUpdate={onUpdate} />;
      case DeviceType.AirConditioner:
        return (
          <AirConditionerControl
            device={device as AirConditioner}
            onUpdate={onUpdate}
          />
        );
      default:
        return <div className="p-4">Unknown device type</div>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Device Control</SheetTitle>
          <SheetDescription>Adjust settings for {device.name}</SheetDescription>
        </SheetHeader>
        {renderControl()}
      </SheetContent>
    </Sheet>
  );
}
