from datetime import datetime, timedelta
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth.models import User
from homes.models import Home, Room, SmartMeter, Lightbulb, AirConditioner, Fan, Television, AvatarScript

class HomesExtraViewsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='extra_tester', password='password123')
        self.home = Home.objects.create(user=self.user, home_name="My Smart Home")
        self.room = Room.objects.create(home=self.home, room_name="Living Room")
        
        self.client.force_authenticate(user=self.user)

    def test_home_get_devices(self):
        """Test the get_devices custom action on HomeViewSet."""
        Lightbulb.objects.create(room=self.room, device_name="Bulb 1")
        url = reverse('home-get-devices', kwargs={'pk': str(self.home.id)})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_room_get_devices(self):
        """Test the get_devices custom action on RoomViewSet."""
        Lightbulb.objects.create(room=self.room, device_name="Bulb 2")
        url = reverse('room-get-devices', kwargs={'pk': str(self.room.id)})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_room_get_furniture(self):
        """Test the get_furniture custom action on RoomViewSet."""
        url = reverse('room-get-furniture', kwargs={'pk': str(self.room.id)})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 0)

    def test_room_set_alignment_missing_params(self):
        """Test set_alignment with missing parameters."""
        url = reverse('room-set-alignment', kwargs={'pk': str(self.room.id)})
        resp = self.client.post(url, {'x': 1.0}, format='json') # Missing y, z, rotation_y
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --- Automations ---
    def test_automation_crud(self):
        light = Lightbulb.objects.create(room=self.room, device_name="Bulb 3")
        url_list = reverse('automation-list')
        
        # Test missing param or bad requests first
        data = {
            'device': light.id,
            'title': 'Test Auto',
            'action': {'is_on': 1},
            # missing sunrise_sunset
        }
        res = self.client.post(url_list, data, format='json')
        self.assertTrue(res.status_code in [200, 201])
        auto_id = res.data['id']
        
        url_detail = reverse('automation-detail', kwargs={'pk': auto_id})
        
        # Test Update
        res_put = self.client.put(url_detail, {
            'device': light.id,
            'title': 'Test Auto Updated',
            'action': {'is_on': 1},
        }, format='json')
        self.assertTrue(res_put.status_code in [200, 201])
        
        # Test Get
        res_get = self.client.get(url_detail)
        self.assertEqual(res_get.status_code, status.HTTP_200_OK)
        
        # Test Delete
        res_del = self.client.delete(url_detail)
        self.assertEqual(res_del.status_code, status.HTTP_204_NO_CONTENT)

    # --- BaseDeviceViewSet edge cases ---
    def test_device_set_position_missing_params(self):
        light = Lightbulb.objects.create(room=self.room, device_name="Bulb 4")
        url = reverse('lightbulb-set-position', kwargs={'pk': str(light.id)})
        resp = self.client.post(url, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_device_tag_missing_params(self):
        light = Lightbulb.objects.create(room=self.room, device_name="Bulb 4")
        url = reverse('lightbulb-tag', kwargs={'pk': str(light.id)})
        resp = self.client.post(url, {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --- SmartMeter Tests ---
    def test_smartmeter_actions(self):
        sm = SmartMeter.objects.create(room=self.room, device_name="Main SmartMeter")
        url_detail = reverse('smartmeter-detail', kwargs={'pk': str(sm.id)})
        
        # Test regular retrieval
        resp = self.client.get(url_detail)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # --- 1. Helper Function: _prepare_mock_log_context ---
    def test_mock_log_helper_errors(self):
        # Missing date
        url = reverse('smartmeter-getSmartMeterLog')
        resp = self.client.get(url) 
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Invalid date format
        resp = self.client.get(f"{url}?date=invalid-date")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

        # Future date
        future_date = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        resp = self.client.get(f"{url}?date={future_date}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['data']), 0)

    # --- 2. Specialized Device Log Endpoints ---
    def test_all_device_logs(self):
        past_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        
        # SmartMeter
        sm = SmartMeter.objects.create(room=self.room, device_name="SM")
        url = reverse('smartmeter-getSmartMeterLog')
        resp = self.client.get(f"{url}?date={past_date}&device_id={sm.id}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['data']), 288)
        
        # AC
        AirConditioner.objects.create(room=self.room, device_name="AC")
        url = reverse('airconditioner-getACLog')
        resp = self.client.get(f"{url}?date={past_date}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(len(resp.data) > 0)
        
        # Fan
        Fan.objects.create(room=self.room, device_name="Fan")
        url = reverse('fan-getFanLog')
        resp = self.client.get(f"{url}?date={past_date}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(len(resp.data) > 0)
        
        # TV
        Television.objects.create(room=self.room, device_name="TV")
        url = reverse('television-getTVLog')
        resp = self.client.get(f"{url}?date={past_date}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(len(resp.data) > 0)

    # --- 3. AvatarScript Paths ---
    def test_avatar_script_filtering_and_upload(self):
        AvatarScript.objects.create(
            room=self.room, 
            avatar_id="NPC1", 
            avatar_name="Npc One", 
            avatar_type="npc", 
            script_data=[]
        )
        
        # List filtering
        url = reverse('avatar-script-list')
        resp = self.client.get(f"{url}?room={self.room.id}")
        self.assertEqual(len(resp.data), 1)
        
        # Invalid JSON upload
        url_upload = reverse('avatar-script-list')
        resp = self.client.post(url_upload, {"room": self.room.id, "avatar_id": "NPC2", "script_data": "not-json"}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
