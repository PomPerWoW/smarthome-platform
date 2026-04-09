from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth.models import User
from homes.models import Home, Room, SmartMeter
from homes.utils import get_coords, get_solar_times
from homes.smartmeter import SmartmeterManager

class UtilsTests(TestCase):
    @patch('requests.get')
    def test_get_coords_success(self, mock_get):
        mock_get.return_value.json.return_value = {
            'status': 'success', 'lat': 10.0, 'lon': 20.0
        }
        lat, lon = get_coords()
        self.assertEqual(lat, 10.0)
        self.assertEqual(lon, 20.0)

    @patch('requests.get')
    def test_get_coords_fail(self, mock_get):
        mock_get.return_value.json.return_value = {'status': 'fail', 'message': 'error'}
        lat, lon = get_coords()
        self.assertIsNone(lat)

    @patch('requests.get')
    def test_get_solar_times_success(self, mock_get):
        mock_get.return_value.json.return_value = {
            'status': 'OK',
            'results': {
                'sunrise': '2024-01-01T06:00:00+00:00',
                'sunset': '2024-01-01T18:00:00+00:00'
            }
        }
        res = get_solar_times(10, 20)
        self.assertIsNotNone(res)
        self.assertEqual(res['sunrise'].hour, 6)

    def test_get_solar_times_invalid_input(self):
        self.assertIsNone(get_solar_times(None, 20))

class SmartmeterTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='sm_tester', password='123')
        self.home = Home.objects.create(user=self.user, home_name="SM Home")
        self.room = Room.objects.create(home=self.home, room_name="SM Room")
        # Reset singleton state
        self.manager = SmartmeterManager()
        self.manager.latest = {}

    def test_get_connection_params_none(self):
        # No active meters
        self.assertIsNone(self.manager._get_connection_params())

    def test_get_connection_params_active(self):
        SmartMeter.objects.create(room=self.room, device_name="M1", tag="TAG1", is_on=True)
        params = self.manager._get_connection_params()
        self.assertIsNotNone(params)
        self.assertIn("TAG1.v", params['tags'])

    @patch('homes.smartmeter.get_channel_layer')
    @patch('homes.smartmeter.async_to_sync')
    def test_handle_tag_update(self, mock_a, mock_g):
        self.manager.handle_tag_update("M1.v", 220, "now")
        latest = self.manager.get_latest()
        self.assertEqual(latest["M1.v"]["value"], 220)
        mock_a.assert_called()

    def test_close_logic(self):
        # Case: Active meters exist
        SmartMeter.objects.create(room=self.room, device_name="M2", tag="TAG2", is_on=True)
        with patch('builtins.print') as mock_print:
            self.manager.close()
            mock_print.assert_any_call("[SMARTMETER] ℹ️ Not closing. 1 meters still active.")
        
        # Case: No active meters
        SmartMeter.objects.all().delete()
        self.manager.close() # Should call super().close() safely
