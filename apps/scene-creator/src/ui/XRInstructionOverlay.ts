// =============================================================================
// XRInstructionOverlay.ts
//
// Full-screen 2D "how-to" overlay that appears the moment the user enters an
// immersive XR session.  It acts like a game's introductory tutorial splash:
//   • fades in over ~400 ms
//   • auto-dismisses after AUTO_DISMISS_MS with a live countdown progress bar
//   • can be dismissed instantly by clicking "Got it" or tapping anywhere
//
// Pure DOM/CSS — no external dependencies.
// =============================================================================

const OVERLAY_ID = "xr-instruction-overlay";
const AUTO_DISMISS_MS = 15_000; // 15 seconds visible
const FADE_IN_MS = 400;
const FADE_OUT_MS = 600;

// ─── Inline SVG icons (subset reused from SceneNotification) ─────────────────

const ICONS = {
  hand: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,

  gesture: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 1 0 0 10A5 5 0 0 0 12 2z"/><path d="M12 12v10"/><path d="M8 18l4 4 4-4"/></svg>`,

  palmUp: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v4M10 2v5M12 2v5M14 2v5M16 3v4"/><path d="M8 7c0 0-3 1-3 5v1a7 7 0 0 0 14 0v-1c0-4-3-5-3-5H8z"/></svg>`,

  trigger: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>`,

  keyboard: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6.01" y2="10"/><line x1="10" y1="10" x2="10.01" y2="10"/><line x1="14" y1="10" x2="14.01" y2="10"/><line x1="18" y1="10" x2="18.01" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>`,

  click: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,

  grab: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>`,

  eye: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,

  house: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,

  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,

  xr: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/></svg>`,
} as const;

// ─── CSS ──────────────────────────────────────────────────────────────────────

const STYLE_ID = "xr-instruction-overlay-styles";

