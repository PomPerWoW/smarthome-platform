import json
import logging
from typing import Any, Dict, List, Optional

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .llm_interfaces import CommandIntent, LLMProvider
from .llm_providers import LLMFactory
from .models import (
    AirConditioner,
    Device,
    Fan,
    Lightbulb,
    SmartMeter,
    Television,
)
from .scada import ScadaManager

logger = logging.getLogger(__name__)


class VoiceAssistantService:
    def __init__(self, provider: LLMProvider = None):
        self.provider = provider or LLMFactory.get_provider()

    def _detect_instruction_topic(self, command_text: str) -> Optional[str]:
        """Detect if the command is an instruction/how-to question; return topic key or None."""
        import re

        if not command_text or not isinstance(command_text, str):
            return None
        t = command_text.strip().lower()
        # Guardrails to prevent overlap with device-action commands.
        # - Instruction-like: questions / help / explanations (predefined scripts).
        # - Command-like: actions to execute (turn on/off, set values, etc.).
        instruction_triggers = (
            "how do i",
            "how to",
            "what is",
            "what's",
            "what can you",  # "what can you do" often has no "?" from ASR — must match without t.endswith("?")
            "what can i",  # "what can i say", etc. (overlaps filtered below if pure device command)
            "who are you",
            "explain",
            "tell me about",
            "help me",
            "can you help",
            "i need help",
            "show me how",
            "guide me",
            "can you explain",
        )
        command_triggers = (
            "turn on",
            "turn off",
            "switch on",
            "switch off",
            "set ",
            "change ",
            "increase ",
            "decrease ",
            "mute",
            "unmute",
        )

        is_instruction_like = any(x in t for x in instruction_triggers) or t.endswith(
            "?"
        )
        is_command_like = any(x in t for x in command_triggers)

        # If it's clearly a device command and not a how-to question, don't treat it as instruction.
        if is_command_like and not is_instruction_like:
            return None

        # Word-boundary helper (avoids matching "highlight" as "light", "account" as "ac", etc.)
        def has_word(word: str) -> bool:
            return re.search(rf"\b{re.escape(word)}\b", t) is not None

        # ── Capability / identity (do NOT require is_instruction_like: ASR often drops "?") ──
        if any(
            x in t
            for x in (
                "what can you do",
                "what can you help",
                "what can you help me",
                "what do you do",
                "what are you for",
                "what are you",
                "who are you",
                "what's your purpose",
                "what is your purpose",
                "tell me what you can do",
                "what help can you give",
                "what are your capabilities",
                "what else can you do",
            )
        ):
            return "what_can_you_do"

        # "How to control the fan/light/tv/ac" → device topic (must run BEFORE generic "control" below)
        if is_instruction_like and ("control" in t):
            if has_word("fan"):
                return "fan"
            if has_word("light") or has_word("lightbulb") or has_word("bulb"):
                return "light"
            if has_word("tv") or "television" in t:
                return "television"
            if has_word("ac") or "air conditioner" in t or "air conditioning" in t:
                return "ac"

        # control – general how do I control (no specific appliance)
        if is_instruction_like and any(
            x in t
            for x in (
                "how do i control",
                "how can i control",
                "how to control",
                "what can i use to control",
                "how do i control the system",
                "how do i control the appliances",
            )
        ):
            return "control"
        # panel – general panel usage
        if is_instruction_like and any(
            x in t
            for x in (
                "how do i use this panel",
                "how do i use the panel",
                "how to use this panel",
                "how to use the panel",
                "what is this panel",
                "what is the panel for",
                "how many panels",
                "tell me about the panel",
                "explain the panel",
            )
        ):
            return "panel"
        # voice – mic, voice commands
        if is_instruction_like and any(
            x in t
            for x in (
                "how do i use voice",
                "how to use voice",
                "how do i use the microphone",
                "how do i give voice commands",
                "what can i say",
                "what should i say",
                "what's the mic",
                "what is the mic",
                "tell me about voice",
                "explain voice",
            )
        ):
            return "voice"
        # on_off
        if is_instruction_like and any(
            x in t
            for x in (
                "how do i turn on",
                "how do i turn off",
                "how to turn on",
                "how to turn off",
                "how do i switch on",
                "how do i switch off",
                "how do i turn something on",
                "how do i turn something off",
            )
        ):
            return "on_off"
        # usage_graph
        if is_instruction_like and any(
            x in t
            for x in (
                "usage graph",
                "usage view",
                "3d graph",
                "how do i see usage",
                "how to see usage",
                "how do i check usage",
                "explain usage",
                "check consumption",
            )
        ):
            return "usage_graph"
        # getting_started - for first-time users
        if is_instruction_like and any(
            x in t
            for x in (
                "how do i get started",
                "how to get started",
                "where do i start",
                "what should i do first",
                "i'm new",
                "i am new",
                "first time",
                "getting started",
                "begin",
                "start here",
            )
        ):
            return "getting_started"
        # what_can_you_do: handled earlier (without is_instruction_like) for ASR without "?"
        # navigation - how to navigate the interface
        if is_instruction_like and any(
            x in t
            for x in (
                "how do i navigate",
                "how to navigate",
                "where is everything",
                "how do i find",
                "where can i find",
                "how do i access",
                "where is the menu",
                "how do i get to",
                "navigation",
            )
        ):
            return "navigation"
        # welcome_panel - how to access welcome panel
        if is_instruction_like and any(
            x in t
            for x in (
                "welcome panel",
                "how do i see the welcome panel",
                "where is the welcome panel",
                "how to open welcome panel",
                "show welcome panel",
                "access welcome panel",
            )
        ):
            return "welcome_panel"
        # troubleshooting - common issues
        if is_instruction_like and any(
            x in t
            for x in (
                "not working",
                "doesn't work",
                "not responding",
                "what's wrong",
                "what is wrong",
                "something wrong",
                "trouble",
                "problem",
                "issue",
                "help it's not working",
                "fix",
                "broken",
            )
        ):
            return "troubleshooting"
        # device_info - informational queries about devices (count, list, etc.)
        if any(
            x in t
            for x in (
                "how many devices",
                "how many device",
                "what devices",
                "what device",
                "list devices",
                "show me devices",
                "tell me about devices",
                "what devices do i have",
                "what devices do i own",
                "what device is in",
                "what device is in my room",
                "what device is in my",
                "devices in my room",
                "device in my room",
                "my devices",
                "devices in my home",
                "devices in my house",
                "count devices",
                "number of devices",
            )
        ):
            return "device_info"
        # device-specific instructions (e.g. "how do I use the fan") when no "control" phrase
        if is_instruction_like and has_word("fan"):
            return "fan"
        if is_instruction_like and (
            has_word("light") or has_word("lightbulb") or has_word("bulb")
        ):
            return "light"
        if is_instruction_like and (has_word("tv") or "television" in t):
            return "television"
        if is_instruction_like and (
            has_word("ac") or "air conditioner" in t or "air conditioning" in t
        ):
            return "ac"
        # generic "how to use" without device
        if is_instruction_like and any(
            x in t
            for x in ("how do i use", "how to use", "what does this do", "explain")
        ):
            return "fallback"
        return None

    def process_voice_command(
        self, user, command_text: str, execute: bool = True
    ) -> Dict[str, Any]:
        """
        Main entry point for voice commands.
        """
        # 0. Instruction / how-to: return topic for predefined TTS (no device actions)
        instruction_topic = self._detect_instruction_topic(command_text)
        if instruction_topic:
            # Special handling for device_info - generate dynamic response using LLM for better answers
            if instruction_topic == "device_info":
                devices = self._get_user_devices(user)
                device_count = len(devices)

                # Use LLM to generate a natural response to the question
                devices_context = [
                    {
                        "id": str(d.id),
                        "name": d.device_name,
                        "type": self._get_device_type(d),
                        "room": d.room.room_name if d.room else "Unassigned",
                        "state": self._get_device_state(d),
                    }
                    for d in devices
                ]

                # Generate response using LLM for more natural answers
                try:
                    response_text = self._generate_device_info_response(
                        command_text, devices_context, device_count
                    )
                except Exception as e:
                    logger.error(
                        f"Failed to generate LLM response for device_info: {e}"
                    )
                    # Fallback to simple response
                    response_text = self._generate_simple_device_info_response(
                        devices, device_count
                    )

                return {
                    "command": command_text,
                    "code": None,
                    "actions": [],
                    "instruction_topic": "device_info",
                    "instruction_text": response_text,  # Include dynamic text
                }

            return {
                "command": command_text,
                "code": None,
                "actions": [],
                "instruction_topic": instruction_topic,
            }

        # 1. Fetch devices context
        devices = self._get_user_devices(user)
        devices_context = [
            {
                "id": str(d.id),
                "name": d.device_name,
                "type": self._get_device_type(d),
                "room": d.room.room_name if d.room else "Unassigned",
                "state": self._get_device_state(d),
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

        # 4. Return parsed actions only (used by clients that need to move in-world first)
        if not execute:
            device_name_by_id = {str(d.id): d.device_name for d in devices}
            planned_actions = []
            for intent in intents:
                planned_actions.append(
                    {
                        "status": "pending",
                        "action": intent.action,
                        "device": device_name_by_id.get(
                            str(intent.device_id), str(intent.device_id)
                        ),
                        "device_id": str(intent.device_id),
                        "parameters": intent.parameters or {},
                    }
                )
            return {
                "command": command_text,
                "code": "\n\n".join(code_snippets) if code_snippets else None,
                "actions": planned_actions,
            }

        # 5. Execute intents
        results = []
        for intent in intents:
            result = self._execute_intent(intent, user)
            results.append(result)

        return {
            "command": command_text,
            "code": "\n\n".join(code_snippets) if code_snippets else None,
            "actions": results,
        }

    def _generate_code_from_intent(self, intent) -> str:
        """Generate Python code string that represents this intent."""
        device_id = intent.device_id
        action = intent.action
        params = intent.parameters or {}

        if action == "turn_on":
            return f"device = Device.objects.get(id='{device_id}')\ndevice.is_on = True\ndevice.save()"
        elif action == "turn_off":
            return f"device = Device.objects.get(id='{device_id}')\ndevice.is_on = False\ndevice.save()"
        elif action == "set_brightness":
            brightness = params.get("brightness", 100)
            return f"bulb = Lightbulb.objects.get(id='{device_id}')\nbulb.brightness = {brightness}\nbulb.save()"
        elif action == "set_colour":
            colour = params.get("colour", "#FFFFFF")
            return f"bulb = Lightbulb.objects.get(id='{device_id}')\nbulb.colour = '{colour}'\nbulb.save()"
        elif action == "set_volume":
            volume = params.get("volume", 50)
            return f"tv = Television.objects.get(id='{device_id}')\ntv.volume = {volume}\ntv.save()"
        elif action == "set_channel":
            channel = params.get("channel", 1)
            return f"tv = Television.objects.get(id='{device_id}')\ntv.channel = {channel}\ntv.save()"
        elif action == "set_mute":
            mute = params.get("mute", True)
            return f"tv = Television.objects.get(id='{device_id}')\ntv.is_mute = {mute}\ntv.save()"
        elif action == "set_speed":
            speed = params.get("speed", 1)
            return f"fan = Fan.objects.get(id='{device_id}')\nfan.speed = {speed}\nfan.save()"
        elif action == "set_swing":
            swing = params.get("swing", True)
            return f"fan = Fan.objects.get(id='{device_id}')\nfan.swing = {swing}\nfan.save()"
        elif action == "set_temperature":
            temp = params.get("temperature", 24)
            return f"ac = AirConditioner.objects.get(id='{device_id}')\nac.temperature = {temp}\nac.save()"
        else:
            return f"# Unknown action: {action} for device {device_id}"

    def _get_user_devices(self, user):
        return Device.objects.filter(room__home__user=user)

    def _get_device_type(self, device: Device) -> str:
        if hasattr(device, "lightbulb"):
            return "lightbulb"
        if hasattr(device, "television"):
            return "television"
        if hasattr(device, "fan"):
            return "fan"
        if hasattr(device, "airconditioner"):
            return "air_conditioner"
        if hasattr(device, "smartmeter"):
            return "smartmeter"
        return "generic_device"

    def _get_device_state(self, device: Device) -> Dict[str, Any]:
        state = {"is_on": device.is_on}

        # Access child attributes
        if hasattr(device, "lightbulb"):
            state.update(
                {
                    "brightness": device.lightbulb.brightness,
                    "colour": device.lightbulb.colour,
                }
            )
        elif hasattr(device, "television"):
            state.update(
                {
                    "volume": device.television.volume,
                    "channel": device.television.channel,
                    "is_mute": device.television.is_mute,
                }
            )
        elif hasattr(device, "fan"):
            state.update({"speed": device.fan.speed, "swing": device.fan.swing})
        elif hasattr(device, "airconditioner"):
            state.update(
                {
                    "temperature": device.airconditioner.temperature,
                    "fan_level": device.airconditioner.fan_level,
                }
            )
        return state

    def _execute_intent(self, intent: CommandIntent, user) -> Dict[str, Any]:
        try:
            # Re-fetch device to ensure it exists (and for type safety)
            device = Device.objects.get(id=intent.device_id, room__home__user=user)
            device_child = self._get_child_device(device)

            action = intent.action
            params = intent.parameters or {}

            if action == "turn_on":
                device_child.is_on = True
            elif action == "turn_off":
                device_child.is_on = False

            # Specific Actions
            elif action == "set_brightness" and hasattr(device_child, "brightness"):
                device_child.brightness = params.get(
                    "brightness", device_child.brightness
                )
            elif action == "set_colour" and hasattr(device_child, "colour"):
                device_child.colour = params.get("colour", device_child.colour)

            elif action == "set_volume" and hasattr(device_child, "volume"):
                device_child.volume = params.get("volume", device_child.volume)
            elif action == "set_channel" and hasattr(device_child, "channel"):
                device_child.channel = params.get("channel", device_child.channel)
            elif action == "set_mute" and hasattr(device_child, "is_mute"):
                device_child.is_mute = params.get("mute", False)

            elif action == "set_speed" and hasattr(device_child, "speed"):
                device_child.speed = params.get("speed", device_child.speed)
            elif action == "set_swing" and hasattr(device_child, "swing"):
                device_child.swing = params.get("swing", False)

            elif action == "set_temperature" and hasattr(device_child, "temperature"):
                device_child.temperature = params.get(
                    "temperature", device_child.temperature
                )

            device_child.save()

            # Send to SCADA if the device has a tag
            if device_child.tag:
                scada = ScadaManager()
                if action == "turn_on":
                    tag_suffix = _scada_power_onoff_suffix(device)
                    scada.send_command(f"{device_child.tag}{tag_suffix}", 1)
                elif action == "turn_off":
                    tag_suffix = _scada_power_onoff_suffix(device)
                    scada.send_command(f"{device_child.tag}{tag_suffix}", 0)
                elif action == "set_brightness":
                    scada.send_command(
                        f"{device_child.tag}.Brightness", device_child.brightness
                    )
                elif action == "set_colour":
                    scada.send_command(f"{device_child.tag}.Color", device_child.colour)
                elif action == "set_volume":
                    scada.send_command(
                        f"{device_child.tag}.volume", device_child.volume
                    )
                elif action == "set_channel":
                    scada.send_command(
                        f"{device_child.tag}.channel", device_child.channel
                    )
                elif action == "set_mute":
                    scada.send_command(
                        f"{device_child.tag}.mute", 1 if device_child.is_mute else 0
                    )
                elif action == "set_speed":
                    scada.send_command(f"{device_child.tag}.speed", device_child.speed)
                elif action == "set_swing":
                    scada.send_command(
                        f"{device_child.tag}.shake", 1 if device_child.swing else 0
                    )
                elif action == "set_temperature":
                    scada.send_command(
                        f"{device_child.tag}.set_temp", device_child.temperature
                    )

            # Broadcast update via WebSockets
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                "homes_group",
                {
                    "type": "device_update",
                    "device_id": str(device.id),
                    "action": action,
                    "status": "success",
                },
            )

            return {
                "status": "success",
                "action": action,
                "device": device.device_name,
                "device_id": str(device.id),
            }

        except Device.DoesNotExist:
            return {
                "status": "error",
                "message": f"Device {intent.device_id} not found.",
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _get_child_device(self, device: Device):
        if hasattr(device, "lightbulb"):
            return device.lightbulb
        if hasattr(device, "television"):
            return device.television
        if hasattr(device, "fan"):
            return device.fan
        if hasattr(device, "airconditioner"):
            return device.airconditioner
        if hasattr(device, "smartmeter"):
            return device.smartmeter
        return device

    def _generate_device_info_response(
        self, question: str, devices_context: List[Dict[str, Any]], device_count: int
    ) -> str:
        """Use LLM to generate a natural response to device information questions."""
        if device_count == 0:
            return "You don't have any devices set up yet. You can add devices from the panel or by using the device placement feature."

        devices_str = json.dumps(devices_context, indent=2)
        prompt = f"""You are a smart home assistant. The user asked: "{question}"

Available Devices:
{devices_str}

Answer the user's question naturally and concisely. If they ask about devices in a room, list the devices in that room. If they ask how many devices, give the count and a brief summary. Be direct and helpful.

Your response (keep it under 100 words):"""

        try:
            # Check if provider has a client (GroqProvider)
            if hasattr(self.provider, "client") and self.provider.client:
                response = self.provider.client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are a helpful smart home assistant. Answer questions about devices concisely and naturally.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=150,
                )
                return response.choices[0].message.content.strip()
            else:
                # Fallback if LLM not available
                raise Exception("LLM client not available")
        except Exception as e:
            logger.error(f"LLM error in device_info response: {e}")
            # Fallback: get devices from context
            device_ids = [d["id"] for d in devices_context]
            devices = Device.objects.filter(id__in=device_ids)
            return self._generate_simple_device_info_response(
                list(devices), device_count
            )

    def _generate_simple_device_info_response(
        self, devices: List[Device], device_count: int
    ) -> str:
        """Fallback simple response generator."""
        if device_count == 0:
            return "You don't have any devices set up yet. You can add devices from the panel or by using the device placement feature."

        # Count devices by type
        device_types = {}
        for d in devices:
            device_type = self._get_device_type(d)
            device_types[device_type] = device_types.get(device_type, 0) + 1

        type_list = []
        for dev_type, count in device_types.items():
            if count == 1:
                type_list.append(f"one {dev_type}")
            else:
                type_list.append(f"{count} {dev_type}s")

        if len(type_list) == 1:
            devices_summary = type_list[0]
        elif len(type_list) == 2:
            devices_summary = f"{type_list[0]} and {type_list[1]}"
        else:
            devices_summary = ", ".join(type_list[:-1]) + f", and {type_list[-1]}"

        if device_count == 1:
            return f"You have one device in your home: {devices_summary}."
        else:
            return f"You have {device_count} devices in your home. You have {devices_summary}."


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

    if automation.solar_event == "sunrise":
        automation.time = solar_times["sunrise"].time()
    elif automation.solar_event == "sunset":
        automation.time = solar_times["sunset"].time()

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

    sunrise = solar_times["sunrise"].time()
    sunset = solar_times["sunset"].time()

    Automation.objects.filter(sunrise_sunset=True, solar_event="sunrise").update(
        time=sunrise
    )
    Automation.objects.filter(sunrise_sunset=True, solar_event="sunset").update(
        time=sunset
    )


def _automation_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value in (1, "1", "true", "True"):
        return True
    if value in (0, "0", "false", "False"):
        return False
    return bool(value)


def _concrete_device_for_update(device: Device) -> Device:
    """
    Load the device as its concrete subclass so one save() updates parent + child
    rows. Saving the parent Device then the child can overwrite is_on on the parent.
    """
    for Model in (Lightbulb, Television, Fan, AirConditioner, SmartMeter):
        try:
            return Model.objects.get(pk=device.pk)
        except Model.DoesNotExist:
            continue
    return device


def normalize_automation_actions_for_device(
    device: Device, actions: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Drop action keys that do not apply to this device (e.g. brightness on a Fan).
    """
    if not actions:
        return {}
    d = _concrete_device_for_update(device)
    if isinstance(d, Lightbulb):
        allowed = {"is_on", "brightness", "color", "colour"}
    elif isinstance(d, Fan):
        allowed = {"is_on", "speed", "swing"}
    elif isinstance(d, Television):
        allowed = {"is_on", "volume", "channel", "is_mute"}
    elif isinstance(d, AirConditioner):
        allowed = {"is_on", "temp", "temperature"}
    elif isinstance(d, SmartMeter):
        allowed = {"is_on"}
    else:
        return dict(actions)

    return {k: v for k, v in actions.items() if k in allowed}


def _scada_power_onoff_suffix(device: Device) -> str:
    """Align with HomeConsumer DEVICE_ACTIONS (TV/Fan use .on, AC uses .OnOff)."""
    d = _concrete_device_for_update(device)
    if isinstance(d, (Television, Fan)):
        return ".on"
    if isinstance(d, AirConditioner):
        return ".OnOff"
    return ".onoff"


def persist_automation_actions_to_db(device: Device, actions: Dict[str, Any]) -> None:
    """Apply automation JSON action to the device row (concrete subclass)."""
    if not actions:
        return

    d = _concrete_device_for_update(device)

    for key, raw in actions.items():
        if key == "is_on":
            d.is_on = _automation_bool(raw)
        elif key == "brightness" and hasattr(d, "brightness"):
            d.brightness = int(raw)
        elif key in ("color", "colour") and hasattr(d, "colour"):
            d.colour = str(raw)
        elif key in ("temp", "temperature") and hasattr(d, "temperature"):
            d.temperature = float(raw)
        elif key == "speed" and hasattr(d, "speed"):
            d.speed = int(raw)
        elif key == "swing" and hasattr(d, "swing"):
            d.swing = _automation_bool(raw) if not isinstance(raw, int) else bool(raw)
        elif key == "volume" and hasattr(d, "volume"):
            d.volume = int(raw)
        elif key == "channel" and hasattr(d, "channel"):
            d.channel = int(raw)
        elif key == "is_mute" and hasattr(d, "is_mute"):
            if isinstance(raw, int):
                d.is_mute = raw == 1
            else:
                d.is_mute = _automation_bool(raw)

    d.save()


def broadcast_home_device_update(
    *,
    device_id,
    device_name: str,
    action: str = "device_update",
    source: Optional[str] = None,
    automation_title: Optional[str] = None,
) -> None:
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    async_to_sync(channel_layer.group_send)(
        "homes_group",
        {
            "type": "device_update",
            "device_id": str(device_id),
            "device_name": device_name,
            "action": action,
            "source": source,
            "automation_title": automation_title,
        },
    )


def execute_scheduled_automation(automation) -> None:
    """
    Run a single automation: persist desired state to the DB, send SCADA commands,
    and notify WebSocket clients (same path as manual / voice updates).
    """
    device = automation.device
    raw_actions = automation.action or {}
    actions = normalize_automation_actions_for_device(device, raw_actions)

    logger.info(
        "Executing automation %s for device %s (%s)",
        automation.title,
        device.device_name,
        actions,
    )

    persist_automation_actions_to_db(device, actions)

    if device.tag:
        scada = ScadaManager()
        for key, value in actions.items():
            tag_suffix = None
            scada_val = value

            if key == "is_on":
                tag_suffix = _scada_power_onoff_suffix(device)
                scada_val = 1 if _automation_bool(value) else 0
            elif key == "color":
                tag_suffix = ".Color"
            elif key == "brightness":
                tag_suffix = ".Brightness"
            elif key in ("temp", "temperature"):
                tag_suffix = ".set_temp"
            elif key == "speed":
                tag_suffix = ".speed"
            elif key == "swing":
                tag_suffix = ".shake"
                scada_val = 1 if _automation_bool(value) else 0
            elif key == "volume":
                tag_suffix = ".volume"
            elif key == "channel":
                tag_suffix = ".channel"
            elif key == "is_mute":
                tag_suffix = ".mute"
                scada_val = 1 if _automation_bool(value) else 0

            if tag_suffix:
                full_tag = f"{device.tag}{tag_suffix}"
                logger.debug("SCADA %s = %s", full_tag, scada_val)
                scada.send_command(full_tag, scada_val)
            else:
                logger.debug("Unknown automation action key for SCADA: %s", key)
    else:
        logger.debug(
            "Automation %s: device %s has no SCADA tag — DB updated, SCADA skipped",
            automation.title,
            device.device_name,
        )

    broadcast_home_device_update(
        device_id=device.id,
        device_name=device.device_name,
        action="automation",
        source="automation",
        automation_title=automation.title,
    )
