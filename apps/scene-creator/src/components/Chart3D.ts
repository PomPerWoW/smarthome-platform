import * as d3 from "d3";
import {
    Object3D,
    Mesh,
    MeshStandardMaterial,
    BoxGeometry,
    CylinderGeometry,
    SphereGeometry,
    Color,
    Group,
    LineBasicMaterial,
    Line,
    Vector3,
    CatmullRomCurve3,
    TubeGeometry,
    DoubleSide,
    PlaneGeometry,
    MeshBasicMaterial,
    CurvePath,
    LineCurve3,
} from "@iwsdk/core";
import {
    CanvasTexture,
    SpriteMaterial,
    Sprite,
    BufferGeometry,
    Vector3 as ThreeVector3,
} from "three";
import { DeviceType } from "../types";
import {
    MOCK_LIGHTBULB_DEVICE_LOGS,
    MOCK_AC_DEVICE_LOGS,
    MOCK_FAN_DEVICE_LOGS,
    MOCK_TV_DEVICE_LOGS,
} from "../data/mockData";

export type ChartType = "bar" | "line" | "pie";

const COLORS = {
    blue: "#3b82f6",
    green: "#22c55e",
    orange: "#f97316",
    purple: "#a855f7",
    red: "#ef4444",
    yellow: "#eab308",
    cyan: "#06b6d4",
    grid: "#3f3f46",
    text: "#ffffff",
};

export class Chart3D {
    private chartScale = 0.15;

    createChart(type: ChartType, deviceType: DeviceType): Object3D {
        const container = new Group();

        switch (deviceType) {
            case DeviceType.Lightbulb:
                this.createLightbulbChart(container, type);
                break;
            case DeviceType.AirConditioner:
                this.createACChart(container, type);
                break;
            case DeviceType.Fan:
                this.createFanChart(container, type);
                break;
            case DeviceType.Television:
                this.createTVChart(container, type);
                break;
            default:
                this.createEmptyChart(container, "Unknown Device");
        }

        if (type === "pie") {
            container.rotation.x = Math.PI / 4;
        }

        container.scale.setScalar(this.chartScale);
        return container;
    }

    private createLightbulbChart(container: Group, type: ChartType) {
        // Lightbulb Data: 1 hour intervals or raw logs. MOCK data has 5-min intervals.
        // We'll take last 288 points (approx 24 hours).
        const logs = MOCK_LIGHTBULB_DEVICE_LOGS.data.slice(0, 288).reverse();

        if (type === "line") {
            // Line: Brightness (0 if off)
            const values = logs.map(l => (l.onoff && l.brightness ? l.brightness : 0));
            // Custom labels for 00.00, 06.00, 12.00, 18.00, 24.00
            const axisLabels = ["00.00", "06.00", "12.00", "18.00", "24.00"];
            this.createLineChart(container, values, [], "Brightness", COLORS.blue, 100, false, axisLabels);
        } else if (type === "bar") {
            // Bar: On vs Off count (using full dataset for better stats)
            const allLogs = MOCK_LIGHTBULB_DEVICE_LOGS.data;
            const onCount = allLogs.filter(l => l.onoff).length;
            const offCount = allLogs.filter(l => !l.onoff).length;
            this.createBarChartSimple(container, [onCount, offCount], ["On", "Off"], [COLORS.green, COLORS.red], "Hours On/Off");
        } else if (type === "pie") {
            // Pie: Time spent on each color
            const allLogs = MOCK_LIGHTBULB_DEVICE_LOGS.data;
            const colorMap = new Map<string, number>();
            allLogs.forEach(l => {
                if (l.onoff && l.color) {
                    colorMap.set(l.color, (colorMap.get(l.color) || 0) + 1);
                }
            });
            this.createPieChartFromMap(container, colorMap, "Color Usage");
        }
    }

