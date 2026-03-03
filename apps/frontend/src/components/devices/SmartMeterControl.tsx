import { useState, useEffect } from "react";
import { Activity, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SmartMeter } from "@/models";
import { DeviceService } from "@/services/DeviceService";
import { WebSocketService } from "@/services/WebSocketService";
import { toast } from "sonner";

const METRICS_CONFIG: Record<string, { label: string; unit: string; min: number; max: number; color: string }> = {
    v: { label: "Voltage", unit: "Volt", min: 0, max: 250, color: "#3b82f6" },
    i: { label: "Current", unit: "Ampere", min: 0, max: 50, color: "#ef4444" },
    P: { label: "Active Power", unit: "kW", min: 0, max: 10, color: "#22c55e" },
    Q: { label: "Reactive Power", unit: "kVAR", min: 0, max: 10, color: "#f97316" },
    S: { label: "Apparent Power", unit: "kVA", min: 0, max: 10, color: "#a855f7" },
    PF: { label: "Power Factor", unit: "", min: 0, max: 1, color: "#06b6d4" },
    KWH: { label: "Active Energy", unit: "kWh", min: 0, max: 9999, color: "#eab308" },
    KVARH: { label: "Reactive Energy", unit: "kVARh", min: 0, max: 9999, color: "#ec4899" },
};

function AnalogGauge({ value, configKey }: { value?: number, configKey: string }) {
    const config = METRICS_CONFIG[configKey] || { label: configKey, unit: "", min: 0, max: 100, color: "#888" };
    const { label, unit, min, max, color } = config;

    // Calculate percentage (clamped between 0 and 100)
    const safeValue = value ?? 0;
    const percentage = Math.max(0, Math.min(100, ((safeValue - min) / (max - min)) * 100));

    // Half circle SVG variables
    const radius = 40;
    const circumference = Math.PI * radius;
    // Stroke offset goes backwards (from circumference to 0) to fill the bar.
    // If value is missing, keep it empty.
    const dashoffset = value !== undefined ? circumference - (percentage / 100) * circumference : circumference;

    return (
        <div className="flex flex-col items-center justify-start p-3 bg-background/40 border rounded-xl shadow-sm relative overflow-hidden group">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2 text-center flex items-end justify-center">
                {label}
            </h4>
            <div className="flex flex-col items-center justify-start w-full relative z-10 pt-1">
                <svg className="w-[110px] h-[60px] drop-shadow-sm transition-transform group-hover:scale-105 mb-1" viewBox="0 0 100 60">
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke="currentColor"
                        className="text-muted/20"
                        strokeWidth="9"
                        strokeLinecap="round"
                    />
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke={color}
                        strokeWidth="9"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={dashoffset}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                <div className="flex flex-col items-center leading-none mt-[-10px]">
                    <span className="text-xl font-mono font-bold tracking-tight">
                        {value !== undefined ? Number(value).toFixed(2) : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-semibold mt-1">{unit}</span>
                </div>
            </div>
            {/* Soft background glow based on metric color */}
            <div
                className="absolute inset-0 opacity-5 blur-2xl rounded-full pointer-events-none"
                style={{ backgroundColor: color }}
            />
        </div>
    );
}

interface SmartMeterControlProps {
    device: SmartMeter;
    onUpdate?: () => void;
}

export function SmartMeterControl({ device, onUpdate }: SmartMeterControlProps) {
    const [isOn, setIsOn] = useState(device.is_on);
    const [isUpdating, setIsUpdating] = useState(false);

    const [readings, setReadings] = useState<Record<string, { value: number; timestamp: string }>>({});

    useEffect(() => {
        setIsOn(device.is_on);
    }, [device]);

    useEffect(() => {
        if (!isOn) return;

        const ws = WebSocketService.getInstance();
        const unsubscribe = ws.subscribe((data) => {
            if (data.type === "smartmeter_update" && data.tag) {
                // Determine if this tag belongs to this device
                // The backend sends tag like: "smartmeter-raspi.meter-1phase-01.v"
                if (data.tag.startsWith(device.tag || "")) {
                    const suffix = data.tag.split(".").pop();
                    if (suffix) {
                        setReadings(prev => ({
                            ...prev,
                            [suffix]: { value: data.value, timestamp: data.timestamp }
                        }));
                    }
                }
            }
        });

        return () => {
            unsubscribe();
        };
    }, [isOn, device.tag]);

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
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        {['v', 'i', 'P', 'Q', 'S', 'PF', 'KWH', 'KVARH'].map(suffix => (
                            <AnalogGauge
                                key={suffix}
                                configKey={suffix}
                                value={readings[suffix]?.value}
                            />
                        ))}
                    </div>
                    {Object.keys(readings).length === 0 && (
                        <p className="text-center text-xs text-muted-foreground mt-2 animate-pulse">
                            Waiting for SCADA updates...
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
