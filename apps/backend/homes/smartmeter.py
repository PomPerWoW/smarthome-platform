# homes/smartmeter.py
"""
SmartmeterManager – singleton that manages the smartmeter WebSocket connection.

Mirrors the ScadaManager pattern but connects to the smartmeter SCADA server
and broadcasts meter readings (v, i, P, Q, S, PF, KWH, KVARH) to frontends
via Django Channels.
"""
import json
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .scada_ws import WebSocket2Scada

# ── Smartmeter connection settings ──────────────────────────────────────────
SMARTMETER_TARGET = "loopvr.net:50203"
SMARTMETER_LOGIN = "scada"
SMARTMETER_PASSWORD = "scadatest1234"
SMARTMETER_TOKEN = "535a4d29f85c1c851eb81843ea89b951011ffd58"

SMARTMETER_TAG_SUFFIXES = [
    "v", "i", "P", "Q", "S", "PF", "KWH", "KVARH"
]

class SmartmeterManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SmartmeterManager, cls).__new__(cls)
            cls._instance.client = None
            cls._instance.latest: dict[str, dict] = {}  # tag -> {value, time}
        return cls._instance

    # ── lifecycle ────────────────────────────────────────────────────────────
    def start(self):
        """Initialize and start the smartmeter WebSocket connection."""
        if self.client and self.client.is_connected():
            return

        from .models import SmartMeter
        # Build the dynamic list of tags for all SmartMeters that are turned on
        active_meters = SmartMeter.objects.filter(is_on=True).exclude(tag__isnull=True).exclude(tag__exact='')
        if not active_meters.exists():
            print("[SMARTMETER] ℹ️ No active smart meters found. Not connecting.")
            return

        tags_to_subscribe = []
        for meter in active_meters:
            for suffix in SMARTMETER_TAG_SUFFIXES:
                tags_to_subscribe.append(f"{meter.tag}.{suffix}")

        print(f"[SMARTMETER] 🔌 Starting Smartmeter Connection for {len(tags_to_subscribe)} tags…")
        self.client = WebSocket2Scada(
            target=SMARTMETER_TARGET,
            login=SMARTMETER_LOGIN,
            password=SMARTMETER_PASSWORD,
            token=SMARTMETER_TOKEN,
            tags=tags_to_subscribe,
            on_tag=self._handle_tag_update,
            verify_tls=False,
        )
        ok = self.client.start()
        if ok:
            print("[SMARTMETER] ✅ Connection started")
        else:
            print("[SMARTMETER] ❌ Failed to start connection")

    # ── incoming data ────────────────────────────────────────────────────────
    def _handle_tag_update(self, tag: str, value, at: str):
        """
        Callback fired by WebSocket2Scada when a notify_tag message arrives.

        1. Cache the latest value so REST endpoints can query it.
        2. Broadcast to the 'homes_group' channel layer so all connected
           frontends receive the reading in real-time.
        """
        print(f"[SMARTMETER] 📊 {tag} = {value}  @ {at}")

        # 1. Cache
        self.latest[tag] = {"value": value, "time": at}

        # 2. Broadcast via Channels
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "homes_group",
            {
                "type": "smartmeter_update",
                "tag": tag,
                "value": value,
                "timestamp": at,
            },
        )

    # ── helpers ──────────────────────────────────────────────────────────────
    def get_latest(self) -> dict[str, dict]:
        """Return a snapshot of the most recent smartmeter readings."""
        return dict(self.latest)

    def send_value(self, tag: str, value):
        """Write a value to the smartmeter (e.g. relay control)."""
        if self.client and self.client.is_connected():
            self.client.send_value(tag, value)
        else:
            print("[SMARTMETER] ⚠️ Not connected, cannot send value")

    def close(self):
        """Shut down the smartmeter connection if no meters are active."""
        from .models import SmartMeter
        active_meters = SmartMeter.objects.filter(is_on=True).exclude(tag__isnull=True).exclude(tag__exact='')
        if active_meters.exists():
            print(f"[SMARTMETER] ℹ️ Not closing. {active_meters.count()} meters still active.")
            return

        if self.client:
            self.client.close()
            self.client = None
        print("[SMARTMETER] Connection closed")
