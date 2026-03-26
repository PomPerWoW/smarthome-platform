// =============================================================================
// SceneNotification.ts
//
// Beautiful 3D floating toast notification system for the SmartHome
// scene-creator.  Pure DOM/CSS — zero external dependencies.
//
// Usage:
//   import { sceneNotify, SN_ICONS } from "../ui/SceneNotification";
//
//   sceneNotify({
//     title: "Fan turned on",
//     description: "'Living Room Fan' is now running",
//     severity: "success",
//     icon: SN_ICONS.fan,
//     iconBg: "rgba(34,211,238,0.15)",
//     iconFg: "#22d3ee",
//   });
// =============================================================================

// ─── Public types ─────────────────────────────────────────────────────────────

export type SnSeverity = "success" | "info" | "warning" | "error";

export interface SnOptions {
  /** Bold notification title (required) */
  title: string;
  /** Optional supporting description shown below the title */
  description?: string;
  /** Visual severity — drives the color scheme.  Default: "info" */
  severity?: SnSeverity;
  /** Raw SVG markup for the icon (use SN_ICONS constants) */
  icon?: string;
  /** CSS color for the icon-circle background, e.g. "rgba(34,211,238,0.15)" */
  iconBg?: string;
  /** CSS color (stroke / fill) applied to the icon SVG, e.g. "#22d3ee" */
  iconFg?: string;
  /**
   * Hex color string shown as a small swatch dot overlaid on the icon AND as
   * a monospace hex badge below the description.  Ideal for light-colour
   * notifications.  e.g. "#FF6B6B"
   */
  colorValue?: string;
  /** Short value badge rendered in monospace below the description, e.g. "75%" */
  badge?: string;
  /** Auto-dismiss delay in ms.  Default: 4200 */
  duration?: number;
}

// ─── Inline SVG icon library ──────────────────────────────────────────────────

export const SN_ICONS = {
  power: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>`,

  fan: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z"/><path d="M12 12v.01"/></svg>`,

  lightbulb: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,

  snowflake: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>`,

  tv: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>`,

  volume2: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,

  volumeX: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,

  thermometer: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>`,

  sun: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,

  palette: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`,

  hash: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,

  wind: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`,

  rotateCw: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/></svg>`,

  bot: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,

  mic: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,

  micOff: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,

  wifi: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,

  wifiOff: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,

  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,

  zap: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,

  alertCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,

  checkCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
} as const;

// ─── Internal severity theme data ──────────────────────────────────────────────

interface SeverityTheme {
  /** Accent stripe + progress bar color */
  accent: string;
  /** Outer glow box-shadow color (rgba) */
  glow: string;
  /** Entry shimmer sweep color (rgba) */
  shimmer: string;
}

const THEMES: Record<SnSeverity, SeverityTheme> = {
  success: {
    accent:  "#22c55e",
    glow:    "rgba(34,197,94,0.32)",
    shimmer: "rgba(34,197,94,0.55)",
  },
  info: {
    accent:  "#3b82f6",
    glow:    "rgba(59,130,246,0.28)",
    shimmer: "rgba(59,130,246,0.55)",
  },
  warning: {
    accent:  "#f59e0b",
    glow:    "rgba(245,158,11,0.32)",
    shimmer: "rgba(245,158,11,0.55)",
  },
  error: {
    accent:  "#ef4444",
    glow:    "rgba(239,68,68,0.32)",
    shimmer: "rgba(239,68,68,0.55)",
  },
};

// ─── CSS (injected once into <head>) ──────────────────────────────────────────

