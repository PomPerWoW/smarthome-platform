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

interface DatePickerState {
    selectedDate: Date;
    viewMonth: number;
    viewYear: number;
    isOpen: boolean;
}

interface DayCellInfo {
    cell: UIKit.Container;
    text: UIKit.Text;
    dayNumber: number;
    isCurrentMonth: boolean;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export class GraphPanelSystem extends createSystem({
    graphPanel: {
        required: [PanelUI, PanelDocument],
        where: [eq(PanelUI, "config", "./ui/graph-panel.json")],
    },
}) {
    private setupPanels = new Set<Entity>();
    private datePickerStates = new Map<string, DatePickerState>();
    private dayCells = new Map<string, DayCellInfo[]>();

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

            // Set up date picker
            this.setupDatePicker(document, deviceId);
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

    private setupDatePicker(document: UIKitDocument, deviceId: string): void {
        const now = new Date();

        // Initialize date picker state for this device
        const state: DatePickerState = {
            selectedDate: now,
            viewMonth: now.getMonth(),
            viewYear: now.getFullYear(),
            isOpen: false,
        };
        this.datePickerStates.set(deviceId, state);

        // Get elements
        const calendarBtn = document.getElementById("calendar-btn");
        const datePickerOverlay = document.getElementById("date-picker-overlay") as UIKit.Container;
        const currentDateText = document.getElementById("current-date-text") as UIKit.Text;
        const monthYearText = document.getElementById("month-year-text") as UIKit.Text;
        const prevMonthBtn = document.getElementById("prev-month-btn");
        const nextMonthBtn = document.getElementById("next-month-btn");

        console.log(`[GraphPanel] setupDatePicker: calendarBtn=${!!calendarBtn}, overlay=${!!datePickerOverlay}`);

        // Update date display with current date
        if (currentDateText) {
            currentDateText.setProperties({ text: this.formatDate(state.selectedDate) });
        }

        // Update month/year text
        if (monthYearText) {
            monthYearText.setProperties({ text: this.formatMonthYear(state.viewMonth, state.viewYear) });
        }

        // Collect all day cells (42 cells = 6 weeks x 7 days)
        const cells: DayCellInfo[] = [];
        for (let i = 0; i < 42; i++) {
            const cell = document.getElementById(`day-${i}`) as UIKit.Container;
            const text = document.getElementById(`day-text-${i}`) as UIKit.Text;
            if (cell && text) {
                cells.push({ cell, text, dayNumber: 0, isCurrentMonth: false });

                // Add click listener
                cell.addEventListener("click", () => {
                    this.handleDayCellClick(document, deviceId, i);
                });
            }
        }
        this.dayCells.set(deviceId, cells);

        // Calendar button click - toggle overlay
        if (calendarBtn && datePickerOverlay) {
            calendarBtn.addEventListener("click", () => {
                console.log(`[GraphPanel] Calendar button clicked for ${deviceId}`);
                state.isOpen = !state.isOpen;

                datePickerOverlay.setProperties({
                    display: state.isOpen ? "flex" : "none"
                });

                if (state.isOpen) {
                    this.renderCalendarGrid(document, deviceId);
                }
            });
        }

        // Previous month button
        if (prevMonthBtn) {
            prevMonthBtn.addEventListener("click", () => {
                state.viewMonth--;
                if (state.viewMonth < 0) {
                    state.viewMonth = 11;
                    state.viewYear--;
                }
                console.log(`[GraphPanel] Prev month: ${state.viewMonth + 1}/${state.viewYear}`);

                if (monthYearText) {
                    monthYearText.setProperties({ text: this.formatMonthYear(state.viewMonth, state.viewYear) });
                }
                this.renderCalendarGrid(document, deviceId);
            });
        }

        // Next month button
        if (nextMonthBtn) {
            nextMonthBtn.addEventListener("click", () => {
                state.viewMonth++;
                if (state.viewMonth > 11) {
                    state.viewMonth = 0;
                    state.viewYear++;
                }
                console.log(`[GraphPanel] Next month: ${state.viewMonth + 1}/${state.viewYear}`);

                if (monthYearText) {
                    monthYearText.setProperties({ text: this.formatMonthYear(state.viewMonth, state.viewYear) });
                }
                this.renderCalendarGrid(document, deviceId);
            });
        }

        // Initial calendar render
        this.renderCalendarGrid(document, deviceId);
    }

    private renderCalendarGrid(document: UIKitDocument, deviceId: string): void {
        const state = this.datePickerStates.get(deviceId);
        const cells = this.dayCells.get(deviceId);
        if (!state || !cells) return;

        const { viewMonth, viewYear, selectedDate } = state;
        const today = new Date();

        // Get first day of month and days in month
        const firstDay = new Date(viewYear, viewMonth, 1);
        const lastDay = new Date(viewYear, viewMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDayOfWeek = firstDay.getDay();

        // Get days in previous month for leading days
        const prevMonthLastDay = new Date(viewYear, viewMonth, 0);
        const daysInPrevMonth = prevMonthLastDay.getDate();

        let dayCounter = 1;
        let nextMonthDayCounter = 1;

        // Update all 42 cells
        for (let i = 0; i < 42; i++) {
            const cellInfo = cells[i];
            if (!cellInfo) continue;

            let displayDay: number;
            let isOtherMonth = false;
            let isCurrentMonth = false;

            if (i < startDayOfWeek) {
                // Previous month days
                displayDay = daysInPrevMonth - startDayOfWeek + i + 1;
                isOtherMonth = true;
            } else if (dayCounter <= daysInMonth) {
                // Current month days
                displayDay = dayCounter;
                isCurrentMonth = true;
                dayCounter++;
            } else {
                // Next month days
                displayDay = nextMonthDayCounter;
                isOtherMonth = true;
                nextMonthDayCounter++;
            }

            // Store day info for click handling
            cellInfo.dayNumber = displayDay;
            cellInfo.isCurrentMonth = isCurrentMonth;

            // Update text
            cellInfo.text.setProperties({
                text: displayDay.toString(),
                color: isOtherMonth ? "#52525b" : "#fafafa"
            });

            // Check if this is today
            const isToday = isCurrentMonth &&
                viewYear === today.getFullYear() &&
                viewMonth === today.getMonth() &&
                displayDay === today.getDate();

            // Check if this is the selected date
            const isSelected = isCurrentMonth &&
                viewYear === selectedDate.getFullYear() &&
                viewMonth === selectedDate.getMonth() &&
                displayDay === selectedDate.getDate();

            // Update cell styling
            cellInfo.cell.setProperties({
                backgroundColor: isSelected ? "#a855f7" : "transparent",
                borderWidth: isToday && !isSelected ? 0.1 : 0,
                borderColor: isToday && !isSelected ? "#a855f7" : "transparent"
            });
        }
    }

    private handleDayCellClick(document: UIKitDocument, deviceId: string, cellIndex: number): void {
        const state = this.datePickerStates.get(deviceId);
        const cells = this.dayCells.get(deviceId);
        if (!state || !cells) return;

        const cellInfo = cells[cellIndex];
        if (!cellInfo || !cellInfo.isCurrentMonth) return; // Ignore clicks on other month days

        // Update selected date
        state.selectedDate = new Date(state.viewYear, state.viewMonth, cellInfo.dayNumber);
        console.log(`[GraphPanel] Date selected: ${this.formatDate(state.selectedDate)}`);

        // Update date display text
        const currentDateText = document.getElementById("current-date-text") as UIKit.Text;
        if (currentDateText) {
            currentDateText.setProperties({ text: this.formatDate(state.selectedDate) });
        }

        // Close the picker
        const datePickerOverlay = document.getElementById("date-picker-overlay") as UIKit.Container;
        if (datePickerOverlay) {
            datePickerOverlay.setProperties({ display: "none" });
            state.isOpen = false;
        }

        // Re-render to show new selection
        this.renderCalendarGrid(document, deviceId);

        // Emit date change event for chart updates
        this.handleDateChange(deviceId, state.selectedDate);
    }

    private handleDateChange(deviceId: string, date: Date): void {
        console.log(`[GraphPanel] Date changed for ${deviceId}: ${this.formatDate(date)}`);

        // Get the device renderer and update charts with new date
        const deviceRenderer = this.world.getSystem(DeviceRendererSystem);
        if (deviceRenderer && typeof (deviceRenderer as any).setChartDate === "function") {
            (deviceRenderer as any).setChartDate(deviceId, date);
        }
    }

    private formatDate(date: Date): string {
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    }

    private formatMonthYear(month: number, year: number): string {
        return `${MONTH_NAMES[month]} ${year}`;
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
        this.datePickerStates.clear();
        this.dayCells.clear();
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

    // Public getter for selected date (can be used by other systems)
    public getSelectedDate(deviceId: string): Date | undefined {
        return this.datePickerStates.get(deviceId)?.selectedDate;
    }
}
