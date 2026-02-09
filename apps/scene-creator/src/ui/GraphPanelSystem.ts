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
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";
import { ChartType } from "../components/Chart3D";
import { DeviceType } from "../types";

export class GraphPanelSystem extends createSystem({
    graphPanel: {
        required: [PanelUI, PanelDocument],
        where: [eq(PanelUI, "config", "./ui/graph-panel.json")],
    },
}) {
    private setupPanels = new Set<Entity>();

    init() {
        console.log("[GraphPanel] System initialized");

        this.queries.graphPanel.subscribe("qualify", (entity) => {
            this.setupPanel(entity);
        });
    }

    private setupPanel(entity: Entity): void {
        // Prevent duplicate setup
        if (this.setupPanels.has(entity)) return;
        this.setupPanels.add(entity);

        // Wait for document to be ready
        setTimeout(() => {
            const document = PanelDocument.data.document[
                entity.index
            ] as UIKitDocument;
            if (!document) {
                console.warn("[GraphPanel] Document not ready, retrying...");
                this.setupPanels.delete(entity);
                setTimeout(() => this.setupPanel(entity), 100);
                return;
            }

            // Get the device ID associated with this panel
            const deviceId = entity.getValue(DeviceComponent, "deviceId");
            if (!deviceId) {
                console.warn("[GraphPanel] No device ID found for panel");
                return;
            }


            const deviceType = entity.getValue(DeviceComponent, "deviceType") as DeviceType;

            console.log(`[GraphPanel] Setting up panel for device ${deviceId} (${deviceType})`);

            // Set up button listeners
            this.setupChartButtons(document, deviceId, deviceType);
        }, 50);
    }

    private setupChartButtons(
        document: UIKitDocument,
        deviceId: string,
        deviceType: DeviceType
    ): void {
        const barBtn = document.getElementById("graph-bar-btn");
        const lineBtn = document.getElementById("graph-line-btn");
        const pieBtn = document.getElementById("graph-pie-btn");

        console.log(`[GraphPanel] setupChartButtons: barBtn=${!!barBtn}, lineBtn=${!!lineBtn}, pieBtn=${!!pieBtn}`);

        const barText = document.getElementById("graph-bar-text") as UIKit.Text;
        const lineText = document.getElementById("graph-line-text") as UIKit.Text;
        const pieText = document.getElementById("graph-pie-text") as UIKit.Text;

        if (barText) barText.setProperties({ text: this.getChartLabel(deviceType, "bar") });
        if (lineText) lineText.setProperties({ text: this.getChartLabel(deviceType, "line") });
        if (pieText) pieText.setProperties({ text: this.getChartLabel(deviceType, "pie") });

        if (barBtn) {
            console.log(`[GraphPanel] Adding click listener to barBtn for device ${deviceId}`);
            barBtn.addEventListener("click", () => {
                console.log(`[GraphPanel] Bar button clicked for ${deviceId}`);
                this.handleChartSelection(deviceId, "bar");
            });
        }

        if (lineBtn) {
            console.log(`[GraphPanel] Adding click listener to lineBtn for device ${deviceId}`);
            lineBtn.addEventListener("click", () => {
                console.log(`[GraphPanel] Line button clicked for ${deviceId}`);
                this.handleChartSelection(deviceId, "line");
            });
        }

        if (pieBtn) {
            console.log(`[GraphPanel] Adding click listener to pieBtn for device ${deviceId}`);
            pieBtn.addEventListener("click", () => {
                console.log(`[GraphPanel] Pie button clicked for ${deviceId}`);
                this.handleChartSelection(deviceId, "pie");
            });
        }

        console.log(`[GraphPanel] Button listeners set up for ${deviceId}`);
    }

    private handleChartSelection(deviceId: string, chartType: ChartType): void {
        console.log(`[GraphPanel] Chart selected: ${chartType} for ${deviceId}`);

        const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
        if (deviceRenderer) {
            deviceRenderer.showChart(deviceId, chartType);
        }
    }

    destroy(): void {
        this.setupPanels.clear();
        console.log("[GraphPanel] System destroyed");
    }
    private getChartLabel(deviceType: DeviceType, chartType: ChartType): string {
        switch (deviceType) {
            case DeviceType.Lightbulb:
                if (chartType === "bar") return "Hours On/Off";
                if (chartType === "line") return "Brightness";
                if (chartType === "pie") return "Color Usage";
                break;
            case DeviceType.AirConditioner:
                if (chartType === "bar") return "Hours On/Off";
                if (chartType === "line") return "Temperature";
                if (chartType === "pie") return "No Data";
                break;
            case DeviceType.Fan:
                if (chartType === "bar") return "Swing Usage";
                if (chartType === "line") return "Speed";
                if (chartType === "pie") return "No Data";
                break;
            case DeviceType.Television:
                if (chartType === "bar") return "Channel Usage";
                if (chartType === "line") return "Status";
                if (chartType === "pie") return "Volume Levels";
                break;
        }
        return chartType;
    }
}