    private createACChart(container: Group, type: ChartType) {
        const logs = MOCK_AC_DEVICE_LOGS.data.slice(0, 288).reverse();

        if (type === "line") {
            // Line: Temp (0 if off)
            const values = logs.map(l => (l.onoff && l.temperature ? l.temperature : 0));
            const axisLabels = ["00.00", "06.00", "12.00", "18.00", "24.00"];
            this.createLineChart(container, values, [], "Temperature (°C)", COLORS.cyan, 30, false, axisLabels);
        } else if (type === "bar") {
            // Bar: On vs Off
            const allLogs = MOCK_AC_DEVICE_LOGS.data;
            const onCount = allLogs.filter(l => l.onoff).length;
            const offCount = allLogs.filter(l => !l.onoff).length;
            this.createBarChartSimple(container, [onCount, offCount], ["On", "Off"], [COLORS.green, COLORS.red], "Hours On/Off");
        } else if (type === "pie") {
            this.createEmptyChart(container, "No Pie Chart for AC");
        }
    }

    private createFanChart(container: Group, type: ChartType) {
        const logs = MOCK_FAN_DEVICE_LOGS.data.slice(0, 288).reverse();

        if (type === "line") {
            // Line: Speed (0 if off)
            const values = logs.map(l => (l.onoff && l.speed ? l.speed : 0));
            const axisLabels = ["00.00", "06.00", "12.00", "18.00", "24.00"];
            this.createLineChart(container, values, [], "Speed", COLORS.green, 5, false, axisLabels);
        } else if (type === "bar") {
            // Bar: Swing vs No Swing
            const allLogs = MOCK_FAN_DEVICE_LOGS.data;
            const swingCount = allLogs.filter(l => l.onoff && l.swing).length;
            const noSwingCount = allLogs.filter(l => l.onoff && !l.swing).length;
            this.createBarChartSimple(container, [swingCount, noSwingCount], ["Swing", "Fixed"], [COLORS.purple, COLORS.blue], "Swing Usage");
        } else if (type === "pie") {
            this.createEmptyChart(container, "No Pie Chart for Fan");
        }
    }

    private createTVChart(container: Group, type: ChartType) {
        const logs = MOCK_TV_DEVICE_LOGS.data.slice(0, 288).reverse();

        if (type === "line") {
            // Line: On/Off (0 or 1)
            const values = logs.map(l => (l.onoff ? 1 : 0));
            const axisLabels = ["00.00", "06.00", "12.00", "18.00", "24.00"];
            this.createLineChart(container, values, [], "Status", COLORS.purple, 1.2, false, axisLabels);
        } else if (type === "bar") {
            // Bar: Time spent on each channel
            const allLogs = MOCK_TV_DEVICE_LOGS.data;
            const channelMap = new Map<number, number>();
            allLogs.forEach(l => {
                if (l.onoff && l.channel) {
                    channelMap.set(l.channel, (channelMap.get(l.channel) || 0) + 1);
                }
            });
            // Convert to arrays, sort by channel
            const sorted = Array.from(channelMap.entries()).sort((a, b) => a[0] - b[0]);
            const labels = sorted.map(s => `Ch ${s[0]}`);
            const values = sorted.map(s => s[1]);
            // Limit to top 5 or so if too many
            const limit = 8;
            this.createBarChartSimple(container, values.slice(0, limit), labels.slice(0, limit), [COLORS.blue], "Channel Usage");
        } else if (type === "pie") {
            // Pie: Volume categories 0-25, 26-50, 51-75, 76-100
            const allLogs = MOCK_TV_DEVICE_LOGS.data;
            const ranges = [0, 0, 0, 0]; // 0-25, 26-50, 51-75, 76+
            allLogs.forEach(l => {
                if (l.onoff && l.volume !== null) {
                    if (l.volume <= 25) ranges[0]++;
                    else if (l.volume <= 50) ranges[1]++;
                    else if (l.volume <= 75) ranges[2]++;
                    else ranges[3]++;
                }
            });
            const map = new Map<string, number>();
            if (ranges[0] > 0) map.set("0-25", ranges[0]);
            if (ranges[1] > 0) map.set("26-50", ranges[1]);
            if (ranges[2] > 0) map.set("51-75", ranges[2]);
            if (ranges[3] > 0) map.set("76-100", ranges[3]);

            this.createPieChartFromMap(container, map, "Volume Levels");
        }
    }

    // --- Chart Primitives ---