const CSS = `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483647; /* max z-index */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(248, 250, 252, 0);
  backdrop-filter: blur(56px) saturate(160%);
  -webkit-backdrop-filter: blur(56px) saturate(160%);
  transition: background ${FADE_IN_MS}ms ease, opacity ${FADE_OUT_MS}ms ease,
    backdrop-filter ${FADE_IN_MS}ms ease, -webkit-backdrop-filter ${FADE_IN_MS}ms ease;
  opacity: 0;
  padding: 24px 16px;
  box-sizing: border-box;
  overflow-y: auto;
  cursor: default;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

#${OVERLAY_ID}.xr-ol--visible {
  opacity: 1;
  background: rgba(248, 250, 252, 0.35);
  backdrop-filter: blur(56px) saturate(160%);
  -webkit-backdrop-filter: blur(56px) saturate(160%);
}

#${OVERLAY_ID}.xr-ol--fading {
  opacity: 0;
  pointer-events: none;
}

/* ── Inner card ──────────────────────────────────────────────────────────── */
.xr-ol__card {
  width: 100%;
  max-width: 760px;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(56px) saturate(160%);
  -webkit-backdrop-filter: blur(56px) saturate(160%);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 20px;
  padding: 36px 40px 28px;
  box-shadow:
    0 24px 64px rgba(15, 23, 42, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
  box-sizing: border-box;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.xr-ol__header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 8px;
}

.xr-ol__header-icon {
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: white;
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.4);
}

.xr-ol__title {
  color: #0f172a;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.3px;
  margin: 0;
  line-height: 1.2;
}

.xr-ol__subtitle {
  color: #475569;
  font-size: 13px;
  font-weight: 400;
  margin: 2px 0 0;
  letter-spacing: 0.2px;
}

/* ── Divider ─────────────────────────────────────────────────────────────── */
.xr-ol__divider {
  height: 1px;
  background: rgba(148, 163, 184, 0.35);
  margin: 22px 0;
}

/* ── Section label ──────────────────────────────────────────────────────── */
.xr-ol__section-label {
  color: #64748b;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  margin: 0 0 12px;
}

/* ── Grid of instruction cards ──────────────────────────────────────────── */
.xr-ol__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 0;
}

/* ── Individual instruction item ────────────────────────────────────────── */
.xr-ol__item {
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s;
}

.xr-ol__item:hover {
  border-color: rgba(100, 116, 139, 0.45);
}

.xr-ol__item-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.xr-ol__item-icon {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: white;
}

.xr-ol__item-icon--blue   { background: rgba(59, 130, 246, 0.18); color: #60a5fa; }
.xr-ol__item-icon--violet { background: rgba(124, 58, 237, 0.18); color: #a78bfa; }
.xr-ol__item-icon--emerald { background: rgba(16, 185, 129, 0.18); color: #34d399; }
.xr-ol__item-icon--amber  { background: rgba(245, 158, 11, 0.18); color: #fbbf24; }
.xr-ol__item-icon--rose   { background: rgba(244, 63, 94, 0.18);  color: #fb7185; }
.xr-ol__item-icon--cyan   { background: rgba(6, 182, 212, 0.18);  color: #22d3ee; }

.xr-ol__item-name {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  margin: 0;
}

.xr-ol__item-desc {
  color: #334155;
  font-size: 12px;
  line-height: 1.5;
  margin: 0;
}

/* ── Keyboard / badge chips ─────────────────────────────────────────────── */
.xr-ol__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}

.xr-ol__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.xr-ol__chip--key {
  background: rgba(226, 232, 240, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.45);
  color: #1e293b;
  font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
}

.xr-ol__chip--gesture {
  background: rgba(124, 58, 237, 0.2);
  border: 1px solid rgba(124, 58, 237, 0.38);
  color: #4c1d95;
}

.xr-ol__chip--controller {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.38);
  color: #1e3a8a;
}

/* ── Highlight "main panel" callout ─────────────────────────────────────── */
.xr-ol__callout {
  background: linear-gradient(135deg, rgba(59,130,246,0.24) 0%, rgba(124,58,237,0.22) 100%);
  border: 1px solid rgba(99, 102, 241, 0.5);
  border-radius: 12px;
  padding: 14px 18px;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 20px;
}

.xr-ol__callout-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: white;
}

.xr-ol__callout-body {}

.xr-ol__callout-title {
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  margin: 0 0 4px;
}

.xr-ol__callout-desc {
  color: #334155;
  font-size: 12px;
  line-height: 1.55;
  margin: 0 0 8px;
}

/* ── Footer: progress bar + dismiss button ──────────────────────────────── */
.xr-ol__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.xr-ol__progress-wrap {
  flex: 1;
  min-width: 120px;
}

.xr-ol__progress-label {
  color: #475569;
  font-size: 11px;
  margin-bottom: 5px;
}

.xr-ol__progress-track {
  height: 3px;
  background: rgba(148, 163, 184, 0.28);
  border-radius: 99px;
  overflow: hidden;
}

.xr-ol__progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #7c3aed);
  border-radius: 99px;
  width: 100%;
  transition: none; /* driven by JS */
}

.xr-ol__dismiss-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 22px;
  background: linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: opacity 0.15s, transform 0.15s;
  letter-spacing: 0.1px;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.35);
}

.xr-ol__dismiss-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(124, 58, 237, 0.45);
}

.xr-ol__dismiss-btn:active {
  transform: translateY(0);
  opacity: 1;
}

/* ── Responsive tweaks ──────────────────────────────────────────────────── */
@media (max-width: 520px) {
  .xr-ol__card {
    padding: 24px 20px 20px;
  }
  .xr-ol__title {
    font-size: 18px;
  }
  .xr-ol__grid {
    grid-template-columns: 1fr 1fr;
  }
  .xr-ol__footer {
    flex-direction: column;
    align-items: stretch;
  }
  .xr-ol__dismiss-btn {
    justify-content: center;
  }
}
`;

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHTML(): string {
  return /* html */ `
<div class="xr-ol__card" role="dialog" aria-modal="true" aria-label="XR Mode Instructions">

  <!-- ── Header ─────────────────────────────────────────────────────────── -->
  <div class="xr-ol__header">
    <div class="xr-ol__header-icon">${ICONS.xr}</div>
    <div>
      <h2 class="xr-ol__title">You're now in Immersive 3D&thinsp;/&thinsp;AR Mode</h2>
      <p class="xr-ol__subtitle">Here's everything you can do. It takes 5 seconds — we promise.</p>
    </div>
  </div>

  <div class="xr-ol__divider"></div>

  <!-- ── Callout: Main control panel ───────────────────────────────────── -->
  <p class="xr-ol__section-label">Control Panel</p>
  <div class="xr-ol__callout">
    <div class="xr-ol__callout-icon">${ICONS.house}</div>
    <div class="xr-ol__callout-body">
      <p class="xr-ol__callout-title">Summon the SmartHome Panel</p>
      <p class="xr-ol__callout-desc">
        Your main control panel (devices, room alignment, settings) can be
        pulled up at any time using the shortcuts below.
      </p>
      <div class="xr-ol__chips">
        <span class="xr-ol__chip xr-ol__chip--key">Y&nbsp;—&nbsp;summon in front</span>
        <span class="xr-ol__chip xr-ol__chip--key">U&nbsp;—&nbsp;toggle on/off</span>
        <span class="xr-ol__chip xr-ol__chip--controller">Trigger button (controller)</span>
        <span class="xr-ol__chip xr-ol__chip--gesture">Palm-up gesture</span>
        <span class="xr-ol__chip xr-ol__chip--gesture">Point &amp; curl gesture</span>
      </div>
    </div>
  </div>

  <!-- ── Instruction grid ────────────────────────────────────────────── -->
  <p class="xr-ol__section-label">Interactions</p>
  <div class="xr-ol__grid">

    <!-- Hand gestures -->
    <div class="xr-ol__item">
      <div class="xr-ol__item-header">
        <div class="xr-ol__item-icon xr-ol__item-icon--violet">${ICONS.palmUp}</div>
        <p class="xr-ol__item-name">Hand Gestures</p>
      </div>
      <p class="xr-ol__item-desc">
        Hold your palm <strong style="color:#c4b5fd">face-up</strong> to summon the panel.
        Or extend your index finger toward the scene (come-here gesture).
      </p>
    </div>

    <!-- Controller -->
    <div class="xr-ol__item">
      <div class="xr-ol__item-header">
        <div class="xr-ol__item-icon xr-ol__item-icon--blue">${ICONS.trigger}</div>
        <p class="xr-ol__item-name">Controller Trigger</p>
      </div>
      <p class="xr-ol__item-desc">
        Press the <strong style="color:#93c5fd">primary trigger</strong> on either
        Meta Quest controller to instantly summon the panel in front of you.
      </p>
    </div>

    <!-- Tap devices -->
    <div class="xr-ol__item">
      <div class="xr-ol__item-header">
        <div class="xr-ol__item-icon xr-ol__item-icon--emerald">${ICONS.click}</div>
        <p class="xr-ol__item-name">Tap to Control</p>
      </div>
      <p class="xr-ol__item-desc">
        Tap (or point &amp; click) any smart device in the scene to open its
        dedicated control panel.
      </p>
    </div>

    <!-- Grab devices -->
    <div class="xr-ol__item">
      <div class="xr-ol__item-header">
        <div class="xr-ol__item-icon xr-ol__item-icon--amber">${ICONS.grab}</div>
        <p class="xr-ol__item-name">Grab to Move</p>
      </div>
      <p class="xr-ol__item-desc">
        Reach out and <strong style="color:#fbbf24">grab any device</strong> to
        reposition it anywhere in your real space.
      </p>
    </div>

    <!-- Look around -->
    <div class="xr-ol__item">
      <div class="xr-ol__item-header">
        <div class="xr-ol__item-icon xr-ol__item-icon--cyan">${ICONS.eye}</div>
        <p class="xr-ol__item-name">Look Around</p>
      </div>
      <p class="xr-ol__item-desc">
        Simply move your head to explore the 3D room.
        The scene overlays your physical environment.
      </p>
    </div>

    <!-- Keyboard shortcuts -->
    <div class="xr-ol__item">
      <div class="xr-ol__item-header">
        <div class="xr-ol__item-icon xr-ol__item-icon--rose">${ICONS.keyboard}</div>
        <p class="xr-ol__item-name">Keyboard Shortcuts</p>
      </div>
      <p class="xr-ol__item-desc">
        Use <code style="color:#fb7185;background:rgba(244,63,94,0.12);padding:1px 5px;border-radius:4px">Y</code> to summon &amp;
        <code style="color:#fb7185;background:rgba(244,63,94,0.12);padding:1px 5px;border-radius:4px">U</code> to toggle the panel.
        <code style="color:#fb7185;background:rgba(244,63,94,0.12);padding:1px 5px;border-radius:4px">I/J/K/L</code> move your avatar.
      </p>
    </div>

  </div>

  <!-- ── Footer ──────────────────────────────────────────────────────────── -->
  <div class="xr-ol__footer">
    <div class="xr-ol__progress-wrap">
      <div class="xr-ol__progress-label" id="xr-ol-countdown">
        Closing in <strong id="xr-ol-secs">${AUTO_DISMISS_MS / 1000}</strong>s
        &nbsp;·&nbsp; tap or click anywhere to dismiss
      </div>
      <div class="xr-ol__progress-track">
        <div class="xr-ol__progress-bar" id="xr-ol-bar"></div>
      </div>
    </div>

    <button class="xr-ol__dismiss-btn" id="xr-ol-dismiss-btn" type="button">
      Got&nbsp;it ${ICONS.arrowRight}
    </button>
  </div>

</div>
  `.trim();
}

