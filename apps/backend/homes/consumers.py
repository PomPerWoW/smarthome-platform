# homes/consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .scada import ScadaManager
from .models import Device

class HomeConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.group_name = "homes_group"
        user = self.scope["user"]

        if user.is_anonymous:
            await self.close()
            return

        # Join the group to receive SCADA updates
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    # 1. Receive message from Frontend
    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get("action")
        
        if action == "lightbulb_turn_on":
            device_id = data.get("device_id") 
            if device_id:
                device_tag = await self.get_device_tag(device_id)
                if device_tag:
                    ScadaManager().send_command(f"{device_tag}.onoff", 1)

    @database_sync_to_async
    def get_device_tag(self, device_id):
        print("[HomeConsumer] getting device_tag from database...")
        try:
            device = Device.objects.get(id=device_id)
            print("[HomeConsumer] device_tag found:", device.tag)
            return device.tag
        except Device.DoesNotExist:
            print("[HomeConsumer] device_tag not found")
            return None

    # 2. Receive message from SCADA (via Channel Layer)
    async def scada_update(self, event):
        # Forward the update to the Frontend
        await self.send(text_data=json.dumps({
            "type": "update",
            "tag": event["tag"],
            "value": event["value"],
            "timestamp": event["timestamp"]
        }))