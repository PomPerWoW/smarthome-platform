from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class CommandIntent:
    action: str  # e.g., 'turn_on', 'set_brightness', 'set_temperature'
    device_id: Optional[str] = None
    device_type: Optional[str] = None # e.g., 'lightbulb', 'fan'
    parameters: Dict[str, Any] = None

class LLMProvider(ABC):
    @abstractmethod
    def parse_command(self, command_text: str, devices_context: List[Dict[str, Any]]) -> List[CommandIntent]:
        """
        Parses a natural language command into structured intents.

        Args:
            command_text: The user's voice command.
            devices_context: A list of available devices with their current state.

        Returns:
            A list of CommandIntent objects.
        """
        pass
