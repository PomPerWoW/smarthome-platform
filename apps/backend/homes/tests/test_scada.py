from unittest.mock import patch, MagicMock
from django.test import TestCase
from homes.scada import ScadaManager
from homes.models import Device, Home, Room, Lightbulb, AirConditioner, Fan, Television
from django.contrib.auth.models import User

class ScadaManagerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='scada_tester', password='123')
        self.home = Home.objects.create(user=self.user, home_name="Scada Home")
        self.room = Room.objects.create(home=self.home, room_name="Scada Room")
        self.manager = ScadaManager()

    @patch('homes.scada.get_channel_layer')
    @patch('homes.scada.async_to_sync')
    def test_handle_tag_update_lightbulb(self, mock_async_to_sync, mock_get_channel_layer):
        light = Lightbulb.objects.create(room=self.room, device_name="Test Bulb", tag="TEST.Light1")
        
        # Test onoff -> True
        self.manager.handle_tag_update("TEST.Light1.onoff", "1", "12:00")
        light.refresh_from_db()
        self.assertTrue(light.is_on)
        
        # Test onoff -> False
        self.manager.handle_tag_update("TEST.Light1.onoff", "off", "12:00")
        light.refresh_from_db()
        self.assertFalse(light.is_on)

        # Test Color
        self.manager.handle_tag_update("TEST.Light1.Color", "#ff0000", "12:00")
        light.refresh_from_db()
        self.assertEqual(light.colour, "#ff0000")

        # Test Brightness
        self.manager.handle_tag_update("TEST.Light1.Brightness", "85", "12:00")
        light.refresh_from_db()
        self.assertEqual(light.brightness, 85)

    @patch('homes.scada.get_channel_layer')
    @patch('homes.scada.async_to_sync')
    def test_handle_tag_update_ac(self, mock_a, mock_g):
        ac = AirConditioner.objects.create(room=self.room, device_name="Test AC", tag="TEST.AC1")
        
        self.manager.handle_tag_update("TEST.AC1.set_temp", "24.5", "12:00")
        ac.refresh_from_db()
        self.assertEqual(ac.temperature, 24.5)

    @patch('homes.scada.get_channel_layer')
    @patch('homes.scada.async_to_sync')
    def test_handle_tag_update_fan(self, mock_a, mock_g):
        fan = Fan.objects.create(room=self.room, device_name="Test Fan", tag="TEST.Fan1")
        
        self.manager.handle_tag_update("TEST.Fan1.speed", "3", "12:00")
        fan.refresh_from_db()
        self.assertEqual(fan.speed, 3)

        self.manager.handle_tag_update("TEST.Fan1.shake", "on", "12:00")
        fan.refresh_from_db()
        self.assertTrue(fan.swing)

    @patch('homes.scada.get_channel_layer')
    @patch('homes.scada.async_to_sync')
    def test_handle_tag_update_tv(self, mock_a, mock_g):
        tv = Television.objects.create(room=self.room, device_name="Test TV", tag="TEST.TV1")
        
        self.manager.handle_tag_update("TEST.TV1.volume", "40", "12:00")
        tv.refresh_from_db()
        self.assertEqual(tv.volume, 40)

        self.manager.handle_tag_update("TEST.TV1.channel", "5", "12:00")
        tv.refresh_from_db()
        self.assertEqual(tv.channel, 5)

        self.manager.handle_tag_update("TEST.TV1.mute", "true", "12:00")
        tv.refresh_from_db()
        self.assertTrue(tv.is_mute)
        
    @patch('homes.scada.get_channel_layer')
    @patch('homes.scada.async_to_sync')
    def test_handle_tag_invalid_tag(self, mock_a, mock_g):
        # Should not crash on invalid tag (Exception block in handle_tag_update)
        try:
            self.manager.handle_tag_update("INVALID_NO_DOT", "val", "time")
            self.manager.handle_tag_update("INVALID.Not.Exists", "val", "time")
        except Exception:
            self.fail("handle_tag_update raised an exception instead of catching it safely")