    private createLineChart(
        container: Group,
        values: number[],
        labels: string[],
        title: string,
        color: string,
        maxY?: number,
        showPoints: boolean = true,
        axisLabels?: string[]
    ) {
        const maxValue = maxY || Math.max(...values, 1);
        const width = 3;
        const height = 1.5;

        // X Scale: map index to range [-width/2, width / 2]
        const xScale = d3.scaleLinear()
            .domain([0, Math.max(values.length - 1, 1)])
            .range([-width / 2, width / 2]);

        // Y Scale: map value to range [0, height]
        const yScale = d3.scaleLinear()
            .domain([0, maxValue])
            .range([0, height]);

        const points: Vector3[] = values.map((v, i) => {
            return new Vector3(xScale(i), yScale(v), 0);
        });

        if (points.length < 2) return;

        // Use CurvePath with LineCurve3 for straight segments to avoid overshooting
        const curvePath = new CurvePath<Vector3>();
        for (let i = 0; i < points.length - 1; i++) {
            curvePath.add(new LineCurve3(points[i], points[i + 1]));
        }

        const tubeGeo = new TubeGeometry(curvePath, points.length * 10, 0.02, 8, false);
        const tubeMat = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
        container.add(new Mesh(tubeGeo, tubeMat));

        // Points
        if (showPoints) {
            values.forEach((v, i) => {
                const p = points[i];
                const sphere = new Mesh(new SphereGeometry(0.04, 8, 8), new MeshStandardMaterial({ color }));
                sphere.position.copy(p);
                container.add(sphere);

                // Label every 4th point if no custom axis labels
                if (!axisLabels && i % 4 === 0 && labels[i]) {
                    this.addLabel(container, labels[i], p.x, -0.2, 0.15);
                }
            });
        }

        // Custom Axis Labels
        if (axisLabels) {
            axisLabels.forEach((label, i) => {
                // Distribute evenly based on chart width range
                const progress = i / (axisLabels.length - 1);
                // Map progress to data index domain
                const dataIndex = progress * (values.length - 1);
                const x = xScale(dataIndex);
                this.addLabel(container, label, x, -0.2, 0.15);
            });
        } else if (!showPoints) {
            // If points hidden but no custom axis labels, show default labels spaced out
            values.forEach((v, i) => {
                if (i % Math.ceil(values.length / 5) === 0 && labels[i]) {
                    const p = points[i];
                    this.addLabel(container, labels[i], p.x, -0.2, 0.15);
                }
            });
        }

        this.addAxes(container, width, height, title, maxValue);
    }

