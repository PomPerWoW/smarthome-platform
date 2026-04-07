import * as d3 from "d3";
import {
    Object3D,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    MeshPhysicalMaterial,
    BoxGeometry,
    CylinderGeometry,
    SphereGeometry,
    Group,
    LineBasicMaterial,
    Line,
    Vector3,
    TubeGeometry,
    DoubleSide,
    CurvePath,
    LineCurve3,
    Color,
} from "@iwsdk/core";
import {
    CanvasTexture,
    SpriteMaterial,
    Sprite,
    BufferGeometry,
    Vector3 as ThreeVector3,
    CircleGeometry,
    BufferAttribute,
    Shape,
    ExtrudeGeometry,
} from "three";
import { DeviceType } from "../types";
import {
    MOCK_LIGHTBULB_DEVICE_LOGS,
    MOCK_AC_DEVICE_LOGS,
    MOCK_FAN_DEVICE_LOGS,
    MOCK_TV_DEVICE_LOGS,
} from "../data/mockData";

export type ChartType = "bar" | "line" | "pie" | "gauge";

const COLORS = {
    blue: "#3b82f6",
    green: "#22c55e",
    orange: "#f97316",
    purple: "#a855f7",
    red: "#ef4444",
    yellow: "#facc15",
    cyan: "#06b6d4",
    pink: "#f472b6",
    grid: "#3f3f46",
    label: "#000000",
    value: "#000000",
    gaugeBdrop: "#f4f4f5",
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
            case DeviceType.SmartMeter:
                if (type === "gauge") {
                    this.createSmartMeterDashboard(container);
                } else {
                    this.createEmptyChart(container, "Unsupported Chart");
                }
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
        const logs = MOCK_LIGHTBULB_DEVICE_LOGS.data.slice(0, 288).reverse();

        if (type === "line") {
            const values = logs.map(l => (l.onoff && l.brightness ? l.brightness : 0));
            const axisLabels = ["00.00", "06.00", "12.00", "18.00", "24.00"];
            this.createLineChart(container, values, [], "Brightness", COLORS.blue, 100, false, axisLabels);
        } else if (type === "bar") {
            const allLogs = MOCK_LIGHTBULB_DEVICE_LOGS.data;
            const onCount = allLogs.filter(l => l.onoff).length;
            const offCount = allLogs.filter(l => !l.onoff).length;
            this.createBarChartSimple(container, [onCount, offCount], ["On", "Off"], [COLORS.green, COLORS.red], "Hours On/Off");
        } else if (type === "pie") {
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
            const values = logs.map(l => (l.onoff && l.temperature ? l.temperature : 0));
            const axisLabels = ["00.00", "06.00", "12.00", "18.00", "24.00"];
            this.createLineChart(container, values, [], "Temperature (°C)", COLORS.cyan, 30, false, axisLabels);
        } else if (type === "bar") {
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
            const values = logs.map(l => (l.onoff && l.speed ? l.speed : 0));
            const axisLabels = ["00.00", "06.00", "12.00", "18.00", "24.00"];
            this.createLineChart(container, values, [], "Speed", COLORS.green, 5, false, axisLabels);
        } else if (type === "bar") {
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
            const values = logs.map(l => (l.onoff ? 1 : 0));
            const axisLabels = ["00.00", "06.00", "12.00", "18.00", "24.00"];
            this.createLineChart(container, values, [], "Status", COLORS.purple, 1.2, false, axisLabels);
        } else if (type === "bar") {
            const allLogs = MOCK_TV_DEVICE_LOGS.data;
            const channelMap = new Map<number, number>();
            allLogs.forEach(l => {
                if (l.onoff && l.channel) {
                    channelMap.set(l.channel, (channelMap.get(l.channel) || 0) + 1);
                }
            });
            const sorted = Array.from(channelMap.entries()).sort((a, b) => a[0] - b[0]);
            const labels = sorted.map(s => `Ch ${s[0]}`);
            const values = sorted.map(s => s[1]);
            const limit = 8;
            this.createBarChartSimple(container, values.slice(0, limit), labels.slice(0, limit), [COLORS.blue], "Channel Usage");
        } else if (type === "pie") {
            const allLogs = MOCK_TV_DEVICE_LOGS.data;
            const ranges = [0, 0, 0, 0];
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

    private createSmartMeterDashboard(container: Group) {
        const gaugeConfigs = [
            { key: "v", title: "VOLTAGE", unit: "Volt", max: 250, color: COLORS.blue },
            { key: "i", title: "CURRENT", unit: "Ampere", max: 50, color: COLORS.red },
            { key: "P", title: "ACTIVE POWER", unit: "kW", max: 1000, color: COLORS.green },
            { key: "Q", title: "REACTIVE POWER", unit: "kVAR", max: 1000, color: COLORS.orange },
            { key: "S", title: "APPARENT POWER", unit: "kVA", max: 1000, color: COLORS.purple },
            { key: "PF", title: "POWER FACTOR", unit: "", max: 1, color: COLORS.cyan },
            { key: "KWH", title: "ACTIVE ENERGY", unit: "kWh", max: 5000, color: COLORS.yellow },
            { key: "KVARH", title: "REACTIVE ENERGY", unit: "kVARh", max: 5000, color: COLORS.pink }
        ];

        const dashboard = new Group();

        dashboard.scale.setScalar(0.5);
        container.add(dashboard);

        const cols = 2;

        const spacingX = 2.4;
        const spacingY = 2.8;

        const startX = -spacingX / 2;
        const startY = (spacingY * 3) / 2;

        const updateHandlers: Record<string, (val: number) => void> = {};

        gaugeConfigs.forEach((cfg, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);

            const { group, updateFn } = this.createCardGauge(cfg.title, cfg.unit, cfg.max, cfg.color);
            group.position.set(startX + col * spacingX, startY - row * spacingY, 0);
            dashboard.add(group);
            updateHandlers[cfg.key.toLowerCase()] = updateFn;
        });

        container.userData.updateGauge = (key: string, value: number) => {
            const handler = updateHandlers[key.toLowerCase()];
            if (handler) {
                handler(value);
            }
        };

        // One invisible hit volume for grab/XR rays — eight detailed gauges were
        // hundreds of raycast targets and tanked frame time.
        const grabProxy = new Mesh(
            new BoxGeometry(6, 6, 0.25),
            new MeshBasicMaterial({
                visible: false,
                transparent: true,
                opacity: 0,
            }) as any,
        );
        grabProxy.name = "SmartMeterChartGrabProxy";
        container.add(grabProxy);

        container.traverse((child) => {
            const m = child as Mesh;
            if (m.isMesh === true && m !== grabProxy) {
                m.raycast = () => { };
            }
        });
    }

    private createCardGauge(title: string, unit: string, maxVal: number, primaryColor: string) {
        const group = new Group();

        // 3D Extrusion settings
        const innerRadius = 0.75;
        const outerRadius = 0.95;
        const midRadius = (innerRadius + outerRadius) / 2;
        const trackThickness = (outerRadius - innerRadius) / 2;
        const backdropDepth = 0.08;
        const progressDepth = 0.12;

        const startAngle = Math.PI + Math.PI / 6;
        const totalAngleSweep = Math.PI + Math.PI / 3;
        const endAngle = startAngle - totalAngleSweep;

        const backdropCurveSegs = 20;
        const progressCurveSegs = 12;
        const capRadialSegs = 12;

        const createThickArc = (startA: number, endA: number, depth: number, segments: number) => {
            const shape = new Shape();
            shape.absarc(0, 0, outerRadius, startA, endA, true);
            shape.lineTo(Math.cos(endA) * innerRadius, Math.sin(endA) * innerRadius);
            shape.absarc(0, 0, innerRadius, endA, startA, false);
            shape.lineTo(Math.cos(startA) * outerRadius, Math.sin(startA) * outerRadius);

            const geo = new ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, curveSegments: segments });
            geo.translate(0, 0, -depth / 2);
            return geo;
        };

        /** Solid fill — avoids O(vertices) gradient work on every reading update (critical for 8× gauges on WebXR). */
        const applySolidGaugeColor = (geo: BufferGeometry, hexColor: string) => {
            const count = geo.attributes.position.count;
            const colors = new Float32Array(count * 3);
            const c = new Color(hexColor);
            for (let i = 0; i < count; i++) {
                colors[i * 3] = c.r;
                colors[i * 3 + 1] = c.g;
                colors[i * 3 + 2] = c.b;
            }
            geo.setAttribute("color", new BufferAttribute(colors, 3));
        };

        // --- 1. Backdrop Track ---
        const bdropGeo = createThickArc(startAngle, endAngle, backdropDepth, backdropCurveSegs);
        const bdropMat = new MeshBasicMaterial({ color: COLORS.gaugeBdrop });

        // Assert as 'any' to bypass missing SDK-specific BufferGeometry properties like 'computeBoundsTree'
        const backdropArc = new Mesh(bdropGeo as any, bdropMat);
        group.add(backdropArc);

        const capGeoBdrop = new CylinderGeometry(trackThickness * 0.98, trackThickness * 0.98, backdropDepth, capRadialSegs);
        capGeoBdrop.rotateX(Math.PI / 2);

        const bdropStartCap = new Mesh(capGeoBdrop, bdropMat);
        bdropStartCap.position.set(Math.cos(startAngle) * midRadius, Math.sin(startAngle) * midRadius, 0);
        group.add(bdropStartCap);

        const bdropEndCap = new Mesh(capGeoBdrop, bdropMat);
        bdropEndCap.position.set(Math.cos(endAngle) * midRadius, Math.sin(endAngle) * midRadius, 0);
        group.add(bdropEndCap);

        // --- 2. Progress Track ---
        const initialProgressGeo = createThickArc(startAngle, startAngle - 0.001, progressDepth, progressCurveSegs);
        applySolidGaugeColor(initialProgressGeo, primaryColor);
        const progressMat = new MeshBasicMaterial({ vertexColors: true });

        // Assert as 'any' to bypass strict TS check
        const progressArc = new Mesh(initialProgressGeo as any, progressMat);
        progressArc.position.z = 0.01;
        group.add(progressArc);

        const capGeoProg = new CylinderGeometry(trackThickness * 0.98, trackThickness * 0.98, progressDepth, capRadialSegs);
        capGeoProg.rotateX(Math.PI / 2);

        const baseColor = new Color(COLORS.gaugeBdrop).lerp(new Color(primaryColor), 0.15);
        const baseCapMat = new MeshBasicMaterial({ color: baseColor });
        const baseCap = new Mesh(capGeoProg, baseCapMat);
        baseCap.position.set(Math.cos(startAngle) * midRadius, Math.sin(startAngle) * midRadius, 0.01);
        group.add(baseCap);

        const tipCapMat = new MeshBasicMaterial({ color: primaryColor });
        const tipCap = new Mesh(capGeoProg, tipCapMat);
        tipCap.position.set(Math.cos(startAngle) * midRadius, Math.sin(startAngle) * midRadius, 0.01);
        group.add(tipCap);

        // --- 3. 3D Needle ---
        const pivotGroup = new Group();
        pivotGroup.position.set(0, 0, 0.08);

        const dotGeo = new CylinderGeometry(0.12, 0.12, 0.06, capRadialSegs).rotateX(Math.PI / 2);
        const dot = new Mesh(dotGeo, new MeshBasicMaterial({ color: primaryColor }));
        pivotGroup.add(dot);

        const needleShape = new Shape();
        const nW = 0.15;
        const nL = innerRadius - 0.05;
        needleShape.moveTo(-nW / 2, 0);
        needleShape.lineTo(nW / 2, 0);
        needleShape.lineTo(0, nL);
        needleShape.lineTo(-nW / 2, 0);

        const needleGeo = new ExtrudeGeometry(needleShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
        needleGeo.translate(0, 0, -0.02);

        // Assert as 'any' to bypass strict TS check
        const needleMesh = new Mesh(needleGeo as any, new MeshBasicMaterial({ color: primaryColor }));
        pivotGroup.add(needleMesh);

        group.add(pivotGroup);

        const needleStartRot = startAngle - Math.PI / 2;
        pivotGroup.rotation.z = needleStartRot;

        // --- 4. Synchronized Label Sizes ---
        const LABEL_SIZES = { title: 0.25, value: 0.3, unit: 0.2 };

        const titleSprite = this.addLabelWithColor(group, title, 0, 1.3, LABEL_SIZES.title, COLORS.label);
        const valueSprite = this.addLabelWithColor(group, "0.00", 0, -0.3, LABEL_SIZES.value, COLORS.value, true);
        const unitSprite = this.addLabelWithColor(group, unit, 0, -0.8, LABEL_SIZES.unit, COLORS.label);

        // --- 5. Update & Animation Logic ---
        const updateFn = (value: any) => {
            const numValue = Number(value);
            const clamped = Math.max(0, Math.min(numValue, maxVal));
            const t = clamped / maxVal;
            const targetTotalAngle = Math.max(0.001, t * totalAngleSweep);
            const targetNeedleAngle = needleStartRot - targetTotalAngle;
            const finalEndAngle = startAngle - targetTotalAngle;

            pivotGroup.rotation.z = targetNeedleAngle;

            progressArc.geometry.dispose();
            progressArc.geometry = createThickArc(
                startAngle,
                finalEndAngle,
                progressDepth,
                progressCurveSegs,
            ) as any;
            applySolidGaugeColor(progressArc.geometry as any, primaryColor);

            tipCap.position.x = Math.cos(finalEndAngle) * midRadius;
            tipCap.position.y = Math.sin(finalEndAngle) * midRadius;

            const text = value.toFixed(2);
            const mat = valueSprite.material as SpriteMaterial;
            if (mat.map) {
                mat.map.dispose();
            }
            const texture = this.createLabelTexture(text, true, COLORS.value);
            mat.map = texture;
            const aspect = texture.image.width / texture.image.height;
            valueSprite.scale.set(LABEL_SIZES.value * aspect, LABEL_SIZES.value, 1);
        };

        return { group, updateFn };
    }

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

        const xScale = d3.scaleLinear()
            .domain([0, Math.max(values.length - 1, 1)])
            .range([-width / 2, width / 2]);

        const yScale = d3.scaleLinear()
            .domain([0, maxValue])
            .range([0, height]);

        const points: Vector3[] = values.map((v, i) => {
            return new Vector3(xScale(i), yScale(v), 0);
        });

        if (points.length < 2) return;

        const curvePath = new CurvePath<Vector3>();
        for (let i = 0; i < points.length - 1; i++) {
            curvePath.add(new LineCurve3(points[i], points[i + 1]));
        }

        const tubeGeo = new TubeGeometry(curvePath, points.length * 10, 0.02, 8, false);
        const tubeMat = new MeshPhysicalMaterial({
            color,
            roughness: 0.1,
            metalness: 0.0,
            transmission: 0.4,
            thickness: 0.5,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1,
            transparent: true,
            opacity: 0.9,
        });
        container.add(new Mesh(tubeGeo, tubeMat));

        if (showPoints) {
            values.forEach((v, i) => {
                const p = points[i];
                const sphere = new Mesh(new SphereGeometry(0.04, 8, 8), new MeshPhysicalMaterial({
                    color,
                    roughness: 0.1,
                    metalness: 0.0,
                    transmission: 0.4,
                    thickness: 0.5,
                    clearcoat: 1.0,
                    clearcoatRoughness: 0.1,
                    transparent: true,
                    opacity: 0.9,
                }));
                sphere.position.copy(p);
                container.add(sphere);

                if (!axisLabels && i % 4 === 0 && labels[i]) {
                    this.addLabel(container, labels[i], p.x, -0.2, 0.15);
                }
            });
        }

        if (axisLabels) {
            axisLabels.forEach((label, i) => {
                const progress = i / (axisLabels.length - 1);
                const dataIndex = progress * (values.length - 1);
                const x = xScale(dataIndex);
                this.addLabel(container, label, x, -0.2, 0.15);
            });
        } else if (!showPoints) {
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

        const xScale = d3.scaleBand()
            .domain(values.map((_, i) => i.toString()))
            .range([-chartWidth / 2, chartWidth / 2])
            .padding(0.3);

        const barWidth = xScale.bandwidth();

        const yScale = d3.scaleLinear()
            .domain([0, maxValue])
            .range([0, height]);

        values.forEach((v, i) => {
            const h = yScale(v);
            const c = colors.length > 1 ? colors[i % colors.length] : colors[0];

            const geo = new BoxGeometry(barWidth, h, barWidth);
            const mat = new MeshPhysicalMaterial({
                color: c,
                roughness: 0.1,
                metalness: 0.0,
                transmission: 0.4,
                thickness: 0.5,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1,
                transparent: true,
                opacity: 0.9,
            });
            const mesh = new Mesh(geo, mat);

            const x = (xScale(i.toString()) || 0) + barWidth / 2;

            mesh.position.set(x, h / 2, 0);
            container.add(mesh);

            this.addLabel(container, labels[i], mesh.position.x, -0.2, 0.2);
            this.addLabel(container, this.formatDuration(v), mesh.position.x, h + 0.1, 0.15);
        });

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

        const entries = Array.from(data.entries());
        const pie = d3.pie<[string, number]>()
            .sort(null)
            .value(d => d[1]);

        const pieData = pie(entries);

        const isHex = (s: string) => s.startsWith("#");
        const palette = [COLORS.blue, COLORS.green, COLORS.orange, COLORS.purple, COLORS.red, COLORS.yellow, COLORS.cyan, COLORS.pink];

        pieData.forEach((d, i) => {
            const [key, val] = d.data;
            const angle = d.endAngle - d.startAngle;

            const color = isHex(key) ? key : palette[i % palette.length];

            const geo = new CylinderGeometry(radius, radius, height, 32, 1, false, d.startAngle, angle);
            const mat = new MeshPhysicalMaterial({
                color,
                roughness: 0.1,
                metalness: 0.0,
                transmission: 0.4,
                thickness: 0.5,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1,
                transparent: true,
                opacity: 0.9,
            });
            const mesh = new Mesh(geo, mat);
            mesh.position.y = height / 2;
            container.add(mesh);

            const midAngle = (d.startAngle + d.endAngle) / 2;
            const labelR = radius + 0.3;
            const lx = Math.cos(midAngle) * labelR;
            const lz = Math.sin(midAngle) * labelR;

            const labelText = isHex(key) ? this.formatDuration(val) : `${key}\n${this.formatDuration(val)}`;
            this.addLabel(container, labelText, lx, height + 0.1, 0.15, lz);
        });
    }

    private createEmptyChart(container: Group, text: string) {
        this.addLabel(container, text, 0, 0.5, 0.3);
    }

    private addAxes(container: Group, width: number, height: number, title: string, maxValue?: number, labelFormatter?: (v: number) => string) {
        const points = [new ThreeVector3(-width / 2, 0, 0), new ThreeVector3(width / 2, 0, 0)];
        const geo = new BufferGeometry().setFromPoints(points as any);
        const xGeo = new Line(geo as any, new LineBasicMaterial({ color: COLORS.grid }));
        container.add(xGeo);

        const yPoints = [new ThreeVector3(-width / 2, 0, 0), new ThreeVector3(-width / 2, height, 0)];
        const yGeo = new BufferGeometry().setFromPoints(yPoints as any);
        const yLine = new Line(yGeo as any, new LineBasicMaterial({ color: COLORS.grid }));
        container.add(yLine);

        if (maxValue !== undefined) {
            const steps = 3;
            for (let i = 0; i <= steps; i++) {
                const y = (i / steps) * height;
                const rawValue = (i / steps) * maxValue;
                const label = labelFormatter ? labelFormatter(rawValue) : Math.round(rawValue).toString();
                this.addLabel(container, label, -width / 2 - 0.4, y, 0.12);
            }
        }
    }

    private addTitle(container: Group, text: string, y: number) {
        this.addLabel(container, text, 0, y, 0.25);
    }

    private addLabelWithColor(container: Group, text: string, x: number, y: number, size: number, color: string, isValueText = false, z = 0.1) {
        const texture = this.createLabelTexture(text, isValueText, color);
        const mat = new SpriteMaterial({ map: texture, transparent: true });
        const sprite = new Sprite(mat);
        sprite.position.set(x, y, z);
        const aspect = texture.image.width / texture.image.height;
        sprite.scale.set(size * aspect, size, 1);
        sprite.raycast = () => { };
        container.add(sprite as any);
        return sprite;
    }

    private addLabel(container: Group, text: string, x: number, y: number, size: number, z: number = 0) {
        this.addLabelWithColor(container, text, x, y, size, "#ffffff", false, z);
    }

    private createLabelTexture(text: string, isValueText = false, color = "#000000", bgColor = "rgba(0,0,0,0)", fontSizeMult = 1): CanvasTexture {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return new CanvasTexture(canvas);

        const resolutionMultiplier = 2;
        const baseFontSize = (isValueText ? 64 : 48) * fontSizeMult;
        const fontSize = baseFontSize * resolutionMultiplier;

        ctx.font = `bold ${fontSize}px sans-serif`;
        const metrics = ctx.measureText(text);

        const padding = 20 * resolutionMultiplier;
        const width = metrics.width + padding;
        const height = fontSize + padding;

        canvas.width = width;
        canvas.height = height;

        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = color;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, width / 2, height / 2);

        const texture = new CanvasTexture(canvas);
        texture.anisotropy = 4;
        return texture;
    }
}

export const chart3D = new Chart3D();