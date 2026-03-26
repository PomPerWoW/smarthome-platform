import {
    createSystem,
    PanelUI,
    PanelDocument,
    eq,
    UIKitDocument,
    UIKit,
    Entity,
} from "@iwsdk/core";

import { DeviceComponent } from "../components/DeviceComponent";
import { deviceStore, getStore } from "../store/DeviceStore";
import { DeviceType, SmartMeter } from "../types";
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";
import { getWebSocketClient } from "../api/WebSocketClient";

export class SmartMeterPanelSystem extends createSystem({
    smartMeterPanel: {
        required: [PanelUI, PanelDocument],
        where: [eq(PanelUI, "config", "./ui/smartmeter-panel.json")],
    },
}) {
    private unsubscribeDevices?: () => void;
    private unsubscribeWs?: () => void;
    private deviceRenderer?: DeviceRendererSystem;

    // Track readings per deviceId
    private readings: Record<string, Record<string, number>> = {};

    init() {
        console.log("[SmartMeterPanel] System initialized");

        this.queries.smartMeterPanel.subscribe("qualify", (entity) => {
            this.setupPanel(entity);
        });

        // Subscribe to device state changes
        this.unsubscribeDevices = deviceStore.subscribe(
            (state) => state.devices,
            () => {
                this.updateAllPanels();
            },
        );

        // Subscribe to websocket for metrics
        this.unsubscribeWs = getWebSocketClient().subscribe((data) => {
            if (data.type === "smartmeter_update" && data.tag) {
                // Find which device this tag belongs to
                const store = getStore();
                const devices = store.devices.filter(d => d.type === DeviceType.SmartMeter);
                for (const device of devices) {
                    const deviceTag = (device as any).tag || "";
                    if (data.tag.startsWith(deviceTag) && deviceTag !== "") {
                        const suffix = data.tag.split(".").pop();
                        const deviceId = device.id;

                        if (!this.readings[deviceId]) {
                            this.readings[deviceId] = {};
                        }
                        if (suffix) {
                            // Normalize suffix (v, i, P, Q, KWH) to lowercase for easier matching, or maintain exact keys
                            this.readings[deviceId][suffix] = data.value;

                            // Find the panel entity for this device and update metrics
                            const entities = this.queries.smartMeterPanel.entities;
                            for (const entity of entities) {
                                const entityDeviceId = entity.getValue(DeviceComponent, "deviceId");
                                if (entityDeviceId === deviceId) {
                                    const document = PanelDocument.data.document[entity.index] as UIKitDocument;
                                    if (document) {
                                        this.updatePanelMetricsOnly(document, deviceId);
                                    }
                                }
                            }

                            // Notify Chart3D dashboard if gauge is active
                            if (!this.deviceRenderer) {
                                this.deviceRenderer = this.world.getSystem(DeviceRendererSystem);
                            }
                            if (this.deviceRenderer) {
                                const record = this.deviceRenderer.getRecord(deviceId);
                                if (record && record.activeChartType === "gauge" && record.chartEntity) {
                                    const updateGauge = record.chartEntity.object3D?.userData?.updateGauge;
                                    if (typeof updateGauge === "function") {
                                        updateGauge(suffix, data.value);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    private setupPanel(entity: Entity): void {
        const document = PanelDocument.data.document[entity.index] as UIKitDocument;
        if (!document) return;

        if (!this.deviceRenderer) {
            this.deviceRenderer = this.world.getSystem(DeviceRendererSystem);
        }

        const deviceId = entity.getValue(DeviceComponent, "deviceId");
        if (!deviceId) return;

        // Power button
        const powerBtn = document.getElementById("power-btn");
        if (powerBtn) {
            powerBtn.addEventListener("click", () => {
                this.handlePowerToggle(deviceId);
            });
        }

        // 3D Gauge button
        const showGaugeBtn = document.getElementById("show-gauge-btn");
        if (showGaugeBtn) {
            showGaugeBtn.addEventListener("click", () => {
                this.handleShowGauge(deviceId);
            });
        }

        this.updatePanel(entity, deviceId, document);
    }

    private handleShowGauge(deviceId: string): void {
        console.log(`[SmartMeterPanel] Show gauge clicked for ${deviceId}`);
        const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
        if (deviceRenderer) {
            deviceRenderer.showChart(deviceId, "gauge" as any);
        }
    }

    private handlePowerToggle(deviceId: string): void {
        const store = getStore();
        const device = store.getDeviceById(deviceId);
        if (!device || device.type !== DeviceType.SmartMeter) return;
        store.toggleDevice(deviceId);
    }

    private updateAllPanels(): void {
        const entities = this.queries.smartMeterPanel.entities;
        for (const entity of entities) {
            const deviceId = entity.getValue(DeviceComponent, "deviceId");
            if (!deviceId) continue;

            const document = PanelDocument.data.document[
                entity.index
            ] as UIKitDocument;
            if (!document) continue;

            this.updatePanel(entity, deviceId, document);
        }
    }

    private updatePanelMetricsOnly(document: UIKitDocument, deviceId: string): void {
        const readings = this.readings[deviceId] || {};

        const getVal = (keyBase: string) => {
            return readings[keyBase] ?? readings[keyBase.toUpperCase()] ?? readings[keyBase.toLowerCase()];
        };

        // Metric config: [key, max, unit, fillId, valueId]
        type MetricCfg = { key: string; max: number; unit: string; fillId: string; valueId: string };
        const metrics: MetricCfg[] = [
            { key: 'v', max: 250, unit: '', fillId: 'fill-v', valueId: 'metric-v' },
            { key: 'i', max: 50, unit: '', fillId: 'fill-i', valueId: 'metric-i' },
            { key: 'P', max: 10, unit: '', fillId: 'fill-P', valueId: 'metric-P' },
            { key: 'KWH', max: 9999, unit: '', fillId: 'fill-KWH', valueId: 'metric-KWH' },
        ];

        for (const cfg of metrics) {
            const val = getVal(cfg.key);
            if (val === undefined) continue;

            const pct = Math.max(0, Math.min(100, (Number(val) / cfg.max) * 100));
            const pctStr = `${pct.toFixed(1)}%` as `${number}%`;

            const fillEl = document.getElementById(cfg.fillId) as UIKit.Container;
            if (fillEl) fillEl.setProperties({ width: pctStr });

            const valueEl = document.getElementById(cfg.valueId) as UIKit.Text;
            if (valueEl) valueEl.setProperties({ text: Number(val).toFixed(2) });
        }
    }

    private updatePanel(
        entity: Entity,
        deviceId: string,
        document: UIKitDocument,
    ): void {
        const store = getStore();
        const device = store.getDeviceById(deviceId);

        const deviceName = document.getElementById("device-name") as UIKit.Text;
        const deviceLocation = document.getElementById(
            "device-location",
        ) as UIKit.Text;

        if (device) {
            deviceName?.setProperties({ text: device.name });
            deviceLocation?.setProperties({
                text: `${device.room_name} - ${device.floor_name}`,
            });
        }

        const powerBtn = document.getElementById("power-btn") as UIKit.Container;
        if (powerBtn) {
            powerBtn.setProperties({
                backgroundColor: device?.is_on ? "#22c55e" : "#27272a",
            });
        }

        const statusDot = document.getElementById("status-dot") as UIKit.Container;
        const statusText = document.getElementById("status-text") as UIKit.Text;
        if (statusDot && statusText && device) {
            statusDot.setProperties({
                backgroundColor: device.is_on ? "#22c55e" : "#71717a",
            });
            statusText.setProperties({ text: device.is_on ? "On" : "Off" });
        }

        // Also update metrics if we have them cached
        this.updatePanelMetricsOnly(document, deviceId);
    }

    destroy(): void {
        this.unsubscribeDevices?.();
        this.unsubscribeWs?.();
    }
}
