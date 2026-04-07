from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .base_scada import BaseScadaManager

class ScadaManager(BaseScadaManager):
    def _get_connection_params(self):
        return {
            "target": "171.102.128.142:6443", # Replace with your config
            "login": "bingo",
            "password": "BPS12345",
            "token": "535a4d29f85c1c851eb81843ea89b951011ffd58",
            "tags": [
                "passion.HueLight01.onoff",
                "passion.HueLight01.Color",
                "passion.HueLight01.Brightness",
                "passion.HueLight02.onoff",
                "passion.HueLight02.Color",
                "passion.HueLight02.Brightness",
                "passion.HueLight03.OnOff",
                "passion.HueLight03.Color",
                "passion.HueLight03.Brightness",
                "passion.Dyson_Fan_Remote.on",
                "passion.Dyson_Fan_Remote.shake",
                "passion.Dyson_Fan_Remote.speed",
                "passion.Lab_TV_Remote.on",
                "passion.Lab_TV_Remote.mute",
                "passion.Lab_TV_Remote.channel",
                "passion.Lab_TV_Remote.volume",
                "passion.Daikin_Main_Remote.OnOff",
                "passion.Daikin_Main_Remote.set_temp",
                "passion.Daikin_Main_Remote.fanlevel",
            ],
            "verify_tls": False
        }

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

        try:
             # Sync to DB
             # Tag format: "prefix.command" (e.g. "passion.HueLight01.onoff")
             if '.' in tag:
                 # Import here to avoid circular dependencies if scada is imported by views/models
                 from .models import Device
                 
                 parts = tag.rsplit('.', 1)
                 device_tag = parts[0]
                 command = parts[1]
                 
                 # Find device by tag
                 device = Device.objects.filter(tag=device_tag).first()
                 
                 if device:
                     # Helper for boolean parsing
                     def parse_bool(v):
                         if v is None: return False
                         if isinstance(v, str):
                             if v.lower() in ('true', 'on', '1', '1.0'): return True
                             if v.lower() in ('false', 'off', '0', '0.0'): return False
                             try: return float(v) > 0
                             except: return False
                         return bool(v)

                     # Helper for float/int parsing 
                     def parse_float(v):
                         if v is None: return 0.0
                         try: return float(v)
                         except: return 0.0

                     # Update logic based on command
                     saved = False
                     
                     if command in ['onoff', 'on']:
                         device.is_on = parse_bool(value)
                         saved = True
                     
                     elif command == 'Color' and hasattr(device, 'lightbulb'):
                         if value:
                             device.lightbulb.colour = str(value)
                             device.lightbulb.save()
                             # We don't set saved=True because we saved the child
                    
                     elif command == 'Brightness' and hasattr(device, 'lightbulb'):
                         device.lightbulb.brightness = int(parse_float(value))
                         device.lightbulb.save()

                     elif command == 'set_temp' and hasattr(device, 'airconditioner'):
                         device.airconditioner.temperature = parse_float(value)
                         device.airconditioner.save()

                     elif command == 'speed' and hasattr(device, 'fan'):
                         dir_val = int(parse_float(value))
                         if dir_val == 1:
                             device.fan.speed = min(device.fan.speed + 1, 5)
                         elif dir_val == 0:
                             device.fan.speed = max(device.fan.speed - 1, 1)
                         device.fan.save()
                     
                     elif command == 'shake' and hasattr(device, 'fan'):
                         device.fan.swing = parse_bool(value)
                         device.fan.save()

                     elif command == 'volume' and hasattr(device, 'television'):
                         device.television.volume = int(parse_float(value))
                         device.television.save()
                    
                     elif command == 'channel' and hasattr(device, 'television'):
                         device.television.channel = int(parse_float(value))
                         device.television.save()
                    
                     elif command == 'mute' and hasattr(device, 'television'):
                         device.television.is_mute = parse_bool(value)
                         device.television.save()
                     
                     # Save parent if needed (for is_on)
                     if saved:
                         device.save()
                     
                     # Broadcast to frontend so UI refreshes and shows notification
                     async_to_sync(channel_layer.group_send)(
                         "homes_group",
                         {
                             "type": "device_update",
                             "device_id": str(device.id),
                             "action": command,
                             "value": value,
                             "device_name": device.device_name,
                             "source": "scada"
                         }
                     )
        except Exception as e:
            print(f"[SCADA_MANAGER] Error syncing tag {tag}: {e}")