const STYLES = `
/* ── Stack container ──────────────────────────────────────────── */
#sn-root {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 330px;
  z-index: 100002;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  pointer-events: none;
  gap: 0;
}

/* ── Wrapper — used for the height-collapse exit animation ─────── */
.sn-wrap {
  width: 100%;
  margin-bottom: 9px;
  pointer-events: auto;
  /* Reserve the final height so the collapse is measurable */
  will-change: height, opacity;
}

/* ── Entry / exit keyframes ───────────────────────────────────── */
@keyframes sn-enter {
  0%   { opacity:0; transform: perspective(540px) translateX(90px) rotateY(22deg) scale(0.86); }
  55%  { opacity:1; transform: perspective(540px) translateX(-6px) rotateY(-3deg)  scale(1.01); }
  100% { opacity:1; transform: perspective(540px) translateX(0)    rotateY(0deg)   scale(1);    }
}
@keyframes sn-exit {
  0%   { opacity:1; transform: translateX(0)    scale(1);    }
  100% { opacity:0; transform: translateX(80px) scale(0.87); }
}

/* ── Shimmer sweep (once on entry) ────────────────────────────── */
@keyframes sn-shimmer {
  0%   { transform: translateX(-110%); opacity: 0.85; }
  65%  { opacity: 0.45; }
  100% { transform: translateX(220%);  opacity: 0; }
}

/* ── Progress bar depletes left→right ────────────────────────── */
@keyframes sn-progress {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* ── Glow pulse on entry ──────────────────────────────────────── */
@keyframes sn-glow {
  0%   { box-shadow: var(--sn-shadow-base), 0 0 0   0   var(--sn-glow); }
  38%  { box-shadow: var(--sn-shadow-base), 0 0 32px 8px var(--sn-glow); }
  100% { box-shadow: var(--sn-shadow-base), 0 0 16px 3px var(--sn-glow); }
}

/* ── Card ─────────────────────────────────────────────────────── */
.sn-card {
  /* Theme custom props set inline */
  --sn-shadow-base:
    0 1px 0 0 rgba(255,255,255,0.06) inset,
    0 2px 8px  rgba(0,0,0,0.55),
    0 10px 30px rgba(0,0,0,0.40);

  position: relative;
  width: 100%;
  border-radius: 15px;
  overflow: hidden;
  transform-origin: right center;

  /* Frosted-glass surface */
  background: linear-gradient(
    138deg,
    rgba(14,17,33,0.97) 0%,
    rgba(7,9,20,0.99)   100%
  );
  backdrop-filter: blur(28px) saturate(1.6);
  -webkit-backdrop-filter: blur(28px) saturate(1.6);

  /* Borders — top edge is the 'rim light' */
  border: 1px solid rgba(255,255,255,0.075);
  border-top-color: rgba(255,255,255,0.17);

  animation:
    sn-enter 0.55s cubic-bezier(0.16,1,0.3,1) forwards,
    sn-glow   0.75s ease                       forwards;
}
.sn-card.sn-exiting {
  animation: sn-exit 0.36s cubic-bezier(0.4,0,1,1) forwards !important;
}

/* ── Left accent stripe ───────────────────────────────────────── */
.sn-stripe {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--sn-accent);
  border-radius: 15px 0 0 15px;
  box-shadow: 0 0 10px 1px var(--sn-glow);
}

/* ── Shimmer bar (sweeps once on entry) ───────────────────────── */
.sn-shimmer {
  position: absolute;
  inset: 0;
  width: 55%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--sn-shimmer) 50%,
    transparent 100%
  );
  transform: translateX(-110%);
  animation: sn-shimmer 0.85s ease 0.08s forwards;
  pointer-events: none;
  z-index: 1;
  border-radius: 15px;
}

/* ── Body row ─────────────────────────────────────────────────── */
.sn-body {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 13px 11px 16px;
}

/* ── Icon circle ──────────────────────────────────────────────── */
.sn-icon {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255,255,255,0.08);
  /* bg + fg set via inline style */
}

/* ── Color swatch dot (overlaid on icon bottom-right) ────────── */
.sn-color-dot {
  position: absolute;
  bottom: -3px;
  right:  -3px;
  width:  13px;
  height: 13px;
  border-radius: 50%;
  border: 2.5px solid rgba(7,9,20,0.99);
  box-shadow: 0 1px 5px rgba(0,0,0,0.6);
  pointer-events: none;
}

/* ── Text column ──────────────────────────────────────────────── */
.sn-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sn-title {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 13.5px;
  font-weight: 650;
  color: #eef0ff;
  letter-spacing: -0.25px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sn-desc {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 11.5px;
  color: rgba(195,200,230,0.62);
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Value / color badge ──────────────────────────────────────── */
.sn-badge {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  padding: 2px 7px;
  border-radius: 5px;
  background: rgba(255,255,255,0.055);
  border: 1px solid rgba(255,255,255,0.09);
  font-family: "SF Mono","JetBrains Mono","Fira Code",monospace;
  font-size: 10.5px;
  font-weight: 500;
  color: rgba(215,220,255,0.78);
  letter-spacing: 0.2px;
}

/* Small square swatch inside the hex badge */
.sn-badge-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.15);
}

/* ── Dismiss (×) button ───────────────────────────────────────── */
.sn-dismiss {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 6px;
  background: rgba(255,255,255,0.04);
  color: rgba(170,178,215,0.50);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  align-self: flex-start;
}
.sn-dismiss:hover {
  background: rgba(255,255,255,0.12);
  color: rgba(225,228,255,0.90);
  border-color: rgba(255,255,255,0.15);
}

/* ── Progress bar (countdown) ─────────────────────────────────── */
.sn-progress {
  position: relative;
  z-index: 3;
  height: 2.5px;
  background: rgba(255,255,255,0.04);
  overflow: hidden;
  border-radius: 0 0 15px 15px;
}
.sn-progress-fill {
  height: 100%;
  width: 100%;
  background: var(--sn-accent);
  transform-origin: left center;
  animation: sn-progress var(--sn-duration) linear forwards;
  box-shadow: 0 0 8px 2px var(--sn-glow);
}
`;