    private createBarChartSimple(container: Group, values: number[], labels: string[], colors: string[], title: string) {
        const maxValue = Math.max(...values, 1);
        const height = 1.5;
        const chartWidth = 2.5;

        // X Scale: Band scale for bars
        const xScale = d3.scaleBand()
            .domain(values.map((_, i) => i.toString()))
            .range([-chartWidth / 2, chartWidth / 2])
            .padding(0.3);

        const barWidth = xScale.bandwidth();

        // Y Scale
        const yScale = d3.scaleLinear()
            .domain([0, maxValue])
            .range([0, height]);

        values.forEach((v, i) => {
            const h = yScale(v);
            const c = colors.length > 1 ? colors[i % colors.length] : colors[0];

            // Use slightly glossy material
            const geo = new BoxGeometry(barWidth, h, barWidth);
            const mat = new MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.2 });
            const mesh = new Mesh(geo, mat);

            // Calculate x position centered
            const x = (xScale(i.toString()) || 0) + barWidth / 2;

            mesh.position.set(x, h / 2, 0);
            container.add(mesh);

            this.addLabel(container, labels[i], mesh.position.x, -0.2, 0.2);
            this.addLabel(container, this.formatDuration(v), mesh.position.x, h + 0.1, 0.15);
        });

        // Add axes for better context - 24h scale (288 * 5min = 1440min = 24h)
        const dayMax = 288;
        this.addAxes(container, chartWidth, height, title, dayMax, (val) => this.formatDuration(val));
    }

    private formatDuration(intervals: number): string {
        const totalMinutes = intervals * 5;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }

    private createPieChartFromMap(container: Group, data: Map<string, number>, title: string) {
        const total = Array.from(data.values()).reduce((a, b) => a + b, 0);
        if (total === 0) {
            this.createEmptyChart(container, "No Data");
            return;
        }

        const radius = 0.8;
        const height = 0.2;

        // D3 Pie Generator
        const entries = Array.from(data.entries());
        const pie = d3.pie<[string, number]>()
            .sort(null)
            .value(d => d[1]);

        const pieData = pie(entries);

        const isHex = (s: string) => s.startsWith("#");
        const palette = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.red, COLORS.yellow, COLORS.cyan];

        pieData.forEach((d, i) => {
            const [key, val] = d.data;
            const angle = d.endAngle - d.startAngle;

            const color = isHex(key) ? key : palette[i % palette.length];

            // Note: CylinderGeometry 0 starts at +X.
            const geo = new CylinderGeometry(radius, radius, height, 32, 1, false, d.startAngle, angle);
            const mat = new MeshStandardMaterial({ color });
            const mesh = new Mesh(geo, mat);
            mesh.position.y = height / 2;
            container.add(mesh);

            // Label position
            const midAngle = (d.startAngle + d.endAngle) / 2;
            const labelR = radius + 0.3;
            // Standard polar coordinates on XZ plane (y is up)
            // x = R * cos(theta), z = R = sin(theta) - wait, CylinderGeometry rotates CCW around Y?
            // Yes.
            const lx = Math.cos(midAngle) * labelR;
            const lz = Math.sin(midAngle) * labelR;

            const labelText = isHex(key) ? this.formatDuration(val) : `${key}\n${this.formatDuration(val)}`;
            this.addLabel(container, labelText, lx, height + 0.1, 0.15, lz);
        });

        this.addTitle(container, title, 1.5);
    }

    private createEmptyChart(container: Group, text: string) {
        this.addLabel(container, text, 0, 0.5, 0.3);
    }

    // --- Helpers ---

    private addAxes(container: Group, width: number, height: number, title: string, maxValue?: number, labelFormatter?: (v: number) => string) {
        // X axis
        const points = [new ThreeVector3(-width / 2, 0, 0), new ThreeVector3(width / 2, 0, 0)];
        const geo = new BufferGeometry().setFromPoints(points as any);
        const xGeo = new Line(geo as any, new LineBasicMaterial({ color: COLORS.grid }));
        container.add(xGeo);

        // Y axis
        const yPoints = [new ThreeVector3(-width / 2, 0, 0), new ThreeVector3(-width / 2, height, 0)];
        const yGeo = new BufferGeometry().setFromPoints(yPoints as any);
        const yLine = new Line(yGeo as any, new LineBasicMaterial({ color: COLORS.grid }));
        container.add(yLine);

        // Y axis labels
        if (maxValue !== undefined) {
            const steps = 3; // 0, 8h, 16h, 24h for 24h scale
            for (let i = 0; i <= steps; i++) {
                const y = (i / steps) * height;
                const rawValue = (i / steps) * maxValue;
                // Use formatter if provided, otherwise round to string
                const label = labelFormatter ? labelFormatter(rawValue) : Math.round(rawValue).toString();
                this.addLabel(container, label, -width / 2 - 0.4, y, 0.12);
            }
        }

        this.addTitle(container, title, height + 0.2);
    }

    private addTitle(container: Group, text: string, y: number) {
        this.addLabel(container, text, 0, y, 0.25);
    }

    private addLabel(container: Group, text: string, x: number, y: number, size: number, z: number = 0) {
        const texture = this.createLabelTexture(text);
        const mat = new SpriteMaterial({ map: texture, transparent: true });
        const sprite = new Sprite(mat);
        sprite.position.set(x, y, z);
        const aspect = texture.image.width / texture.image.height;
        sprite.scale.set(size * aspect, size, 1);
        sprite.raycast = () => { }; // Disable raycasting for labels
        container.add(sprite as any);
    }

    private createLabelTexture(text: string): CanvasTexture {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return new CanvasTexture(canvas);

        const fontSize = 48;
        ctx.font = `bold ${fontSize}px sans-serif`;
        const metrics = ctx.measureText(text);
        const width = metrics.width + 20;
        const height = fontSize + 20;

        canvas.width = width;
        canvas.height = height;

        // Reset context after resize
        ctx.font = `bold ${fontSize}px Arial`; // Use Arial for better compatibility
        ctx.fillStyle = "rgba(0,0,0,0)"; // Transparent background
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, width / 2, height / 2);

        return new CanvasTexture(canvas);
    }
}

export const chart3D = new Chart3D();
