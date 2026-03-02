import { useState, useEffect } from "react";
import { Activity, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SmartMeter } from "@/models";
import { DeviceService } from "@/services/DeviceService";
import { toast } from "sonner";

interface SmartMeterControlProps {
    device: SmartMeter;
    onUpdate?: () => void;
}

export function SmartMeterControl({ device, onUpdate }: SmartMeterControlProps) {
    const [isOn, setIsOn] = useState(device.is_on);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        setIsOn(device.is_on);
    }, [device]);

    const handlePowerToggle = async () => {
        const newIsOn = !isOn;
        setIsOn(newIsOn);
        setIsUpdating(true);
        try {
            await DeviceService.getInstance().togglePower(device.id, newIsOn);
            toast.success(newIsOn ? "Smart Meter connection started" : "Smart Meter connection stopped");
            onUpdate?.();
        } catch (err) {
            toast.error("Failed to toggle Smart Meter connection");
            setIsOn(!newIsOn);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="space-y-6 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-500/20 text-blue-500">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-semibold">{device.name}</h3>
                        <p className="text-sm text-muted-foreground">Smart Meter Feed</p>
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

            {!isOn && (
                <div className="text-center py-8 text-muted-foreground">
                    <p>Stream disconnected</p>
                    <p className="text-sm">Turn on to initiate WebSocket data stream</p>
                </div>
            )}
            {isOn && (
                <div className="text-center py-8 text-muted-foreground">
                    <p>Stream connected: processing data...</p>
                    <p className="text-sm">Check data tabs or streams for live feed</p>
                </div>
            )}
        </div>
    );
}
