import { config } from "../config/env";

type MessageHandler = (data: any) => void;

export class WebSocketClient {
  private static instance: WebSocketClient;
  private socket: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectInterval: number = 3000;
  private shouldReconnect: boolean = true;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private pingInterval: any = null;

  private cachedToken: string | null = null;

  private constructor() {}

  static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  connect(token?: string): void {
    if (token) this.cachedToken = token;

    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      console.log("[WebSocket] Already connected or connecting");
      return;
    }

    this.shouldReconnect = true;
    const backendUrl = config.BACKEND_URL;
    // Convert https:// to wss:// or http:// to ws://
    let wsUrl = backendUrl.replace(/^http/, "ws") + "/ws/homes/";

    // Append token as query parameter for reliable cross-origin auth
    if (this.cachedToken) {
      wsUrl += `?token=${this.cachedToken}`;
    }

    console.log("[WebSocket] Connecting to:", wsUrl);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log("[WebSocket] Connected successfully");
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[WebSocket] Message received:", data);
        this.notifyListeners(data);
      } catch (e) {
        console.error("[WebSocket] Failed to parse message:", event.data);
      }
    };

    this.socket.onclose = (event) => {
      console.log("[WebSocket] Disconnected:", event.code, event.reason);
      this.stopHeartbeat();
      this.socket = null;

      if (
        this.shouldReconnect &&
        this.reconnectAttempts < this.maxReconnectAttempts
      ) {
        this.reconnectAttempts++;
        console.log(
          `[WebSocket] Reconnecting in ${this.reconnectInterval}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
        );
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    };

    this.socket.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      this.socket?.close();
    };
  }

  disconnect(): void {
    console.log("[WebSocket] Disconnecting...");
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
  }

  subscribe(handler: MessageHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private notifyListeners(data: any): void {
    this.listeners.forEach((handler) => handler(data));
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ action: "ping" }));
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
  }
}

export const getWebSocketClient = (): WebSocketClient => {
  return WebSocketClient.getInstance();
};