// ─── Notification manager singleton ───────────────────────────────────────────

const MAX_STACK = 5;
const DEFAULT_DURATION = 4200;

interface ActiveEntry {
  wrapper: HTMLDivElement;
  timer: ReturnType<typeof setTimeout>;
}

class SceneNotificationManager {
  private static _inst: SceneNotificationManager | null = null;
  private root!: HTMLDivElement;
  private active = new Map<string, ActiveEntry>();

  private constructor() {
    this._injectStyles();
    this._createRoot();
  }

  /** Returns the singleton, creating it lazily on first call. */
  static getInstance(): SceneNotificationManager {
    if (!SceneNotificationManager._inst) {
      SceneNotificationManager._inst = new SceneNotificationManager();
    }
    return SceneNotificationManager._inst;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Show a floating notification toast.
   * @returns The notification id (can be passed to `dismiss(id)` to remove early).
   */
  show(opts: SnOptions): string {
    const id = `sn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const duration = opts.duration ?? DEFAULT_DURATION;
    const severity: SnSeverity = opts.severity ?? "info";
    const theme = THEMES[severity];

    // Enforce max stack — remove oldest first
    if (this.active.size >= MAX_STACK) {
      const oldestId = this.active.keys().next().value as string | undefined;
      if (oldestId) this._removeInstant(oldestId);
    }

    // Build the wrapper + card DOM
    const wrapper = document.createElement("div");
    wrapper.className = "sn-wrap";

    const card = document.createElement("div");
    card.className = "sn-card";
    card.setAttribute("data-sn-id", id);
    card.style.cssText = [
      `--sn-accent: ${theme.accent};`,
      `--sn-glow: ${theme.glow};`,
      `--sn-shimmer: ${theme.shimmer};`,
      `--sn-duration: ${duration}ms;`,
    ].join(" ");

    card.innerHTML = this._buildCardHTML(opts, theme);

    // Wire dismiss button
    const btn = card.querySelector<HTMLButtonElement>(".sn-dismiss");
    if (btn) btn.addEventListener("click", () => this.dismiss(id));

    wrapper.appendChild(card);

    // Newest notifications appear at the top of the stack
    this.root.prepend(wrapper);

    // Schedule auto-dismiss
    const timer = setTimeout(() => this.dismiss(id), duration);
    this.active.set(id, { wrapper, timer });

    return id;
  }

  /** Gracefully animate-out and remove the notification with the given id. */
  dismiss(id: string): void {
    const entry = this.active.get(id);
    if (!entry) return;

    clearTimeout(entry.timer);
    this.active.delete(id);

    const { wrapper } = entry;
    const card = wrapper.querySelector<HTMLDivElement>(".sn-card");

    if (!card) {
      wrapper.remove();
      return;
    }

    // Step 1 — slide the card out to the right
    card.classList.add("sn-exiting");

    // Step 2 — after card slides out, collapse wrapper height for smooth reflow
    setTimeout(() => {
      const h = wrapper.getBoundingClientRect().height;
      wrapper.style.height = `${h}px`;
      wrapper.style.marginBottom = "9px";
      wrapper.style.overflow  = "hidden";
      wrapper.style.transition =
        "height 0.22s ease, margin-bottom 0.22s ease, opacity 0.18s ease";
      wrapper.style.opacity = "0";

      // Force a reflow so the transition fires
      void wrapper.offsetHeight;

      wrapper.style.height = "0px";
      wrapper.style.marginBottom = "0px";
    }, 340);

    // Step 3 — remove from DOM
    setTimeout(() => wrapper.remove(), 580);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _removeInstant(id: string): void {
    const entry = this.active.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.active.delete(id);
    entry.wrapper.remove();
  }

  private _buildCardHTML(opts: SnOptions, theme: SeverityTheme): string {
    // ── Icon section ──
    let iconHtml = "";
    if (opts.icon) {
      const bg = opts.iconBg ?? "rgba(59,130,246,0.15)";
      const fg = opts.iconFg ?? "#3b82f6";
      const colorDot = opts.colorValue
        ? `<span class="sn-color-dot" style="background:${opts.colorValue};"></span>`
        : "";
      iconHtml = `
        <div class="sn-icon" style="background:${bg}; color:${fg};">
          ${opts.icon}
          ${colorDot}
        </div>`;
    }

    // ── Description ──
    const descHtml = opts.description
      ? `<span class="sn-desc">${this._esc(opts.description)}</span>`
      : "";

    // ── Badge (explicit value OR auto hex badge from colorValue) ──
    let badgeHtml = "";
    if (opts.badge) {
      badgeHtml = `<span class="sn-badge">${this._esc(opts.badge)}</span>`;
    } else if (opts.colorValue) {
      const hex = opts.colorValue.toUpperCase();
      badgeHtml = `
        <span class="sn-badge">
          <span class="sn-badge-swatch" style="background:${opts.colorValue};"></span>
          ${this._esc(hex)}
        </span>`;
    }

    // ── Dismiss × button ──
    const dismissSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

    return `
      <div class="sn-stripe"></div>
      <div class="sn-shimmer"></div>
      <div class="sn-body">
        ${iconHtml}
        <div class="sn-text">
          <span class="sn-title">${this._esc(opts.title)}</span>
          ${descHtml}
          ${badgeHtml}
        </div>
        <button class="sn-dismiss" aria-label="Dismiss notification">${dismissSvg}</button>
      </div>
      <div class="sn-progress">
        <div class="sn-progress-fill"></div>
      </div>
    `;
  }

  /** Minimal HTML-escape to prevent XSS from device names etc. */
  private _esc(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private _createRoot(): void {
    this.root = document.createElement("div");
    this.root.id = "sn-root";
    document.body.appendChild(this.root);
  }

  private _injectStyles(): void {
    if (document.getElementById("sn-styles")) return;
    const el = document.createElement("style");
    el.id = "sn-styles";
    el.textContent = STYLES;
    document.head.appendChild(el);
  }
}

// ─── Convenience function (primary public API) ────────────────────────────────

/**
 * Display a floating 3D notification toast in the scene-creator.
 *
 * @example
 * sceneNotify({
 *   title:       "Fan turned on",
 *   description: "'Living Room Fan' is now running",
 *   severity:    "success",
 *   icon:        SN_ICONS.fan,
 *   iconBg:      "rgba(34,211,238,0.15)",
 *   iconFg:      "#22d3ee",
 * });
 */
export function sceneNotify(opts: SnOptions): string {
  return SceneNotificationManager.getInstance().show(opts);
}

/**
 * Programmatically remove a specific notification before it auto-dismisses.
 */
export function sceneNotifyDismiss(id: string): void {
  SceneNotificationManager.getInstance().dismiss(id);
}
