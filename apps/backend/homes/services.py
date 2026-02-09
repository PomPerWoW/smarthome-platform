from typing import Dict, Any, List
from .llm_interfaces import LLMProvider, CommandIntent
from .llm_providers import LLMFactory
from .models import Device, Lightbulb, Television, Fan, AirConditioner
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

class VoiceAssistantService:
    def __init__(self, provider: LLMProvider = None):
        self.provider = provider or LLMFactory.get_provider()

    def process_voice_command(self, user, command_text: str) -> Dict[str, Any]:
        """
        Main entry point for voice commands.
        """
        # 1. Fetch devices context
        devices = self._get_user_devices(user)
        devices_context = [
            {
                "id": str(d.id),
                "name": d.device_name,
                "type": self._get_device_type(d),
                "room": d.room.room_name if d.room else "Unassigned",
                "state": self._get_device_state(d)
            }
            for d in devices
        ]

        # 2. Parse command via LLM
        intents = self.provider.parse_command(command_text, devices_context)

        # 3. Generate code for each intent (for display, not execution)
        code_snippets = []
        for intent in intents:
            code = self._generate_code_from_intent(intent)
            code_snippets.append(code)

        # 4. Execute intents
        results = []
        for intent in intents:
            result = self._execute_intent(intent, user)
            results.append(result)

        return {
            "command": command_text,
            "code": "\n\n".join(code_snippets) if code_snippets else None,
            "actions": results
        }

    def _generate_code_from_intent(self, intent) -> str:
        """Generate Python code string that represents this intent."""
        device_id = intent.device_id
        action = intent.action
        params = intent.parameters or {}

        if action == 'turn_on':
            return f"device = Device.objects.get(id='{device_id}')\ndevice.is_on = True\ndevice.save()"
        elif action == 'turn_off':
            return f"device = Device.objects.get(id='{device_id}')\ndevice.is_on = False\ndevice.save()"
        elif action == 'set_brightness':
            brightness = params.get('brightness', 100)
            return f"bulb = Lightbulb.objects.get(id='{device_id}')\nbulb.brightness = {brightness}\nbulb.save()"
        elif action == 'set_colour':
            colour = params.get('colour', '#FFFFFF')
            return f"bulb = Lightbulb.objects.get(id='{device_id}')\nbulb.colour = '{colour}'\nbulb.save()"
        elif action == 'set_volume':
            volume = params.get('volume', 50)
            return f"tv = Television.objects.get(id='{device_id}')\ntv.volume = {volume}\ntv.save()"
        elif action == 'set_channel':
            channel = params.get('channel', 1)
            return f"tv = Television.objects.get(id='{device_id}')\ntv.channel = {channel}\ntv.save()"
        elif action == 'set_mute':
            mute = params.get('mute', True)
            return f"tv = Television.objects.get(id='{device_id}')\ntv.is_mute = {mute}\ntv.save()"
        elif action == 'set_speed':
            speed = params.get('speed', 1)
            return f"fan = Fan.objects.get(id='{device_id}')\nfan.speed = {speed}\nfan.save()"
        elif action == 'set_swing':
            swing = params.get('swing', True)
            return f"fan = Fan.objects.get(id='{device_id}')\nfan.swing = {swing}\nfan.save()"
        elif action == 'set_temperature':
            temp = params.get('temperature', 24)
            return f"ac = AirConditioner.objects.get(id='{device_id}')\nac.temperature = {temp}\nac.save()"
        else:
            return f"# Unknown action: {action} for device {device_id}"

    def _get_user_devices(self, user):
        return Device.objects.filter(room__home__user=user)

    def _get_device_type(self, device: Device) -> str:
        if hasattr(device, 'lightbulb'): return "lightbulb"
        if hasattr(device, 'television'): return "television"
        if hasattr(device, 'fan'): return "fan"
        if hasattr(device, 'airconditioner'): return "air_conditioner"
        return "generic_device"

    def _get_device_state(self, device: Device) -> Dict[str, Any]:
        state = {"is_on": device.is_on}
        
        # Access child attributes
        if hasattr(device, 'lightbulb'):
            state.update({
                "brightness": device.lightbulb.brightness,
                "colour": device.lightbulb.colour
            })
        elif hasattr(device, 'television'):
            state.update({
                "volume": device.television.volume,
                "channel": device.television.channel,
                "is_mute": device.television.is_mute
            })
        elif hasattr(device, 'fan'):
            state.update({
                "speed": device.fan.speed,
                "swing": device.fan.swing
            })
        elif hasattr(device, 'airconditioner'):
            state.update({
                "temperature": device.airconditioner.temperature,
                "fan_level": device.airconditioner.fan_level
            })
        return state

    def _execute_intent(self, intent: CommandIntent, user) -> Dict[str, Any]:
        try:
            # Re-fetch device to ensure it exists (and for type safety)
            device = Device.objects.get(id=intent.device_id, room__home__user=user)
            device_child = self._get_child_device(device)
            
            action = intent.action
            params = intent.parameters or {}
            
            if action == 'turn_on':
                device_child.is_on = True
            elif action == 'turn_off':
                device_child.is_on = False
            
            # Specific Actions
            elif action == 'set_brightness' and hasattr(device_child, 'brightness'):
                device_child.brightness = params.get('brightness', device_child.brightness)
            elif action == 'set_colour' and hasattr(device_child, 'colour'):
                device_child.colour = params.get('colour', device_child.colour)
            
            elif action == 'set_volume' and hasattr(device_child, 'volume'):
                device_child.volume = params.get('volume', device_child.volume)
            elif action == 'set_channel' and hasattr(device_child, 'channel'):
                device_child.channel = params.get('channel', device_child.channel)
            elif action == 'set_mute' and hasattr(device_child, 'is_mute'):
                device_child.is_mute = params.get('mute', False)
                
            elif action == 'set_speed' and hasattr(device_child, 'speed'):
                device_child.speed = params.get('speed', device_child.speed)
            elif action == 'set_swing' and hasattr(device_child, 'swing'):
                device_child.swing = params.get('swing', False)
                
            elif action == 'set_temperature' and hasattr(device_child, 'temperature'):
                device_child.temperature = params.get('temperature', device_child.temperature)

            device_child.save()
            device_child.save()
            
            # Broadcast update via WebSockets
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                "homes_group",
                {
                    "type": "device_update",
                    "device_id": str(device.id),
                    "action": action,
                    "status": "success"
                }
            )

            return {"status": "success", "action": action, "device": device.device_name}

        except Device.DoesNotExist:
            return {"status": "error", "message": f"Device {intent.device_id} not found."}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _get_child_device(self, device: Device):
        if hasattr(device, 'lightbulb'): return device.lightbulb
        if hasattr(device, 'television'): return device.television
        if hasattr(device, 'fan'): return device.fan
        if hasattr(device, 'airconditioner'): return device.airconditioner
        return device

def update_automation_solar_time(automation):
    """
    Updates the 'time' field of an automation based on solar events.
    """
    if not automation.sunrise_sunset or not automation.solar_event:
        return
    
    from .utils import get_coords, get_solar_times
    
    lat, lon = get_coords()
    if lat is None:
        return

    solar_times = get_solar_times(lat, lon)
    if solar_times is None:
        return

    if automation.solar_event == 'sunrise':
        automation.time = solar_times['sunrise'].time()
    elif automation.solar_event == 'sunset':
        automation.time = solar_times['sunset'].time()
    
    automation.save()

def update_all_solar_automations():
    """
    Updates all automations that rely on sunrise/sunset.
    """
    from .models import Automation
    from .utils import get_coords, get_solar_times
    
    lat, lon = get_coords()
    if lat is None:
        return

    solar_times = get_solar_times(lat, lon)
    if solar_times is None:
        return
    
    sunrise = solar_times['sunrise'].time()
    sunset = solar_times['sunset'].time()

    Automation.objects.filter(sunrise_sunset=True, solar_event='sunrise').update(time=sunrise)
    Automation.objects.filter(sunrise_sunset=True, solar_event='sunset').update(time=sunset)