// ─── Manager class ────────────────────────────────────────────────────────────

class XRInstructionOverlayManager {
  private overlay: HTMLElement | null = null;
  private bar: HTMLElement | null = null;
  private secsEl: HTMLElement | null = null;
  private rafId: number | null = null;
  private startTime = 0;
  private dismissing = false;

  /** Inject CSS once into <head>. */
  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /** Build and mount the overlay DOM. */
  private mount(): void {
    // Guard: don't create duplicates
    if (document.getElementById(OVERLAY_ID)) return;

    this.injectStyles();

    const el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = buildHTML();
    document.body.appendChild(el);

    this.overlay = el;
    this.bar = el.querySelector<HTMLElement>("#xr-ol-bar");
    this.secsEl = el.querySelector<HTMLElement>("#xr-ol-secs");
    this.dismissing = false;

    // Dismiss on click anywhere on the overlay (backdrop or card)
    el.addEventListener("click", () => this.dismiss());

    // Block pointer events from leaking through to the canvas
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  /** Animate the progress bar and countdown label with requestAnimationFrame. */
  private animateProgress(): void {
    const tick = (now: number) => {
      if (!this.overlay || this.dismissing) return;

      const elapsed = now - this.startTime;
      const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
      const progress = 1 - elapsed / AUTO_DISMISS_MS; // 1 → 0

      // Update bar width
      if (this.bar) {
        this.bar.style.width = `${Math.max(0, progress * 100).toFixed(2)}%`;
      }

      // Update countdown seconds
      if (this.secsEl) {
        const secs = Math.ceil(remaining / 1000);
        if (this.secsEl.textContent !== String(secs)) {
          this.secsEl.textContent = String(secs);
        }
      }

      if (remaining > 0) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.dismiss();
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  /** Fade out and remove the overlay. */
  dismiss(): void {
    if (!this.overlay || this.dismissing) return;
    this.dismissing = true;

    // Cancel the rAF loop
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const el = this.overlay;
    el.classList.add("xr-ol--fading");
    el.classList.remove("xr-ol--visible");

    const onEnd = () => {
      el.removeEventListener("transitionend", onEnd);
      if (el.parentNode) el.parentNode.removeChild(el);
      this.overlay = null;
      this.bar = null;
      this.secsEl = null;
    };

    el.addEventListener("transitionend", onEnd);

    // Safety: remove after fade-out duration even if transitionend doesn't fire
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      this.overlay = null;
    }, FADE_OUT_MS + 100);
  }

  /** Public: show the overlay (idempotent). */
  show(): void {
    // Remove any stale instance first
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) existing.remove();

    this.mount();

    // Schedule the fade-in on the next paint so the initial opacity:0 is committed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.overlay) return;
        this.overlay.classList.add("xr-ol--visible");
        this.startTime = performance.now();
        this.animateProgress();
      });
    });

    console.log("[XRInstructionOverlay] ✅ Instruction overlay shown");
  }

  /** Returns true if the overlay is currently displayed. */
  isVisible(): boolean {
    return this.overlay !== null && !this.dismissing;
  }
}

// ─── Singleton instance ───────────────────────────────────────────────────────

const _manager = new XRInstructionOverlayManager();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Show the full-screen XR instruction overlay.
 *
 * Call this when the user enters an immersive XR session.
 * The overlay auto-dismisses after AUTO_DISMISS_MS and can
 * be dismissed early by clicking "Got it" or tapping the backdrop.
 *
 * @example
 * renderer.xr.addEventListener("sessionstart", () => showXRInstructionOverlay());
 */
export function showXRInstructionOverlay(): void {
  _manager.show();
}

/**
 * Programmatically dismiss the overlay before it auto-closes.
 */
export function dismissXRInstructionOverlay(): void {
  _manager.dismiss();
}

/**
 * Returns true if the overlay is currently on screen.
 */
export function isXRInstructionOverlayVisible(): boolean {
  return _manager.isVisible();
}
