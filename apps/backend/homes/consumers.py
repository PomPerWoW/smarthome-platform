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
        print(f"[HomeConsumer] Connecting... User: {user}, Is Authenticated: {user.is_authenticated}")

        if user.is_anonymous:
            print("[HomeConsumer] User is anonymous, rejecting connection")
            await self.close()
            return

        # Join the group to receive SCADA updates
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    DEVICE_ACTIONS = {
        "lightbulb_onoff": (".onoff", "is_on"),
        "tv_onoff": (".on", "is_on"),
        "fan_onoff": (".on", "is_on"),
        "ac_onoff": (".OnOff", "is_on"),
        "lightbulb_color": (".Color", "colour"),
        "lightbulb_brightness": (".Brightness", "brightness"),
        "tv_channel": (".channel", "channel"),
        "tv_volume": (".volume", "volume"),
        "tv_mute": (".mute", "is_mute"),
        "ac_temperature": (".set_temp", "temperature"),
        "ac_fan": (".fanlevel", "fan_level"),
        "fan_shake": (".shake", "swing"),
    }

    # 1. Receive message from Frontend
    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get("action")
        device_id = data.get("device_id")
        value = data.get("value")

        print("[HomeConsumer] received message from frontend:", data)

        if action in self.DEVICE_ACTIONS and device_id:
            scada_suffix, model_attr = self.DEVICE_ACTIONS[action]
            
            if device_tag:
                ScadaManager().send_command(f"{device_tag}{scada_suffix}", value)
                await self.update_device_state(device_id, model_attr, value)

                # Broadcast the update to all connected clients (Frontend & Scene Creator)
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        "type": "device_update",
                        "device_id": device_id,
                        "action": action,
                        "value": value
                    }
                )

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

    @database_sync_to_async
    def update_device_state(self, device_id, attribute, value):
        if not attribute:
            return

        print(f"[HomeConsumer] updating device {device_id} attribute {attribute} to {value}")
        try:
            device = Device.objects.get(id=device_id)
            
            if attribute == "is_on":
                device.is_on = value
                device.save()
            else:
                child = None
                if hasattr(device, 'lightbulb'):
                    child = device.lightbulb
                elif hasattr(device, 'television'):
                    child = device.television
                elif hasattr(device, 'airconditioner'):
                    child = device.airconditioner
                elif hasattr(device, 'fan'):
                    child = device.fan
                
                if child and hasattr(child, attribute):
                    setattr(child, attribute, value)
                    child.save()
                    print(f"[HomeConsumer] updated {attribute} on {child._meta.model_name}")
                else:
                    print(f"[HomeConsumer] attribute {attribute} not found on device or its children")

        except Device.DoesNotExist:
             print("[HomeConsumer] device not found for update")

    # 2. Receive message from SCADA (via Channel Layer)
    async def scada_update(self, event):
        # Forward the update to the Frontend
        await self.send(text_data=json.dumps({
            "type": "update",
            "tag": event["tag"],
            "value": event["value"],
            "timestamp": event["timestamp"]
        }))

    # 3. Receive device update from Voice Assistant (via Channel Layer)
    async def device_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "device_update",
            "device_id": event["device_id"],
            "action": event["action"]
        }))

    # 4. Receive smartmeter reading (via Channel Layer)
    async def smartmeter_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "smartmeter_update",
            "tag": event["tag"],
            "value": event["value"],
            "timestamp": event["timestamp"],
        }))