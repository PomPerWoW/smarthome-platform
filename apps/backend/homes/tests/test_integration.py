from unittest.mock import patch, MagicMock
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from django.contrib.gis.geos import Point
import io
import zipfile
import os
import json
from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from homes.models import Home, Room, Device, AirConditioner, PositionHistory, Lightbulb, Automation, Television, Fan, SmartMeter, Furniture
from homes.services import VoiceAssistantService, update_automation_solar_time, update_all_solar_automations
from homes.llm_interfaces import CommandIntent

class HomesTests(APITestCase):
    def setUp(self):
        """Set up test data for homes app tests"""
        # Create two users for permission testing
        self.user_a = User.objects.create_user(username='user_a@test.com', email='user_a@test.com', password='password123')
        self.user_b = User.objects.create_user(username='user_b@test.com', email='user_b@test.com', password='password123')
        
        # Create a home for user A
        self.home_a = Home.objects.create(user=self.user_a, home_name="User A Home")
        self.room_a = Room.objects.create(home=self.home_a, room_name="User A Room")
        
        # Create a home for user B
        self.home_b = Home.objects.create(user=self.user_b, home_name="User B Home")
        self.room_b = Room.objects.create(home=self.home_b, room_name="User B Room")
        
        # Authenticate as user A by default
        self.client.force_authenticate(user=self.user_a)

    def test_create_home(self):
        """Test successful home creation and automatic user assignment"""
        url = reverse('home-list')
        data = {'home_name': 'New Vacation Home'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Home.objects.filter(user=self.user_a).count(), 2)

    def test_list_homes_only_shows_owned(self):
        """Test that users only see homes they own"""
        url = reverse('home-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should only see user A's home, not user B's
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['home_name'], "User A Home")

    def test_create_room_in_owned_home(self):
        """Test creating a room in a home the user owns"""
        url = reverse('room-list')
        data = {'home': str(self.home_a.id), 'room_name': 'Kitchen'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_room_in_other_user_home_fails(self):
        """Test that creating a room in someone else's home fails (PermissionDenied)"""
        url = reverse('room-list')
        data = {'home': str(self.home_b.id), 'room_name': 'Hacker Room'}
        # Should fail with 403 because perform_create raises PermissionDenied
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_set_device_position(self):
        """Test the set_position custom action and history logging"""
        device = AirConditioner.objects.create(room=self.room_a, device_name="AC 1")
        url = reverse('airconditioner-set-position', kwargs={'pk': str(device.id)})
        data = {'x': 10.5, 'y': 20.5, 'z': 5.0, 'rotation_y': 90.0}
        
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        device.refresh_from_db()
        self.assertEqual(device.device_pos.x, 10.5)
        self.assertEqual(device.device_pos.y, 20.5)
        self.assertEqual(device.rotation_y, 90.0)
        
        # Verify history records
        # There should be 2: one initial from common signals and one from this update
        history = PositionHistory.objects.filter(device__id=device.id).order_by('-timestamp')
        self.assertEqual(history.count(), 2)
        
        # The latest one should have the new coordinates
        latest_history = history.first()
        self.assertEqual(latest_history.point.x, 10.5)
        self.assertEqual(latest_history.point.y, 20.5)

    @patch('homes.views.ScadaManager')
    def test_update_device_state_triggers_scada(self, mock_scada_class):
        """Test that updating 'is_on' state calls ScadaManager"""
        mock_scada = mock_scada_class.return_value
        device = AirConditioner.objects.create(room=self.room_a, device_name="Smart AC", tag="AC_001")
        
        url = reverse('airconditioner-detail', kwargs={'pk': str(device.id)})
        data = {'is_on': True}
        
        response = self.client.patch(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify ScadaManager.send_command was called with correct arguments
        mock_scada.send_command.assert_called_once_with("AC_001.onoff", 1)

    def test_tag_management_actions(self):
        """Test tag management actions (GET, POST, DELETE)"""
        device = AirConditioner.objects.create(room=self.room_a, device_name="Test Device")
        url = reverse('airconditioner-tag', kwargs={'pk': str(device.id)})
        
        # POST: Set tag
        response = self.client.post(url, {'tag': 'Z-WAVE-101'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        device.refresh_from_db()
        self.assertEqual(device.tag, 'Z-WAVE-101')
        
        # GET: Retrieve tag
        response = self.client.get(url)
        self.assertEqual(response.data['tag'], 'Z-WAVE-101')
        
        # DELETE: Clear tag
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        device.refresh_from_db()
        self.assertIsNone(device.tag)

    def test_access_other_users_device_fails(self):
        """Test that users cannot access devices in rooms they don't own"""
        device_b = AirConditioner.objects.create(room=self.room_b, device_name="User B Private AC")
        
        # Try to access as user_a
        url = reverse('airconditioner-detail', kwargs={'pk': str(device_b.id)})
        response = self.client.get(url)
        # Should return 404 because get_queryset filters by user
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_room_alignment(self):
        """Test the set_alignment custom action for rooms"""
        url = reverse('room-set-alignment', kwargs={'pk': str(self.room_a.id)})
        data = {'x': 1.0, 'y': 2.0, 'z': 3.0, 'rotation_y': 45.0, 'anchor_uuid': 'test-uuid'}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.room_a.refresh_from_db()
        self.assertEqual(self.room_a.position_x, 1.0)
        self.assertEqual(self.room_a.anchor_uuid, 'test-uuid')

    def test_ac_temperature_and_logs(self):
        """Test AC specialized actions: set_temperature and getACLog"""
        ac = AirConditioner.objects.create(room=self.room_a, device_name="Living Room AC")
        
        # Test set_temperature
        url = reverse('airconditioner-set-temperature', kwargs={'pk': str(ac.id)})
        response = self.client.post(url, {'temp': 22.5}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ac.refresh_from_db()
        self.assertEqual(ac.temperature, 22.5)
        
        # Test getACLog
        log_url = reverse('airconditioner-getACLog')
        response = self.client.get(f"{log_url}?date=2024-01-01")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)

    def test_device_history_action(self):
        """Test the history custom action on DeviceViewSet"""
        device = AirConditioner.objects.create(room=self.room_a, device_name="Test History AC")
        url = reverse('airconditioner-history', kwargs={'pk': str(device.id)})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should contain at least the initial record from signals
        self.assertEqual(len(response.data), 1)

    @patch('shutil.rmtree')
    def test_room_upload_model(self, mock_rmtree):
        """Test the upload_model custom action for rooms"""
        url = reverse('room-upload-model', kwargs={'pk': str(self.room_a.id)})
        
        # Create a mock GLB file
        glb_content = b"mock glb content"
        mock_file = SimpleUploadedFile("model.glb", glb_content, content_type="model/gltf-binary")
        
        response = self.client.post(url, {'file': mock_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.room_a.refresh_from_db()
        self.assertTrue(self.room_a.room_model.startswith('uploaded_'))
        self.assertTrue(self.room_a.room_model_file.name.endswith('.glb'))

    @patch('shutil.rmtree')
    def test_room_upload_model_zip(self, mock_rmtree):
        """Test the upload_model custom action for rooms using a ZIP file"""
        url = reverse('room-upload-model', kwargs={'pk': str(self.room_a.id)})
        
        # Create an in-memory zip file containing a gltf file
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
            zip_file.writestr("model.gltf", b"mock gltf content")
            zip_file.writestr("texture.png", b"mock texture")
            # also test ignoring __MACOSX
            zip_file.writestr("__MACOSX/._model.gltf", b"junk")
        
        zip_buffer.seek(0)
        mock_file = SimpleUploadedFile("model.zip", zip_buffer.read(), content_type="application/zip")
        
        response = self.client.post(url, {'file': mock_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.room_a.refresh_from_db()
        self.assertTrue(self.room_a.room_model.startswith('uploaded_'))
        self.assertTrue(self.room_a.room_model_file.name.endswith('.gltf'))

    @patch('shutil.rmtree')
    def test_room_upload_model_bad_zip(self, mock_rmtree):
        """Test the upload_model custom action for rooms using a bad ZIP file"""
        url = reverse('room-upload-model', kwargs={'pk': str(self.room_a.id)})
        
        # Bad Zip
        mock_file = SimpleUploadedFile("model.zip", b"not a zip", content_type="application/zip")
        response = self.client.post(url, {'file': mock_file}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Valid Zip but no GLTF/GLB
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
            zip_file.writestr("model.txt", b"junk")
        zip_buffer.seek(0)
        mock_file2 = SimpleUploadedFile("empty.zip", zip_buffer.read(), content_type="application/zip")
        response2 = self.client.post(url, {'file': mock_file2}, format='multipart')
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('homes.views.ScadaManager')
    def test_television_actions(self, mock_scada_class):
        """Test Television specialized actions: volume, channel, mute, getTVLog"""
        mock_scada = mock_scada_class.return_value
        tv = Television.objects.create(room=self.room_a, device_name="Living Room TV", tag="TV.001")

        # Test perform_update override (is_on changed sends `on` instead of `onoff`)
        url = reverse('television-detail', kwargs={'pk': str(tv.id)})
        response = self.client.patch(url, {'is_on': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_scada.send_command.assert_called_with("TV.001.on", 1)
        
        # Test get_position empty
        pos_url = reverse('television-get-position', kwargs={'pk': str(tv.id)})
        resp_empty = self.client.get(pos_url)
        self.assertEqual(resp_empty.data['x'], None)

        # set position
        set_url = reverse('television-set-position', kwargs={'pk': str(tv.id)})
        self.client.post(set_url, {'x': 1, 'y': 2, 'z': 3}, format='json')
        
        # get position populated
        resp_pop = self.client.get(pos_url)
        self.assertEqual(resp_pop.data['x'], 1.0)
        
        # test delete position
        resp_del = self.client.delete(pos_url)
        self.assertEqual(resp_del.status_code, status.HTTP_200_OK)
        tv.refresh_from_db()
        self.assertIsNone(tv.device_pos)

        # volume
        vol_url = reverse('television-set-volume', kwargs={'pk': str(tv.id)})
        response = self.client.post(vol_url, {'volume': 42}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tv.refresh_from_db()
        self.assertEqual(tv.volume, 42)
        
        # Test set_channel
        url = reverse('television-set-channel', kwargs={'pk': str(tv.id)})
        response = self.client.post(url, {'channel': 7}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tv.refresh_from_db()
        self.assertEqual(tv.channel, 7)

        # Test set_mute
        url = reverse('television-set-mute', kwargs={'pk': str(tv.id)})
        response = self.client.post(url, {'mute': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tv.refresh_from_db()
        self.assertEqual(tv.is_mute, True)

        # Test getTVLog
        log_url = reverse('television-getTVLog')
        response = self.client.get(f"{log_url}?date=2024-01-01")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)

    @patch('homes.views.ScadaManager')
    def test_fan_actions(self, mock_scada_class):
        """Test Fan specialized actions: speed, swing, getFanLog"""
        mock_scada = mock_scada_class.return_value
        fan = Fan.objects.create(room=self.room_a, device_name="Bedroom Fan", tag="FAN.001")
        
        # Test perform_update override
        url_detail = reverse('fan-detail', kwargs={'pk': str(fan.id)})
        response = self.client.patch(url_detail, {'is_on': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_scada.send_command.assert_called_with("FAN.001.on", 1)

        # Test set_speed
        url = reverse('fan-set-speed', kwargs={'pk': str(fan.id)})
        response = self.client.post(url, {'speed': 3}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        fan.refresh_from_db()
        self.assertEqual(fan.speed, 3)

        # Test set_swing
        url_swing = reverse('fan-set-swing', kwargs={'pk': str(fan.id)})
        response_sw = self.client.post(url_swing, {'swing': True}, format='json')
        self.assertEqual(response_sw.status_code, status.HTTP_200_OK)
        fan.refresh_from_db()
        self.assertTrue(fan.swing)
        mock_scada.send_command.assert_called_with("FAN.001.shake", 1)

        # Test getFanLog
        log_url = reverse('fan-getFanLog')
        response = self.client.get(f"{log_url}?date=2024-01-01")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)

    def test_furniture_actions(self):
        furniture = Furniture.objects.create(room=self.room_a, furniture_name="Sofa")
        url_set = reverse('furniture-set-position', kwargs={'pk': str(furniture.id)})
        url_get = reverse('furniture-get-position', kwargs={'pk': str(furniture.id)})
        
        # Test set position
        response = self.client.post(url_set, {'x': 10, 'y': 20, 'z': 30, 'rotation_y': 90}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        furniture.refresh_from_db()
        self.assertEqual(furniture.device_pos.x, 10)
        self.assertEqual(furniture.rotation_y, 90)
        
        # Test missing x/y
        response_fail = self.client.post(url_set, {'z': 30}, format='json')
        self.assertEqual(response_fail.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Test get position
        response_get = self.client.get(url_get)
        self.assertEqual(response_get.status_code, status.HTTP_200_OK)
        self.assertEqual(response_get.data['x'], 10)

    def test_lightbulb_actions(self):
        """Test Lightbulb specialized actions: brightness, color, getLightLog"""
        light = Lightbulb.objects.create(room=self.room_a, device_name="Bedroom Light")
        
        # Test set_brightness
        url = reverse('lightbulb-set-brightness', kwargs={'pk': str(light.id)})
        response = self.client.post(url, {'brightness': 80}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        light.refresh_from_db()
        self.assertEqual(light.brightness, 80)
        
        # Test set_colour
        url = reverse('lightbulb-set-colour', kwargs={'pk': str(light.id)})
        response = self.client.post(url, {'colour': '#ff0000'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        light.refresh_from_db()
        self.assertEqual(light.colour, '#ff0000')

        # Test getLightbulbLog
        log_url = reverse('lightbulb-getLightbulbLog')
        response = self.client.get(f"{log_url}?date=2024-01-01")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)

class VoiceAssistantTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='voice@test.com', password='password123')
        self.home = Home.objects.create(user=self.user, home_name="Voice Home")
        self.room = Room.objects.create(home=self.home, room_name="Voice Room")
        self.light = Lightbulb.objects.create(room=self.room, device_name="Desk Light", tag="L1")
        self.service = VoiceAssistantService()

    def test_detect_instruction_topic(self):
        """Test local rule-based instruction topic detection"""
        # "how do i turn on" matches 'on_off' in services.py logic priority
        self.assertEqual(self.service._detect_instruction_topic("how do i turn on the light"), "on_off")
        self.assertEqual(self.service._detect_instruction_topic("how to control the fan"), "fan")
        self.assertEqual(self.service._detect_instruction_topic("what can you do"), "what_can_you_do")
        self.assertEqual(self.service._detect_instruction_topic("turn on the light"), None) # Should be a command, not instruction
        
        # Extended instruction branches
        self.assertEqual(self.service._detect_instruction_topic("how do i control the system"), "control")
        self.assertEqual(self.service._detect_instruction_topic("how do i use this panel"), "panel")
        self.assertEqual(self.service._detect_instruction_topic("how to use voice"), "voice")
        self.assertEqual(self.service._detect_instruction_topic("how to see usage"), "usage_graph")
        self.assertEqual(self.service._detect_instruction_topic("how to get started"), "getting_started")
        self.assertEqual(self.service._detect_instruction_topic("how do i navigate"), "navigation")
        self.assertEqual(self.service._detect_instruction_topic("how do i see the welcome panel"), "welcome_panel")
        self.assertEqual(self.service._detect_instruction_topic("help me it's not working"), "troubleshooting")
        self.assertEqual(self.service._detect_instruction_topic("how many devices"), "device_info")
        self.assertEqual(self.service._detect_instruction_topic("how do i use the tv"), "television")
        self.assertEqual(self.service._detect_instruction_topic("how do i use the ac"), "ac")
        self.assertEqual(self.service._detect_instruction_topic("how to use"), "fallback")

    @patch('homes.services.LLMFactory.get_provider')
    def test_process_voice_command_execution(self, mock_get_provider):
        """Test full process_voice_command flow with mocked LLM intent"""
        mock_provider = MagicMock()
        mock_get_provider.return_value = mock_provider
        
        # Setup mock intent: Turn on the light
        intent = CommandIntent(device_id=str(self.light.id), action="turn_on", parameters={})
        mock_provider.parse_command.return_value = [intent]
        
        # Re-init service to use mock provider
        service = VoiceAssistantService()
        
        with patch('homes.services.ScadaManager') as mock_scada_class:
            mock_scada = mock_scada_class.return_value
            result = service.process_voice_command(self.user, "turn on desk light", execute=True)
            
            self.assertEqual(result['actions'][0]['status'], 'success')
            self.light.refresh_from_db()
            self.assertTrue(self.light.is_on)
            mock_scada.send_command.assert_called()

    def test_service_execution_intents(self):
        """Test _execute_intent mapping for set_brightness, set_colour, set_volume, etc."""
        tv = Television.objects.create(room=self.room, device_name="Voice TV", tag="V_TV")
        fan = Fan.objects.create(room=self.room, device_name="Voice Fan", tag="V_FAN")
        ac = AirConditioner.objects.create(room=self.room, device_name="Voice AC", tag="V_AC")
        
        with patch('homes.services.ScadaManager'):
            # test turn_off light
            intent1 = CommandIntent(device_id=str(self.light.id), action="turn_off", parameters={})
            self.service._execute_intent(intent1, self.user)
            self.light.refresh_from_db()
            self.assertFalse(self.light.is_on)

            # test set_brightness
            intent2 = CommandIntent(device_id=str(self.light.id), action="set_brightness", parameters={"brightness": 50})
            self.service._execute_intent(intent2, self.user)
            self.light.refresh_from_db()
            self.assertEqual(self.light.brightness, 50)

            # test set_colour
            intent3 = CommandIntent(device_id=str(self.light.id), action="set_colour", parameters={"colour": "#112233"})
            self.service._execute_intent(intent3, self.user)
            self.light.refresh_from_db()
            self.assertEqual(self.light.colour, "#112233")

            # test set_volume
            intent4 = CommandIntent(device_id=str(tv.id), action="set_volume", parameters={"volume": 99})
            self.service._execute_intent(intent4, self.user)
            tv.refresh_from_db()
            self.assertEqual(tv.volume, 99)

            # test set_channel
            intent5 = CommandIntent(device_id=str(tv.id), action="set_channel", parameters={"channel": 12})
            self.service._execute_intent(intent5, self.user)
            tv.refresh_from_db()
            self.assertEqual(tv.channel, 12)

            # test set_mute
            intent6 = CommandIntent(device_id=str(tv.id), action="set_mute", parameters={"mute": True})
            self.service._execute_intent(intent6, self.user)
            tv.refresh_from_db()
            self.assertTrue(tv.is_mute)

            # test set_speed
            intent7 = CommandIntent(device_id=str(fan.id), action="set_speed", parameters={"speed": 3})
            self.service._execute_intent(intent7, self.user)
            fan.refresh_from_db()
            self.assertEqual(fan.speed, 3)

            # test set_swing
            intent8 = CommandIntent(device_id=str(fan.id), action="set_swing", parameters={"swing": True})
            self.service._execute_intent(intent8, self.user)
            fan.refresh_from_db()
            self.assertTrue(fan.swing)

            # test set_temp
            intent9 = CommandIntent(device_id=str(ac.id), action="set_temperature", parameters={"temperature": 18})
            self.service._execute_intent(intent9, self.user)
            ac.refresh_from_db()
            self.assertEqual(ac.temperature, 18)

    def test_generate_code_from_intent(self):
        """Test the code generation mapping for display purposes"""
        # test turn_on
        intent = CommandIntent(device_id="123", action="turn_on", parameters={})
        code = self.service._generate_code_from_intent(intent)
        self.assertIn("is_on = True", code)

        # test set_brightness
        intent2 = CommandIntent(device_id="123", action="set_brightness", parameters={})
        code2 = self.service._generate_code_from_intent(intent2)
        self.assertIn("brightness = ", code2)

        # test set_colour
        intent3 = CommandIntent(device_id="123", action="set_colour", parameters={})
        code3 = self.service._generate_code_from_intent(intent3)
        self.assertIn("colour = ", code3)

        # test set_volume
        intent4 = CommandIntent(device_id="123", action="set_volume", parameters={})
        code4 = self.service._generate_code_from_intent(intent4)
        self.assertIn("volume = ", code4)

        # test set_channel
        intent5 = CommandIntent(device_id="123", action="set_channel", parameters={})
        code5 = self.service._generate_code_from_intent(intent5)
        self.assertIn("channel = ", code5)

        # test set_mute
        intent6 = CommandIntent(device_id="123", action="set_mute", parameters={})
        code6 = self.service._generate_code_from_intent(intent6)
        self.assertIn("is_mute = ", code6)

        # test set_speed
        intent7 = CommandIntent(device_id="123", action="set_speed", parameters={})
        code7 = self.service._generate_code_from_intent(intent7)
        self.assertIn("speed = ", code7)

        # test set_swing
        intent8 = CommandIntent(device_id="123", action="set_swing", parameters={})
        code8 = self.service._generate_code_from_intent(intent8)
        self.assertIn("swing = ", code8)

        # test set_temperature
        intent9 = CommandIntent(device_id="123", action="set_temperature", parameters={})
        code9 = self.service._generate_code_from_intent(intent9)
        self.assertIn("temperature = ", code9)

        # Fallback
        intent10 = CommandIntent(device_id="123", action="unknown_action", parameters={})
        code10 = self.service._generate_code_from_intent(intent10)
        self.assertIn("# Unknown action", code10)

    @patch('homes.services.LLMFactory.get_provider')
    def test_process_voice_command_no_execute(self, mock_provider_class):
        mock_provider = mock_provider_class.return_value
        intent = CommandIntent(device_id=str(self.light.id), action="turn_on", parameters={})
        mock_provider.parse_command.return_value = [intent]
        
        service = VoiceAssistantService(provider=mock_provider)
        res = service.process_voice_command(self.user, "turn on light", execute=False)
        self.assertEqual(res['actions'][0]['status'], 'pending')

    @patch('homes.services.VoiceAssistantService._generate_device_info_response')
    def test_process_voice_command_device_info(self, mock_gen_response):
        """Test device_info instruction topic with mocked LLM response"""
        mock_gen_response.return_value = "You have some devices."
        
        res = self.service.process_voice_command(self.user, "how many devices do i have", execute=False)
        self.assertEqual(res['instruction_topic'], 'device_info')
        self.assertEqual(res['instruction_text'], "You have some devices.")
        
        # Test fallback when LLM fails
        mock_gen_response.side_effect = Exception("LLM Error")
        res2 = self.service.process_voice_command(self.user, "what devices do i own", execute=False)
        self.assertEqual(res2['instruction_topic'], 'device_info')
        self.assertTrue("You have" in res2['instruction_text'])

class AutomationTests(APITestCase):
    @patch('homes.utils.get_coords')
    @patch('homes.utils.get_solar_times')
    def test_solar_automation_update(self, mock_solar, mock_coords):
        """Test updating automation time based on sunrise/sunset"""
        from datetime import datetime, time
        mock_coords.return_value = (13.75, 100.5) # Bangkok
        mock_solar.return_value = {
            'sunrise': datetime(2024, 1, 1, 6, 30),
            'sunset': datetime(2024, 1, 1, 18, 45)
        }
        
        user = User.objects.create_user(username='auto@test.com', password='password123')
        home = Home.objects.create(user=user, home_name="Auto Home")
        room = Room.objects.create(home=home, room_name="Auto Room")
        light = Lightbulb.objects.create(room=room, device_name="Auto Light")
        
        automation = Automation.objects.create(
            device=light,
            title="Sunset Light",
            sunrise_sunset=True,
            solar_event="sunset"
        )
        
        update_automation_solar_time(automation)
        automation.refresh_from_db()
        self.assertEqual(automation.time, time(18, 45))

class SchedulerTests(APITestCase):
    def setUp(self):
        from homes.scheduler import Scheduler
        self.scheduler = Scheduler()
        self.user = User.objects.create_user(username='sched@test.com', password='password123')
        self.home = Home.objects.create(user=self.user, home_name="Sched Home")
        self.room = Room.objects.create(home=self.home, room_name="Sched Room")
        
    @patch("homes.services.get_channel_layer", return_value=None)
    @patch("homes.services.ScadaManager")
    def test_execute_automation(self, mock_scada_class, _mock_channel):
        mock_scada = mock_scada_class.return_value

        # Test Lightbulb with brightness and color
        light = Lightbulb.objects.create(room=self.room, device_name="Sched Light", tag="L_001")
        auto_light = Automation.objects.create(
            device=light,
            title="Light Auto",
            action={"is_on": 1, "color": "#00ff00", "brightness": 75},
        )
        self.scheduler._execute_automation(auto_light)
        mock_scada.send_command.assert_any_call("L_001.onoff", 1)
        mock_scada.send_command.assert_any_call("L_001.Color", "#00ff00")
        mock_scada.send_command.assert_any_call("L_001.Brightness", 75)
        light.refresh_from_db()
        self.assertTrue(light.is_on)
        self.assertEqual(light.brightness, 75)
        self.assertEqual(light.colour, "#00ff00")

        # Test AC with temp
        ac = AirConditioner.objects.create(room=self.room, device_name="Sched AC", tag="AC_001")
        auto_ac = Automation.objects.create(device=ac, title="AC Auto", action={"temp": 24})
        self.scheduler._execute_automation(auto_ac)
        mock_scada.send_command.assert_any_call("AC_001.set_temp", 24)
        ac.refresh_from_db()
        self.assertEqual(ac.temperature, 24)

        # Frontend sends "temperature" for AC automations
        auto_ac2 = Automation.objects.create(
            device=ac, title="AC Auto UI", action={"temperature": 22}
        )
        self.scheduler._execute_automation(auto_ac2)
        mock_scada.send_command.assert_any_call("AC_001.set_temp", 22)
        ac.refresh_from_db()
        self.assertEqual(ac.temperature, 22)

        # Test TV with volume, channel, mute
        tv = Television.objects.create(room=self.room, device_name="Sched TV", tag="TV_001")
        auto_tv = Automation.objects.create(device=tv, title="TV Auto", action={'volume': 20, 'channel': 5, 'is_mute': 0})
        self.scheduler._execute_automation(auto_tv)
        mock_scada.send_command.assert_any_call("TV_001.volume", 20)
        mock_scada.send_command.assert_any_call("TV_001.channel", 5)
        mock_scada.send_command.assert_any_call("TV_001.mute", 0)
        
        # Test Fan with speed, swing
        fan = Fan.objects.create(room=self.room, device_name="Sched Fan", tag="FAN_001")
        auto_fan = Automation.objects.create(device=fan, title="Fan Auto", action={'speed': 2, 'swing': 1})
        self.scheduler._execute_automation(auto_fan)
        mock_scada.send_command.assert_any_call("FAN_001.speed", 2)
        mock_scada.send_command.assert_any_call("FAN_001.shake", 1)

        # Fan power uses .on (not .onoff); strip stray lightbulb keys from payload
        auto_fan_off = Automation.objects.create(
            device=fan,
            title="Fan Off",
            action={"is_on": False, "brightness": 100},
        )
        self.scheduler._execute_automation(auto_fan_off)
        mock_scada.send_command.assert_any_call("FAN_001.on", 0)
        fan.refresh_from_db()
        self.assertFalse(fan.is_on)

class SmartMeterUpdateTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='sm@test.com', password='password123')
        self.client.force_authenticate(user=self.user)
        self.home = Home.objects.create(user=self.user, home_name="SM Home")
        self.room = Room.objects.create(home=self.home, room_name="SM Room")

    @patch('homes.smartmeter.SmartmeterManager')
    @patch('homes.views.ScadaManager')
    def test_smartmeter_on_off_triggers(self, mock_scada_class, mock_sm_manager_class):
        sm = SmartMeter.objects.create(room=self.room, device_name="SM 1", tag="SM_001")
        mock_sm_manager = mock_sm_manager_class.return_value
        mock_scada = mock_scada_class.return_value
        
        url = reverse('smartmeter-detail', kwargs={'pk': str(sm.id)})
        
        # Turn ON
        response = self.client.patch(url, {'is_on': True}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should call start() and send_command(..., 1)
        mock_sm_manager.start.assert_called_once()
        mock_scada.send_command.assert_called_with("SM_001.onoff", 1)
        
        # Turn OFF
        response = self.client.patch(url, {'is_on': False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Should call close() and send_command(..., 0)
        mock_sm_manager.close.assert_called_once()
        mock_scada.send_command.assert_called_with("SM_001.onoff", 0)

class ExtraViewSetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='extra@test.com', password='password123')
        self.client.force_authenticate(user=self.user)
        self.home = Home.objects.create(user=self.user, home_name="Extra Home")
        self.room = Room.objects.create(home=self.home, room_name="Extra Room")

    @patch('homes.views.VoiceAssistantService')
    def test_voice_command_viewset(self, mock_service_class):
        mock_service = mock_service_class.return_value
        mock_service.process_voice_command.return_value = {"status": "success", "actions": []}
        
        url = reverse('voice-command')
        
        # Test missing text
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Test valid command
        response = self.client.post(url, {'command': 'turn on light'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_service.process_voice_command.assert_called_once()

    @patch('homes.views.VoiceAssistantService')
    @patch('groq.Groq')
    @patch('homes.views.os.getenv')
    def test_voice_transcribe(self, mock_getenv, mock_groq_class, mock_service_class):
        url = reverse('voice-transcribe')
        
        # Test without file
        response = self.client.post(url, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_automation_viewset(self):
        url = reverse('automation-list')
        light = Lightbulb.objects.create(room=self.room, device_name="Auto Light Test")
        
        # Add Automation
        data = {
            'device': light.id,
            'title': 'Test Auto',
            'action': {'is_on': 1},
            'sunrise_sunset': False
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    @patch('homes.npc_chat.chat_with_npc')
    def test_npc_chat_viewset(self, mock_chat):
        mock_chat.return_value = {"npc_id": "npc1", "npc_name": "Alice", "response": "Hi", "goodbye": False}
        url = reverse('npc-chat-chat')
        # Without npc_id
        response = self.client.post(url, {'message': 'hello'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
        # Valid
        response = self.client.post(url, {'npc_id': 'npc1', 'message': 'hello'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['response'], 'Hi')
        
    @patch('homes.npc_chat.reset_history')
    def test_npc_reset_viewset(self, mock_reset):
        url = reverse('npc-chat-reset')
        response = self.client.post(url, {'npc_id': 'npc1'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_reset.assert_called_once_with('npc1')

    @patch('homes.npc_chat.get_greeting')
    def test_npc_greeting_viewset(self, mock_greet):
        mock_greet.return_value = "Hello"
        url = reverse('npc-chat-greeting')
        response = self.client.post(url, {'npc_id': 'npc1'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['greeting'], 'Hello')

class NPCChatLogicTests(APITestCase):
    def test_history_manipulation(self):
        from homes.npc_chat import _add_to_history, _get_history, reset_history, reset_all_histories
        reset_all_histories()
        
        _add_to_history('test_npc', 'user', 'Hi')
        hist = _get_history('test_npc')
        self.assertEqual(len(hist), 1)
        self.assertEqual(hist[0]['content'], 'Hi')
        
        # Test max history length (mock max limit by pushing 25 items where max is 20)
        for i in range(25):
            _add_to_history('test_npc', 'user', f'msg {i}')
        self.assertEqual(len(_get_history('test_npc')), 20)
        
        reset_history('test_npc')
        self.assertEqual(len(_get_history('test_npc')), 0)
        
    @patch('groq.Groq')
    @patch('homes.npc_chat.os.getenv')
    def test_chat_with_npc(self, mock_getenv, mock_groq_class):
        from homes.npc_chat import chat_with_npc, reset_all_histories
        reset_all_histories()
        
        # Test unknown NPC
        res = chat_with_npc('unknown_npc', 'hello')
        self.assertEqual(res['npc_name'], 'Unknown')
        
        # Test 1: No API key
        mock_getenv.return_value = None
        res = chat_with_npc('npc1', 'hello')
        self.assertIn("trouble thinking", res['response'])
        
        # Test 2: Valid API key but LLM throws error
        mock_getenv.return_value = 'mock_key'
        mock_groq = mock_groq_class.return_value
        mock_groq.chat.completions.create.side_effect = Exception("API error")
        res = chat_with_npc('npc1', 'hello')
        self.assertIn("spaced out", res['response'])
        
        # Test 3: Valid interaction
        mock_completion = MagicMock()
        mock_completion.choices[0].message.content = "Hey there!"
        mock_groq.chat.completions.create.side_effect = None
        mock_groq.chat.completions.create.return_value = mock_completion
        
        res = chat_with_npc('npc1', 'hello')
        self.assertEqual(res['response'], "Hey there!")
        self.assertFalse(res['goodbye'])
        
        # Test 4: Goodbye interaction
        mock_completion.choices[0].message.content = "See ya! [GOODBYE]"
        res = chat_with_npc('npc3', 'bye')
        self.assertEqual(res['response'], "See ya!")
        self.assertTrue(res['goodbye'])
        
    def test_greetings_and_farewells(self):
        from homes.npc_chat import get_greeting, get_farewell
        self.assertIn("Hey! Oh my gosh", get_greeting('npc1'))
        self.assertEqual(get_greeting('unknown'), "Hello!")
        
        self.assertIn("Okay, see you later", get_farewell('npc1'))
        self.assertEqual(get_farewell('unknown'), "See you!")

class SCADAWebSocketTests(APITestCase):
    @patch('homes.scada_ws.requests.get')
    @patch('homes.scada_ws.requests.post')
    @patch('homes.scada_ws.websocket.WebSocketApp')
    @patch('homes.scada_ws.threading.Thread')
    def test_scada_ws_start_and_auth(self, mock_thread, mock_ws_app, mock_post, mock_get):
        from homes.scada_ws import WebSocket2Scada
        client = WebSocket2Scada(
            target="test.com", login="user", password="pwd", token="old_token"
        )
        
        # Test auth fail -> refresh success
        # 1. GET token fails
        mock_get_resp = MagicMock()
        mock_get_resp.status_code = 401
        mock_get.return_value = mock_get_resp
        
        # 2. POST login succeeds
        mock_post_resp = MagicMock()
        mock_post_resp.status_code = 200
        mock_post_resp.json.return_value = {"token": "new_token"}
        mock_post.return_value = mock_post_resp
        
        res = client.start()
        self.assertTrue(res)
        self.assertEqual(client.token, "new_token")
        mock_ws_app.assert_called_once()
        mock_thread.return_value.start.assert_called_once()
        
    def test_scada_ws_callbacks(self):
        from homes.scada_ws import WebSocket2Scada
        
        on_tag_mock = MagicMock()
        client = WebSocket2Scada(
            target="test.com", login="u", password="p", token="t", on_tag=on_tag_mock
        )
        
        # simulate _on_message notify_tag
        valid_msg = json.dumps({
            "message": json.dumps({
                "type": "notify_tag",
                "tag": "my.tag",
                "value": 42,
                "time": "2024-01-01"
            })
        })
        client._on_message(None, valid_msg)
        on_tag_mock.assert_called_once_with("my.tag", 42, "2024-01-01")
        
        # simulate send_value
        client._ws = MagicMock()
        client.send_value("my.tag", True)
        client._ws.send.assert_called_once()
