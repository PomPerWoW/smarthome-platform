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

        this.updatePanel(entity, deviceId, document);
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

        // Use case-insensitive matching for the metric suffix keys if needed, 
        // though typically they remain exactly as sent by backend ('v', 'i', 'P', 'Q', 'KWH')
        const getVal = (keyBase: string) => {
            // Try exact match, then upper, then lower
            return readings[keyBase] ?? readings[keyBase.toUpperCase()] ?? readings[keyBase.toLowerCase()];
        };

        const vText = document.getElementById("metric-v") as UIKit.Text;
        const vVal = getVal('v');
        if (vText && vVal !== undefined) vText.setProperties({ text: `${Number(vVal).toFixed(2)} V` });

        const iText = document.getElementById("metric-i") as UIKit.Text;
        const iVal = getVal('i');
        if (iText && iVal !== undefined) iText.setProperties({ text: `${Number(iVal).toFixed(2)} A` });

        const pText = document.getElementById("metric-P") as UIKit.Text;
        const pVal = getVal('P');
        if (pText && pVal !== undefined) pText.setProperties({ text: `${Number(pVal).toFixed(2)} kW` });

        const qText = document.getElementById("metric-Q") as UIKit.Text;
        const qVal = getVal('Q');
        if (qText && qVal !== undefined) qText.setProperties({ text: `${Number(qVal).toFixed(2)} kVAR` });

        const kwhText = document.getElementById("metric-KWH") as UIKit.Text;
        const kwhVal = getVal('KWH');
        if (kwhText && kwhVal !== undefined) kwhText.setProperties({ text: `${Number(kwhVal).toFixed(2)} kWh` });

        const sText = document.getElementById("metric-S") as UIKit.Text;
        const sVal = getVal('S');
        if (sText && sVal !== undefined) sText.setProperties({ text: `${Number(sVal).toFixed(2)} kVA` });

        const pfText = document.getElementById("metric-PF") as UIKit.Text;
        const pfVal = getVal('PF');
        if (pfText && pfVal !== undefined) pfText.setProperties({ text: `${Number(pfVal).toFixed(2)}` });

        const kvarhText = document.getElementById("metric-KVARH") as UIKit.Text;
        const kvarhVal = getVal('KVARH');
        if (kvarhText && kvarhVal !== undefined) kvarhText.setProperties({ text: `${Number(kvarhVal).toFixed(2)} kVARh` });
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
