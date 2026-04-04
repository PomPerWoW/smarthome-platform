/**
 * DialogueOverlay – Floating conversation panel (parity with apps/frontend Dialogue.tsx):
 * scrollable thread of labeled user / robot bubbles, header with clear, muted robot styling
 * and primary-style user messages. Interim speech updates a single pending user row instead
 * of stacking duplicates.
 */

export class DialogueOverlay {
  private overlay: HTMLDivElement;
  private messagesEl: HTMLDivElement;
  private typingEl: HTMLDivElement;
  private statusEl: HTMLElement;
  private visible = false;
  /** Live transcript row while listening — one bubble, updated in place */
  private pendingUserRow: HTMLDivElement | null = null;

  constructor() {
    this.injectStyles();
    this.overlay = this.createOverlay();
    this.messagesEl = this.overlay.querySelector(
      ".da-messages",
    )! as HTMLDivElement;
    this.typingEl = this.overlay.querySelector(
      ".da-typing",
    )! as HTMLDivElement;
    this.statusEl = this.overlay.querySelector(
      ".da-status-text",
    )! as HTMLElement;
    document.body.appendChild(this.overlay);
  }

  /* ── Styles (injected once) ─────────────────────────────── */

  private injectStyles(): void {
    if (document.getElementById("dialogue-overlay-styles")) return;

    const style = document.createElement("style");
    style.id = "dialogue-overlay-styles";
    style.textContent = `
      @keyframes da-slideIn {
        from { opacity: 0; transform: translateX(40px) scale(0.95); }
        to   { opacity: 1; transform: translateX(0)   scale(1); }
      }
      @keyframes da-slideOut {
        from { opacity: 1; transform: translateX(0)   scale(1); }
        to   { opacity: 0; transform: translateX(40px) scale(0.95); }
      }
      @keyframes da-msgIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes da-dot {
        0%, 60%, 100% { transform: translateY(0); }
        30%           { transform: translateY(-4px); }
      }

      #dialogue-overlay {
        position: fixed;
        bottom: 120px;
        right: 24px;
        width: 320px;
        max-height: 400px;
        display: flex;
        flex-direction: column;
        background: rgba(9, 9, 11, 0.94);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 100000;
        overflow: hidden;
        pointer-events: auto;
      }
      #dialogue-overlay.da-hidden {
        animation: da-slideOut 0.28s cubic-bezier(.4,0,.6,1) forwards;
        pointer-events: none;
      }
      #dialogue-overlay.da-visible {
        animation: da-slideIn 0.35s cubic-bezier(.16,1,.3,1) forwards;
      }

      .da-top {
        flex-shrink: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.03);
      }
      .da-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        gap: 8px;
      }
      .da-title {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: #fafafa;
        letter-spacing: -0.02em;
      }
      .da-clear {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #a1a1aa;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .da-clear:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #fafafa;
      }
      .da-clear:focus-visible {
        outline: 2px solid #3b82f6;
        outline-offset: 1px;
      }
      .da-status-bar {
        padding: 0 12px 8px;
        font-size: 11px;
        color: #a1a1aa;
        min-height: 16px;
      }
      .da-status-text { color: inherit; }

      .da-messages {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.15) transparent;
      }
      .da-messages::-webkit-scrollbar { width: 5px; }
      .da-messages::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12);
        border-radius: 4px;
      }

      .da-row {
        display: flex;
        animation: da-msgIn 0.22s ease;
      }
      .da-row-user { justify-content: flex-end; }
      .da-row-assistant { justify-content: flex-start; }

      .da-bubble {
        max-width: 80%;
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 13px;
        line-height: 1.45;
        word-wrap: break-word;
      }
      .da-bubble-label {
        font-size: 11px;
        font-weight: 500;
        margin-bottom: 4px;
        opacity: 0.7;
      }
      .da-bubble-text { white-space: pre-wrap; }

      /* User: primary-style (matches frontend bg-primary) */
      .da-bubble-user {
        background: #2563eb;
        color: #fafafa;
      }
      .da-bubble-user .da-bubble-label { color: rgba(255,255,255,0.85); }

      /* Robot: muted (matches frontend bg-muted / text-muted) */
      .da-bubble-assistant {
        background: rgba(255, 255, 255, 0.08);
        color: #d4d4d8;
      }
      .da-bubble-assistant .da-bubble-label { color: #a1a1aa; }

      .da-pending-user {
        opacity: 0.88;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12);
      }

      .da-row-system {
        justify-content: center;
      }
      .da-bubble-system {
        max-width: 92%;
        background: rgba(250, 204, 21, 0.1);
        border: 1px solid rgba(250, 204, 21, 0.2);
        color: #fde68a;
        font-size: 11.5px;
        text-align: center;
        border-radius: 8px;
        padding: 6px 12px;
      }

      .da-typing {
        flex-shrink: 0;
        padding: 6px 12px 10px;
        display: none;
        align-items: center;
        gap: 5px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .da-typing.da-active { display: flex; }
      .da-typing span.da-dot-anim {
        width: 5px;
        height: 5px;
        background: #71717a;
        border-radius: 50%;
        animation: da-dot 1.1s infinite;
      }
      .da-typing span.da-dot-anim:nth-child(2) { animation-delay: 0.12s; }
      .da-typing span.da-dot-anim:nth-child(3) { animation-delay: 0.24s; }
      .da-typing-label {
        color: #a1a1aa;
        font-size: 11px;
        margin-left: 4px;
      }

      .da-scroll-anchor {
        height: 1px;
        width: 100%;
        flex-shrink: 0;
      }
    `;
    document.head.appendChild(style);
  }

