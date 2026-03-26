type MessageHandler = (data: any) => void;

import { useAuthStore } from "@/stores/auth";
import { useNotificationStore } from "@/stores/notification_store";

export class WebSocketService {
  private static instance: WebSocketService;
  private socket: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectInterval: number = 3000;
  private shouldReconnect: boolean = true;
  private pingInterval: any = null;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  connect() {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    )
      return;

    this.shouldReconnect = true;
    const backendUrl =
      import.meta.env.VITE_BACKEND_URL || "https://localhost:5500";
    let wsUrl = backendUrl.replace(/^http/, "ws") + "/ws/homes/";

    // Append token as query parameter for reliable cross-origin auth
    const token = useAuthStore.getState().token;
    if (token) {
      wsUrl += `?token=${token}`;
    }

    console.log("[WebSocket] Connecting to:", wsUrl);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log("[WebSocket] Connected");
      this.startHeartbeat();
      useNotificationStore.getState().addNotification({
        category: "system",
        iconType: "system_connected",
        title: "Connected to Smart Home",
        description: "Real-time device sync is active",
        severity: "success",
      });
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

    this.socket.onclose = () => {
      console.log("[WebSocket] Disconnected");
      this.stopHeartbeat();
      this.socket = null;
      if (this.shouldReconnect) {
        useNotificationStore.getState().addNotification({
          category: "system",
          iconType: "system_disconnected",
          title: "Connection lost",
          description: "Lost connection to Smart Home hub — reconnecting…",
          severity: "warning",
        });
        setTimeout(() => this.connect(), this.reconnectInterval);
      }
    };

    this.socket.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      this.socket?.close();
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
  }

  subscribe(handler: MessageHandler) {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private notifyListeners(data: any) {
    this.listeners.forEach((handler) => handler(data));
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ action: "ping" }));
      }
    }, 30000); // 30 seconds
  }

  private stopHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
  }
}
