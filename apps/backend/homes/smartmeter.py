from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .base_scada import BaseScadaManager

class SmartmeterManager(BaseScadaManager):
    def __new__(cls):
        # Override __new__ to initialize the latest cache
        instance = super(SmartmeterManager, cls).__new__(cls)
        if not hasattr(instance, 'latest'):
            instance.latest = {}  # tag -> {value, time}
        return instance

    def _get_connection_params(self):
        from .models import SmartMeter
        
        # Build the dynamic list of tags for all SmartMeters that are turned on
        active_meters = SmartMeter.objects.filter(is_on=True).exclude(tag__isnull=True).exclude(tag__exact='')
        if not active_meters.exists():
            print("[SMARTMETER] ℹ️ No active smart meters found. Not connecting.")
            return None

        suffixes = ["v", "i", "P", "Q", "S", "PF", "KWH", "KVARH"]
        tags_to_subscribe = []
        for meter in active_meters:
            for suffix in suffixes:
                tags_to_subscribe.append(f"{meter.tag}.{suffix}")

        return {
            "target": "loopvr.net:50203",
            "login": "scada",
            "password": "scadatest1234",
            "token": "535a4d29f85c1c851eb81843ea89b951011ffd58",
            "tags": tags_to_subscribe,
            "verify_tls": False
        }

    def handle_tag_update(self, tag: str, value, at: str):
        """
        Callback fired by WebSocket2Scada when a notify_tag message arrives.
        We broadcast this to the 'homes_group' so all connected frontends receive the update.
        """
        print(f"[SMARTMETER] 📊 {tag} = {value}  @ {at}")

        # 1. Cache the latest value so REST endpoints can query it.
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

    def get_latest(self) -> dict[str, dict]:
        """Return a snapshot of the most recent smartmeter readings."""
        return dict(self.latest)

    def close(self):
        """Shut down the smartmeter connection if no meters are active."""
        from .models import SmartMeter
        active_meters = SmartMeter.objects.filter(is_on=True).exclude(tag__isnull=True).exclude(tag__exact='')
        if active_meters.exists():
            print(f"[SMARTMETER] ℹ️ Not closing. {active_meters.count()} meters still active.")
            return

        super().close()
