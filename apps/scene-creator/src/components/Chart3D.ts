import {
    Object3D,
    Mesh,
    MeshStandardMaterial,
    BoxGeometry,
    CylinderGeometry,
    SphereGeometry,
    Color,
    Group,
    BufferGeometry,
    LineBasicMaterial,
    Line,
    Vector3,
    CatmullRomCurve3,
    TubeGeometry,
} from "@iwsdk/core";

// Chart types
export type ChartType = "bar" | "line" | "pie";

// Mock usage data (7 days)
export const MOCK_USAGE_DATA = [
    { day: "Mon", value: 45 },
    { day: "Tue", value: 62 },
    { day: "Wed", value: 38 },
    { day: "Thu", value: 71 },
    { day: "Fri", value: 55 },
    { day: "Sat", value: 83 },
    { day: "Sun", value: 48 },
];

// Colors for the charts
const CHART_COLORS = [
    "#3b82f6", // blue
    "#22c55e", // green
    "#f97316", // orange
    "#a855f7", // purple
    "#ef4444", // red
    "#eab308", // yellow
    "#06b6d4", // cyan
];

const PIE_COLORS = [
    "#3b82f6",
    "#22c55e",
    "#f97316",
    "#a855f7",
    "#ef4444",
    "#eab308",
    "#06b6d4",
];

export class Chart3D {
    private chartScale = 0.15;
    private baseColor = new Color("#27272a");
    private gridColor = new Color("#3f3f46");

    /**
     * Create a 3D chart based on the type
     */
    createChart(type: ChartType, data = MOCK_USAGE_DATA): Object3D {
        const container = new Group();

        switch (type) {
            case "bar":
                this.createBarChart(container, data);
                break;
            case "line":
                this.createLineChart(container, data);
                break;
            case "pie":
                this.createPieChart(container, data);
                break;
        }

        // Scale the entire chart
        container.scale.setScalar(this.chartScale);

        return container;
    }

    /**
     * Create a base plate for the chart
     */
    private createBasePlate(): Mesh {
        const geometry = new BoxGeometry(2.5, 0.05, 2);
        const material = new MeshStandardMaterial({
            color: this.baseColor,
            metalness: 0.3,
            roughness: 0.7,
        });
        const plate = new Mesh(geometry, material);
        plate.position.y = -0.025;
        return plate;
    }

    /**
     * Create a 3D bar chart
     */
    private createBarChart(
        container: Group,
        data: { day: string; value: number }[],
    ): void {
        const maxValue = Math.max(...data.map((d) => d.value));
        const barWidth = 0.25;
        const spacing = 0.35;
        const startX = -((data.length - 1) * spacing) / 2;

        data.forEach((item, index) => {
            const normalizedHeight = (item.value / maxValue) * 1.5;

            // Create bar
            const geometry = new BoxGeometry(barWidth, normalizedHeight, barWidth);
            const material = new MeshStandardMaterial({
                color: new Color(CHART_COLORS[index % CHART_COLORS.length]),
                metalness: 0.4,
                roughness: 0.5,
                emissive: new Color(CHART_COLORS[index % CHART_COLORS.length]),
                emissiveIntensity: 0.1,
            });
            const bar = new Mesh(geometry, material);
            bar.position.x = startX + index * spacing;
            bar.position.y = normalizedHeight / 2;
            bar.position.z = 0;

            container.add(bar);

            // Add sphere on top of bar for visual flair
            const sphereGeometry = new SphereGeometry(0.08, 16, 16);
            const sphereMaterial = new MeshStandardMaterial({
                color: new Color("#ffffff"),
                metalness: 0.8,
                roughness: 0.2,
                emissive: new Color(CHART_COLORS[index % CHART_COLORS.length]),
                emissiveIntensity: 0.3,
            });
            const sphere = new Mesh(sphereGeometry, sphereMaterial);
            sphere.position.x = startX + index * spacing;
            sphere.position.y = normalizedHeight + 0.08;
            sphere.position.z = 0;
            container.add(sphere);
        });

        // Add grid lines
        this.addGridLines(container, data.length);
    }

