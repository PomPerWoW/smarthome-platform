# homes/scada.py
import json
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .scada_ws import WebSocket2Scada  # Your provided file

class ScadaManager:
    _instance = None

    def __new__(cls):
        # Singleton pattern to ensure only one connection exists
        if cls._instance is None:
            cls._instance = super(ScadaManager, cls).__new__(cls)
            cls._instance.client = None
        return cls._instance

    def start(self):
        """Initialize and start the SCADA connection"""
        if self.client and self.client.is_connected():
            return

        print("🔌 Starting SCADA Connection...")
        self.client = WebSocket2Scada(
            target="intelligentbuilding.io:6443", # Replace with your config
            login="YOUR_USERNAME",
            password="YOUR_PASSWORD",
            on_tag=self.handle_tag_update, # Hook the callback
            verify_tls=False
        )
        self.client.start()

    def handle_tag_update(self, tag, value, at):
        """
        Callback from SCADA. We broadcast this to the 'homes_group'
        so all connected frontends receive the update.
        """
        channel_layer = get_channel_layer()
        
        # We use async_to_sync because this callback runs in a standard Thread
        async_to_sync(channel_layer.group_send)(
            "homes_group",  # The group name all frontends subscribe to
            {
                "type": "scada_update",  # Maps to method 'scada_update' in Consumer
                "tag": tag,
                "value": value,
                "timestamp": at
            }
        )

    def send_command(self, tag, value):
        """Forward command to SCADA"""
        if self.client and self.client.is_connected():
            self.client.send_value(tag, value)
        else:
            print("⚠️ SCADA not connected, cannot send command")