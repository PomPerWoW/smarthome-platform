import {
    createSystem,
    PanelUI,
    PanelDocument,
    eq,
    UIKitDocument,
    Entity,
} from "@iwsdk/core";

import { DeviceComponent } from "../components/DeviceComponent";
import { DeviceRendererSystem } from "../systems/DeviceRendererSystem";
import { ChartType } from "../components/Chart3D";

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

            console.log(`[GraphPanel] Setting up panel for device ${deviceId}`);

            // Set up button listeners
            this.setupChartButtons(document, deviceId);
        }, 50);
    }

    private setupChartButtons(document: UIKitDocument, deviceId: string): void {
        const barBtn = document.getElementById("graph-bar-btn");
        const lineBtn = document.getElementById("graph-line-btn");
        const pieBtn = document.getElementById("graph-pie-btn");

        if (barBtn) {
            barBtn.addEventListener("click", () => {
                this.handleChartSelection(deviceId, "bar");
            });
        }

        if (lineBtn) {
            lineBtn.addEventListener("click", () => {
                this.handleChartSelection(deviceId, "line");
            });
        }

        if (pieBtn) {
            pieBtn.addEventListener("click", () => {
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
}
