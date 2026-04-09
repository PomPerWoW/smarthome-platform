from unittest.mock import patch, MagicMock
from django.test import TestCase
from homes.llm_providers import BaseLLMProvider, GroqProvider, LLMFactory

class ConcreteLLMProvider(BaseLLMProvider):
    def parse_command(self, command_text: str, devices_context: list) -> list:
        return []

class LLMProvidersTests(TestCase):
    def setUp(self):
        self.provider = ConcreteLLMProvider()
        
    def test_base_provider_construct_system_prompt(self):
        devices = [{"id": "123", "name": "Light"}]
        prompt = self.provider._construct_system_prompt(devices)
        self.assertIn("123", prompt)
        self.assertIn("Light", prompt)
        
    def test_base_provider_parse_response_valid_json(self):
        json_str = '[{"action": "turn_on", "device_id": "123", "parameters": {}}]'
        intents = self.provider._parse_response(json_str)
        self.assertEqual(len(intents), 1)
        self.assertEqual(intents[0].action, "turn_on")
        self.assertEqual(intents[0].device_id, "123")

    def test_base_provider_parse_response_markdown_json(self):
        json_str = '```json\n[{"action": "turn_off", "device_id": "123", "parameters": {}}]\n```'
        intents = self.provider._parse_response(json_str)
        self.assertEqual(len(intents), 1)
        self.assertEqual(intents[0].action, "turn_off")

    def test_base_provider_parse_response_regex_fallback(self):
        # A tricky string embedded with other things
        json_str = 'Here is what you want: [{"action": "turn_on", "device_id": "123", "parameters": {}}] Have a nice day!'
        intents = self.provider._parse_response(json_str)
        self.assertEqual(len(intents), 1)
        self.assertEqual(intents[0].action, "turn_on")

    def test_base_provider_parse_response_nested_array_regex(self):
        # Multiple arrays, should pick the one with action inside it
        json_str = 'Some stuff [1, 2, 3] then the real deal [{"action": "set_volume", "device_id": "tv1", "parameters": {"volume": 10}}]'
        intents = self.provider._parse_response(json_str)
        self.assertEqual(len(intents), 1)
        self.assertEqual(intents[0].action, "set_volume")

    def test_base_provider_parse_response_invalid_json(self):
        json_str = 'This is not json'
        intents = self.provider._parse_response(json_str)
        self.assertEqual(len(intents), 0)

    def test_base_provider_parse_response_non_list(self):
        json_str = '{"action": "turn_on"}'
        intents = self.provider._parse_response(json_str)
        self.assertEqual(len(intents), 0)
        
    @patch('homes.llm_providers.os.getenv')
    @patch('groq.Groq')
    def test_groq_provider(self, mock_groq_class, mock_getenv):
        # Valid init
        mock_getenv.return_value = 'mock_key'
        mock_groq_instance = mock_groq_class.return_value
        provider = GroqProvider()
        self.assertIsNotNone(provider.client)
        
        # Valid parse command
        mock_completion = MagicMock()
        mock_completion.choices[0].message.content = '[{"action": "turn_on", "device_id": "123"}]'
        mock_groq_instance.chat.completions.create.return_value = mock_completion
        
        intents = provider.parse_command("turn on light", [])
        self.assertEqual(len(intents), 1)
        self.assertEqual(intents[0].action, "turn_on")
        
        # API Error
        mock_groq_instance.chat.completions.create.side_effect = Exception("API error")
        intents_err = provider.parse_command("turn on light", [])
        self.assertEqual(len(intents_err), 0)

    @patch('homes.llm_providers.os.getenv')
    def test_groq_provider_no_key(self, mock_getenv):
        mock_getenv.return_value = None
        provider = GroqProvider()
        self.assertIsNone(provider.client)
        intents = provider.parse_command("hi", [])
        self.assertEqual(len(intents), 0)

    def test_llm_factory(self):
        provider = LLMFactory.get_provider()
        self.assertIsInstance(provider, GroqProvider)
