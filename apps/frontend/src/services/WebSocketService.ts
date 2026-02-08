type MessageHandler = (data: any) => void;

export class WebSocketService {
  private static instance: WebSocketService;
  private socket: WebSocket | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectInterval: number = 3000;
  private shouldReconnect: boolean = true;

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
    const wsUrl = backendUrl.replace(/^http/, "ws") + "/ws/homes/";

    console.log("[WebSocket] Connecting to:", wsUrl);

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log("[WebSocket] Connected");
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
      this.socket = null;
      if (this.shouldReconnect) {
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
}
