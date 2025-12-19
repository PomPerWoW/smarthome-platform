export const COLORS = {
  success: "#22c55e",
  successDark: "#16a34a",
  primary: "#3b82f6",

  background: "#27272a",
  backgroundDark: "#09090b",
  border: "#3f3f46",

  text: "#fafafa",
  textMuted: "#a1a1aa",
  textDim: "#71717a",
} as const;

// Interaction constants
export const DOUBLE_CLICK_THRESHOLD_MS = 300;
export const HOVER_SCALE_FACTOR = 1.05;
export const POSITION_CHANGE_THRESHOLD = 0.01;
export const CLICK_TIMEOUT_MS = 1000;

// Panel dimensions
export const PANEL_SIZES = {
  controlPanel: { maxWidth: 0.4, maxHeight: 0.55 },
  deviceListPanel: { maxWidth: 0.45, maxHeight: 0.6 },
  welcomePanel: { maxWidth: 0.5, maxHeight: 0.8 },
} as const;

// Panel positions
export const PANEL_POSITIONS = {
  controlPanelDefault: { x: 0, y: 1.5, z: -0.6 },
  controlPanelOffset: { x: 0.35, y: 0.15, z: 0 },
  deviceListPanel: { x: -0.35, y: 1.5, z: -0.6 },
  welcomePanel: { x: 0, y: 1.5, z: -0.8 },
} as const;
