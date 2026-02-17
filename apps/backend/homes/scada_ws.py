import json
import threading
import ssl
import requests
import websocket


class WebSocket2Scada:
    """
    Lightweight SCADA websocket client (object-based, not a Thread subclass).
    - Auth via REST to get a token (cached if still valid)
    - Opens a single WebSocket connection on start()
    - Calls on_tag(tag, value, at) when notifications arrive
    - send_value(tag, value) to write tags
    """

    def __init__(
        self,
        target: str,
        login: str,
        password: str,
        token: str,
        tags: list[str] | None = None,
        on_tag=None,  # callback: (tag: str, value: Any, at: str) -> None
        verify_tls: bool = False,
    ):
        self.target = target.strip()  # e.g. "intelligentbuilding.io:6443"
        self.login = login
        self.password = password
        self.token = token
        self.tags = tags or []
        self.on_tag = on_tag
        self.verify_tls = verify_tls

        self._ws = None
        self._thread: threading.Thread | None = None
        self._connected = False
        self._lock = threading.Lock()

    # ---------- Auth ----------
    def _check_token(self) -> bool:
        if not self.token:
            return False
        try:
            hdr = {"authorization": f"Token {self.token}"}
            r = requests.get(
                f"https://{self.target}/restapi/users/userinfo/",
                headers=hdr,
                verify=self.verify_tls,
            )
            return r.status_code == 200
        except Exception:
            return False

    def _login(self) -> bool:
        try:
            r = requests.post(
                f"https://{self.target}/restapi/api-token-auth/",
                data={"username": self.login, "password": self.password},
                verify=self.verify_tls,
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                self.token = data.get("token")
                return self.token is not None
        except Exception:
            pass
        self.token = None
        return False

    def _ensure_token(self) -> bool:
        if self._check_token():
            return True
        return self._login()

    # ---------- WebSocket handlers ----------
    def _on_message(self, ws, message: str):
        print(f"[SCADA_WS] message: {message}")
        try:
            # Try parsing as wrapped message first
            try:
                envelope = json.loads(message)
                if "message" in envelope and isinstance(envelope["message"], str):
                    payload = json.loads(envelope["message"])
                else:
                    payload = envelope
            except json.JSONDecodeError:
                print("[SCADA_WS] JSON decode error")
                return

            print(f"[SCADA_WS] payload: {payload}")

            # Handle notify_tag
            if payload.get("type") == "notify_tag":
                tag = payload.get("tag")
                value = payload.get("value")
                at = payload.get("time")
                if self.on_tag:
                    self.on_tag(tag, value, at)
            
            # Handle settag_response
            elif payload.get("message_type") == "settag_response":
                print(f"[SCADA_WS] Set tag response: {payload.get('status')} for {payload.get('tag_fullname')}")

        except Exception as e:
            print("[SCADA_WS] on_message error:", e)

    def _on_error(self, ws, error):
        print("[SCADA_WS] WebSocket error:", error)

    def _on_close(self, ws, *_):
        with self._lock:
            self._connected = False
        print("[SCADA_WS] WebSocket closed")

    def _on_open(self, ws):
        print("[SCADA_WS] WebSocket opened")
        if self.tags:
            msg = json.dumps({"type": "add_tags", "tags": self.tags})
            ws.send(json.dumps({"message": msg}))
        

    # ---------- Public API ----------
    def start(self, extra_tags: list[str] | None = None) -> bool:
        """
        Ensure token, open websocket, and run it in a background thread.
        """
        if extra_tags:
            # allow subscribing more tags at start
            self.tags = list(set(self.tags + list(extra_tags)))

        if not self._ensure_token():
            print("Auth failed: cannot obtain token")
            return False

        auth_header = f"Sec-WebSocket-Protocol: {self.token}"
        self._ws = websocket.WebSocketApp(
            f"wss://{self.target}/ws/tag/1/",
            on_open=self._on_open,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close,
            header=[auth_header],
        )

        def _runner():
            # NOTE: disable cert verification if verify_tls=False
            sslopt = {} if self.verify_tls else {"cert_reqs": ssl.CERT_NONE}
            self._ws.run_forever(sslopt=sslopt)

        self._thread = threading.Thread(
            target=_runner, name="WebSocket2Scada", daemon=True
        )
        with self._lock:
            self._connected = True
        self._thread.start()
        return True

    def is_connected(self) -> bool:
        with self._lock:
            return self._connected

    def subscribe(self, tags: list[str]):
        """
        Subscribe to additional tags after connection is open.
        """
        if not tags:
            return
        self.tags = list(set(self.tags + tags))
        if self._ws:
            msg = json.dumps({"type": "add_tags", "tags": tags})
            self._ws.send(json.dumps({"message": msg}))

    def send_value(self, tag: str, value):
        """
        Write tag value, e.g.:
          send_value("passion.HueLight02.onoff", 1)
          send_value("passion.HueLight02.Color", "#274CAB")
          send_value("passion.HueLight02.Brightness", 5)
        """
        if not self._ws:
            raise RuntimeError("WebSocket not started")
        payload = {"type": "set_tag", "tag": tag, "value": value}
        self._ws.send(json.dumps({"message": json.dumps(payload)}))

    def close(self):
        if self._ws:
            try:
                self._ws.close()
            except Exception:
                pass
        with self._lock:
            self._connected = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)
        self._thread = None
        self._ws = None