    /**
     * Create a 3D line chart
     */
    private createLineChart(
        container: Group,
        data: { day: string; value: number }[],
    ): void {
        const maxValue = Math.max(...data.map((d) => d.value));
        const spacing = 0.35;
        const startX = -((data.length - 1) * spacing) / 2;

        // Create points for the line
        const points: Vector3[] = data.map((item, index) => {
            const normalizedHeight = (item.value / maxValue) * 1.2;
            return new Vector3(startX + index * spacing, normalizedHeight, 0);
        });

        // Create a smooth curve
        const curve = new CatmullRomCurve3(points, false, "catmullrom", 0.5);

        // Create tube geometry for the line (thicker than a regular line)
        const tubeGeometry = new TubeGeometry(curve, 64, 0.03, 8, false);
        const tubeMaterial = new MeshStandardMaterial({
            color: new Color("#3b82f6"),
            metalness: 0.5,
            roughness: 0.3,
            emissive: new Color("#3b82f6"),
            emissiveIntensity: 0.2,
        });
        const tube = new Mesh(tubeGeometry, tubeMaterial);
        container.add(tube);

        // Add spheres at data points
        data.forEach((item, index) => {
            const normalizedHeight = (item.value / maxValue) * 1.2;

            // Data point sphere
            const sphereGeometry = new SphereGeometry(0.08, 16, 16);
            const sphereMaterial = new MeshStandardMaterial({
                color: new Color(CHART_COLORS[index % CHART_COLORS.length]),
                metalness: 0.6,
                roughness: 0.3,
                emissive: new Color(CHART_COLORS[index % CHART_COLORS.length]),
                emissiveIntensity: 0.3,
            });
            const sphere = new Mesh(sphereGeometry, sphereMaterial);
            sphere.position.x = startX + index * spacing;
            sphere.position.y = normalizedHeight;
            sphere.position.z = 0;
            container.add(sphere);

            // Add vertical line from base to point
            const lineGeometry = new BoxGeometry(0.02, normalizedHeight, 0.02);
            const lineMaterial = new MeshStandardMaterial({
                color: this.gridColor,
                transparent: true,
                opacity: 0.5,
            });
            const line = new Mesh(lineGeometry, lineMaterial);
            line.position.x = startX + index * spacing;
            line.position.y = normalizedHeight / 2;
            line.position.z = 0;
            container.add(line);
        });

        // Add grid lines
        this.addGridLines(container, data.length);
    }

    /**
     * Create a 3D pie chart
     */
    private createPieChart(
        container: Group,
        data: { day: string; value: number }[],
    ): void {
        const total = data.reduce((sum, item) => sum + item.value, 0);
        const radius = 0.8;
        const height = 0.3;
        let startAngle = 0;

        data.forEach((item, index) => {
            const angle = (item.value / total) * Math.PI * 2;

            // Create pie slice using cylinder segment
            const slice = this.createPieSlice(
                radius,
                height,
                startAngle,
                angle,
                new Color(PIE_COLORS[index % PIE_COLORS.length]),
            );
            slice.position.y = height / 2 + 0.05;
            container.add(slice);

            startAngle += angle;
        });
    }

    /**
     * Create a single pie slice
     */
    private createPieSlice(
        radius: number,
        height: number,
        startAngle: number,
        angle: number,
        color: Color,
    ): Mesh {
        // Create cylinder geometry
        const geometry = new CylinderGeometry(
            radius,
            radius,
            height,
            32,
            1,
            false,
            startAngle,
            angle,
        );

        const material = new MeshStandardMaterial({
            color: color,
            metalness: 0.4,
            roughness: 0.5,
            emissive: color,
            emissiveIntensity: 0.15,
        });

        return new Mesh(geometry, material);
    }

    /**
     * Add grid lines to the chart
     */
    private addGridLines(container: Group, dataCount: number): void {
        const spacing = 0.35;
        const startX = -((dataCount - 1) * spacing) / 2 - 0.2;
        const endX = ((dataCount - 1) * spacing) / 2 + 0.2;

        // Add horizontal grid lines
        for (let i = 0; i <= 3; i++) {
            const y = i * 0.4;
            const geometry = new BoxGeometry(endX - startX + 0.4, 0.01, 0.01);
            const material = new MeshStandardMaterial({
                color: this.gridColor,
                transparent: true,
                opacity: 0.3,
            });
            const line = new Mesh(geometry, material);
            line.position.y = y;
            line.position.z = -0.5;
            container.add(line);
        }
    }
}

// Export singleton instance
export const chart3D = new Chart3D();
