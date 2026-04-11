import type { SlimeVRBridgeMessage, SlimeVRFrameMessage } from "./types";

export function resolveSlimeVRWebSocketUrl(): string | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("slimevrWs");
  if (q) return q.trim();
  const env = (
    import.meta as ImportMeta & { env?: { VITE_SLIMEVR_WS?: string } }
  ).env?.VITE_SLIMEVR_WS;
  if (env && env.trim()) return env.trim();
  const definedEnv = process.env.VITE_SLIMEVR_WS;
  if (definedEnv && definedEnv.trim()) return definedEnv.trim();
  return null;
}

export class SlimeVRClient {
  private ws: WebSocket | null = null;
  private url: string;
  private latest: SlimeVRFrameMessage | null = null;
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onDisconnect?: () => void;

  constructor(url: string, onDisconnect?: () => void) {
    // Detect if we are on HTTPS and upgrade the websocket protocol automatically
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:"
    ) {
      this.url = url.replace(/^ws:\/\//i, "wss://");
    } else {
      this.url = url;
    }

    this.onDisconnect = onDisconnect;
  }

  connect(): void {
    this.clearReconnect();
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      const socket = new WebSocket(this.url);
      this.ws = socket;

      socket.onopen = () => {
        this.connected = true;
        console.log("[SlimeVRClient] Connected:", this.url);
      };

      socket.onclose = () => {
        this.connected = false;
        this.ws = null;
        console.warn("[SlimeVRClient] Disconnected, retry in 3s");
        this.onDisconnect?.();
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };

      socket.onerror = () => {
        socket.close();
      };

      socket.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as SlimeVRBridgeMessage;
          if (data.type === "slimevr_frame") {
            this.latest = data;
          }
        } catch {
          /* ignore */
        }
      };
    } catch (e) {
      console.error("[SlimeVRClient] connect failed:", e);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
  }

  disconnect(): void {
    this.clearReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.latest = null;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getLatestFrame(): SlimeVRFrameMessage | null {
    return this.latest;
  }
}
