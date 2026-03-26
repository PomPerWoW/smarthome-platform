/**
 * DialogueOverlay – A chat-style conversation UI that appears when the user
 * activates the voice assistant.  It slides in from the right side of the
 * screen and shows chat bubbles for the robot assistant and the user.
 */

export class DialogueOverlay {
  private overlay: HTMLDivElement;
  private messagesEl: HTMLDivElement;
  private typingEl: HTMLDivElement;
  private statusEl: HTMLElement;
  private visible = false;

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
      ".da-status",
    )! as HTMLElement;
    document.body.appendChild(this.overlay);
  }

  /* ── Styles (injected once) ─────────────────────────────── */

  private injectStyles(): void {
    if (document.getElementById("dialogue-overlay-styles")) return;

    const style = document.createElement("style");
    style.id = "dialogue-overlay-styles";
    style.textContent = `
      /* ── Animations ─────────────────── */
      @keyframes da-slideIn {
        from { opacity: 0; transform: translateX(40px) scale(0.95); }
        to   { opacity: 1; transform: translateX(0)   scale(1); }
      }
      @keyframes da-slideOut {
        from { opacity: 1; transform: translateX(0)   scale(1); }
        to   { opacity: 0; transform: translateX(40px) scale(0.95); }
      }
      @keyframes da-msgIn {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes da-dot {
        0%, 60%, 100% { transform: translateY(0); }
        30%           { transform: translateY(-5px); }
      }
      @keyframes da-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.4); }
        50%      { box-shadow: 0 0 0 5px rgba(74,222,128,0); }
      }

      /* ── Container ──────────────────── */
      #dialogue-overlay {
        position: fixed;
        bottom: 100px;
        right: 24px;
        width: 370px;
        max-height: 520px;
        background: rgba(15, 23, 42, 0.88);
        backdrop-filter: blur(40px);
        -webkit-backdrop-filter: blur(40px);
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow:
          0 24px 64px rgba(0, 0, 0, 0.45),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 100000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        pointer-events: auto;
      }
      #dialogue-overlay.da-hidden {
        animation: da-slideOut 0.32s cubic-bezier(.4,0,.6,1) forwards;
        pointer-events: none;
      }
      #dialogue-overlay.da-visible {
        animation: da-slideIn 0.4s cubic-bezier(.16,1,.3,1) forwards;
      }

      /* ── Header ─────────────────────── */
      .da-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.04);
      }
      .da-avatar {
        width: 44px; height: 44px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6, #8b5cf6);
        display: flex; align-items: center; justify-content: center;
        font-size: 22px;
        flex-shrink: 0;
        box-shadow: 0 2px 10px rgba(59,130,246,0.35);
      }
      .da-info   { flex: 1; }
      .da-name   {
        color: #f8fafc; font-weight: 600; font-size: 15px;
        letter-spacing: -0.3px;
      }
      .da-status {
        color: #4ade80; font-size: 12px; margin-top: 2px;
        display: flex; align-items: center; gap: 6px;
      }
      .da-status-dot {
        width: 7px; height: 7px;
        background: #4ade80;
        border-radius: 50%;
        display: inline-block;
        animation: da-pulse 2s infinite;
      }

      /* ── Messages ───────────────────── */
      .da-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px 18px;
        display: flex; flex-direction: column; gap: 10px;
        max-height: 340px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.12) transparent;
      }
      .da-messages::-webkit-scrollbar       { width: 4px; }
      .da-messages::-webkit-scrollbar-thumb  { background: rgba(255,255,255,0.12); border-radius: 4px; }

      .da-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 13.5px;
        line-height: 1.55;
        animation: da-msgIn 0.28s ease;
        word-wrap: break-word;
      }
      .da-msg-assistant {
        background: rgba(59, 130, 246, 0.22);
        border: 1px solid rgba(96, 165, 250, 0.35);
        color: #f1f5f9;
        align-self: flex-start;
        border-bottom-left-radius: 6px;
      }
      .da-msg-user {
        background: rgba(139, 92, 246, 0.24);
        border: 1px solid rgba(167, 139, 250, 0.4);
        color: #faf5ff;
        align-self: flex-end;
        border-bottom-right-radius: 6px;
      }
      .da-msg-system {
        background: rgba(250,204,21,0.08);
        border: 1px solid rgba(250,204,21,0.12);
        color: #fde68a;
        align-self: center;
        font-size: 12px;
        text-align: center;
        border-radius: 12px;
        padding: 6px 14px;
      }

      /* ── Typing indicator ───────────── */
      .da-typing {
        padding: 8px 20px 14px;
        display: none;
        align-items: center;
        gap: 5px;
      }
      .da-typing.da-active { display: flex; }
      .da-typing span.da-dot-anim {
        width: 7px; height: 7px;
        background: rgba(59,130,246,0.55);
        border-radius: 50%;
        animation: da-dot 1.2s infinite;
      }
      .da-typing span.da-dot-anim:nth-child(2) { animation-delay: 0.15s; }
      .da-typing span.da-dot-anim:nth-child(3) { animation-delay: 0.3s; }
      .da-typing-label {
        color: #cbd5e1;
        font-size: 11.5px;
        margin-left: 5px;
      }
    `;
    document.head.appendChild(style);
  }

  /* ── DOM creation ───────────────────────────────────────── */

  private createOverlay(): HTMLDivElement {
    const el = document.createElement("div");
    el.id = "dialogue-overlay";
    el.style.display = "none";
    el.innerHTML = `
      <div class="da-header">
        <div class="da-avatar">🤖</div>
        <div class="da-info">
          <div class="da-name">Smart Home Assistant</div>
          <div class="da-status">
            <span class="da-status-dot"></span>
            <span class="da-status-text">Active</span>
          </div>
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
    return el;
  }

  /* ── Public API ─────────────────────────────────────────── */

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
    }, 350);
  }

  setStatus(text: string, color?: string): void {
    const textEl = this.overlay.querySelector(".da-status-text") as HTMLElement;
    const dotEl = this.overlay.querySelector(".da-status-dot") as HTMLElement;
    if (textEl) textEl.textContent = text;
    if (color) {
      if (textEl) textEl.style.color = color;
      if (dotEl) dotEl.style.background = color;
    }
  }

  addAssistantMessage(text: string): void {
    const msg = document.createElement("div");
    msg.className = "da-msg da-msg-assistant";
    msg.textContent = text;
    this.messagesEl.appendChild(msg);
    this.scrollToBottom();
  }

  addUserMessage(text: string): void {
    const msg = document.createElement("div");
    msg.className = "da-msg da-msg-user";
    msg.textContent = text;
    this.messagesEl.appendChild(msg);
    this.scrollToBottom();
  }

  addSystemMessage(text: string): void {
    const msg = document.createElement("div");
    msg.className = "da-msg da-msg-system";
    msg.textContent = text;
    this.messagesEl.appendChild(msg);
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
    this.messagesEl.innerHTML = "";
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
