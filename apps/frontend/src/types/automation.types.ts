export const DayOfWeek = {
    Mon: "mon",
    Tue: "tue",
    Wed: "wed",
    Thu: "thu",
    Fri: "fri",
    Sat: "sat",
    Sun: "sun",
} as const;

export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];

export const SolarEvent = {
    Sunrise: "sunrise",
    Sunset: "sunset",
} as const;

export type SolarEvent = (typeof SolarEvent)[keyof typeof SolarEvent];

export interface AutomationAction {
    turn_on?: boolean;
    brightness?: number; // 0-100 (Lightbulb)
    color?: string; // Hex color code (Lightbulb)
    temperature?: number; // (AC)
    speed?: number; // 1-5 (Fan)
    swing?: boolean; // (Fan)
    volume?: number; // 0-100 (TV)
    channel?: number; // (TV)
    // Add other possible actions here as needed for different device types
    [key: string]: any;
}

export interface Automation {
    id: string;
    device: string; // Device ID
    title: string;
    time: string | null; // "HH:MM:SS" or null if using solar event
    repeat_days: DayOfWeek[];
    action: AutomationAction;
    is_active: boolean;
    sunrise_sunset: boolean;
    solar_event?: SolarEvent | null;
}

export interface CreateAutomationDTO {
    device: string;
    title: string;
    time?: string | null;
    repeat_days: DayOfWeek[];
    action: AutomationAction;
    is_active: boolean;
    sunrise_sunset: boolean;
    solar_event?: SolarEvent | null;
}

export type UpdateAutomationDTO = Partial<CreateAutomationDTO>;