  private createOverlay(): HTMLDivElement {
    const el = document.createElement("div");
    el.id = "dialogue-overlay";
    el.style.display = "none";
    el.innerHTML = `
      <div class="da-top">
        <div class="da-header-row">
          <h3 class="da-title">Conversation</h3>
          <button type="button" class="da-clear" aria-label="Clear conversation" title="Clear">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="da-status-bar">
          <span class="da-status-text">Ready</span>
        </div>
      </div>
      <div class="da-messages"></div>
      <div class="da-typing">
        <span class="da-dot-anim"></span>
        <span class="da-dot-anim"></span>
        <span class="da-dot-anim"></span>
        <span class="da-typing-label">Listening…</span>
      </div>
    `;

    const clearBtn = el.querySelector(".da-clear") as HTMLButtonElement;
    clearBtn.addEventListener("click", () => this.clearThread());

    return el;
  }

  /** Clear all messages and pending draft (header stays; matches frontend clear). */
  clearThread(): void {
    this.clearLiveUserTranscript();
    this.messagesEl.innerHTML = "";
    this.scrollToBottom();
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.overlay.style.display = "flex";
    this.overlay.classList.remove("da-hidden");
    this.overlay.classList.add("da-visible");
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.overlay.classList.remove("da-visible");
    this.overlay.classList.add("da-hidden");
    setTimeout(() => {
      if (!this.visible) {
        this.overlay.style.display = "none";
        this.clearMessages();
      }
    }, 320);
  }

  setStatus(text: string, color?: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
      this.statusEl.style.color = color ?? "#a1a1aa";
    }
  }

  addAssistantMessage(text: string): void {
    const row = document.createElement("div");
    row.className = "da-row da-row-assistant";
    row.innerHTML = `
      <div class="da-bubble da-bubble-assistant">
        <div class="da-bubble-label">Robot Assistant</div>
        <div class="da-bubble-text"></div>
      </div>
    `;
    (row.querySelector(".da-bubble-text") as HTMLElement).textContent = text;
    this.messagesEl.appendChild(row);
    this.scrollToBottom();
  }

  addUserMessage(text: string): void {
    const row = document.createElement("div");
    row.className = "da-row da-row-user";
    row.innerHTML = `
      <div class="da-bubble da-bubble-user">
        <div class="da-bubble-label">You</div>
        <div class="da-bubble-text"></div>
      </div>
    `;
    (row.querySelector(".da-bubble-text") as HTMLElement).textContent = text;
    this.messagesEl.appendChild(row);
    this.scrollToBottom();
  }

  addSystemMessage(text: string): void {
    const row = document.createElement("div");
    row.className = "da-row da-row-system";
    const bubble = document.createElement("div");
    bubble.className = "da-bubble-system";
    bubble.textContent = text;
    row.appendChild(bubble);
    this.messagesEl.appendChild(row);
    this.scrollToBottom();
  }

  /**
   * Update or create a single user bubble while the mic is open (interim + final transcript
   * stream). Avoids stacking dozens of duplicate bubbles like the old addUserMessage-per-event.
   */
  setLiveUserTranscript(text: string): void {
    const raw = text.replace(/\.\.\.$/, "");
    const display = raw.trim() || "…";

    if (!this.pendingUserRow) {
      const row = document.createElement("div");
      row.className = "da-row da-row-user";
      row.innerHTML = `
        <div class="da-bubble da-bubble-user da-pending-user">
          <div class="da-bubble-label">You</div>
          <div class="da-bubble-text"></div>
        </div>
      `;
      this.messagesEl.appendChild(row);
      this.pendingUserRow = row;
    }
    const textEl = this.pendingUserRow.querySelector(
      ".da-bubble-text",
    ) as HTMLElement;
    if (textEl) textEl.textContent = display;
    this.scrollToBottom();
  }

  clearLiveUserTranscript(): void {
    if (this.pendingUserRow) {
      this.pendingUserRow.remove();
      this.pendingUserRow = null;
    }
  }

  /**
   * Turn the live user bubble into a committed message (or append one if none was shown).
   */
  finalizeLiveUserTranscript(finalText: string): void {
    let t = finalText.replace(/\.\.\.$/, "").trim();
    if (!t && this.pendingUserRow) {
      const el = this.pendingUserRow.querySelector(
        ".da-bubble-text",
      ) as HTMLElement | null;
      const fromDom = el?.textContent?.trim() ?? "";
      if (fromDom && fromDom !== "…") t = fromDom;
    }
    if (this.pendingUserRow) {
      const bubble = this.pendingUserRow.querySelector(
        ".da-bubble-user",
      ) as HTMLElement;
      bubble?.classList.remove("da-pending-user");
      const textEl = this.pendingUserRow.querySelector(
        ".da-bubble-text",
      ) as HTMLElement;
      if (textEl) textEl.textContent = t || "…";
      this.pendingUserRow = null;
    } else if (t.length >= 1) {
      this.addUserMessage(t);
    }
    this.scrollToBottom();
  }

  showTyping(label?: string): void {
    this.typingEl.classList.add("da-active");
    const lbl = this.typingEl.querySelector(".da-typing-label") as HTMLElement;
    if (lbl) lbl.textContent = label ?? "Listening…";
  }

  hideTyping(): void {
    this.typingEl.classList.remove("da-active");
  }

  clearMessages(): void {
    this.clearThread();
  }

  isVisible(): boolean {
    return this.visible;
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  destroy(): void {
    this.overlay.remove();
    const style = document.getElementById("dialogue-overlay-styles");
    if (style) style.remove();
  }
}
