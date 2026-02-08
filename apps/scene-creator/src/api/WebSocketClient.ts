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

  private constructor() {}

  static getInstance(): WebSocketClient {
    if (!WebSocketClient.instance) {
      WebSocketClient.instance = new WebSocketClient();
    }
    return WebSocketClient.instance;
  }

  connect(): void {
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
    const wsUrl = backendUrl.replace(/^http/, "ws") + "/ws/homes/";

    console.log("[WebSocket] Connecting to:", wsUrl);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log("[WebSocket] Connected successfully");
      this.reconnectAttempts = 0;
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
}

export const getWebSocketClient = (): WebSocketClient => {
  return WebSocketClient.getInstance();
};
