import os
import json
import logging
from typing import List, Dict, Any
from django.conf import settings
from .llm_interfaces import LLMProvider, CommandIntent

logger = logging.getLogger(__name__)

class BaseLLMProvider(LLMProvider):
    def _construct_system_prompt(self, devices_context: List[Dict[str, Any]]) -> str:
        devices_str = json.dumps(devices_context, indent=2)
        return (
            "You are a smart home assistant. You control devices in a home.\n"
            f"Available Devices:\n{devices_str}\n\n"
            "Analyze the user's voice command and return a list of actions to take.\n"
            "Output MUST be a valid JSON array of objects with these fields:\n"
            "- 'action': One of ['turn_on', 'turn_off', 'set_brightness', 'set_colour', \n"
            "  'set_volume', 'set_channel', 'set_mute', 'set_speed', 'set_swing', 'set_temperature'].\n"
            "- 'device_id': The ID of the target device (from Available Devices).\n"
            "- 'parameters': A dictionary of parameters (e.g., {'brightness': 50}, {'colour': '#FF0000'}).\n\n"
            "Example Output in JSON format:\n"
            "[{\"action\": \"turn_on\", \"device_id\": \"uuid-123\", \"parameters\": {}}]\n"
            "If no device matches, return an empty list []."
        )

    def _parse_response(self, response_text: str) -> List[CommandIntent]:
        import re
        try:
            # Try to extract JSON array from the response (handles extra text around JSON)
            code_block_match = re.search(r'```(?:json)?\s*(\[[\s\S]*?\])\s*```', response_text)
            if code_block_match:
                cleaned_text = code_block_match.group(1)
            else:
                action_array_match = re.search(r'(\[\s*\{[^}]*"action"[^}]*"device_id"[^\]]*\])', response_text)
                if action_array_match:
                    cleaned_text = action_array_match.group(1)
                else:
                    # Fallback: find the LAST JSON array in the response (more likely to be the output)
                    all_arrays = re.findall(r'(\[[^\[\]]*\])', response_text)
                    if all_arrays:
                        # Try each from the end until we find valid JSON with action
                        for arr in reversed(all_arrays):
                            try:
                                test_data = json.loads(arr)
                                if isinstance(test_data, list) and len(test_data) > 0:
                                    if isinstance(test_data[0], dict) and 'action' in test_data[0]:
                                        cleaned_text = arr
                                        break
                            except json.JSONDecodeError:
                                continue
                        else:
                            cleaned_text = response_text.strip()
                    else:
                        cleaned_text = response_text.strip()
            
            data = json.loads(cleaned_text)
            
            if not isinstance(data, list):
                logger.warning(f"LLM returned non-list data: {data}")
                return []
            
            intents = []
            for item in data:
                intents.append(CommandIntent(
                    action=item.get("action"),
                    device_id=item.get("device_id"),
                    parameters=item.get("parameters", {})
                ))
            return intents
        except json.JSONDecodeError:
            logger.error(f"Failed to parse LLM response: {response_text}")
            return []

class GroqProvider(BaseLLMProvider):
    def __init__(self):
        try:
            from groq import Groq
            api_key = os.getenv("GROQ_API_KEY")
            if not api_key:
                logger.warning("GROQ_API_KEY not found.")
                self.client = None
            else:
                self.client = Groq(api_key=api_key)
        except ImportError:
            logger.error("groq package not installed. Run: pip install groq")
            self.client = None

    def parse_command(self, command_text: str, devices_context: List[Dict[str, Any]]) -> List[CommandIntent]:
        if not self.client:
            logger.error("Groq client not initialized.")
            return []

        system_prompt = self._construct_system_prompt(devices_context)
        
        try:
            response = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": command_text}
                ],
                temperature=0.0
            )
            content = response.choices[0].message.content
            return self._parse_response(content)
        except Exception as e:
            logger.error(f"Groq API error: {e}")
            return []

class LLMFactory:
    @staticmethod
    def get_provider() -> LLMProvider:
        provider_name = os.getenv("LLM_PROVIDER", "openai").lower()
        return GroqProvider()
