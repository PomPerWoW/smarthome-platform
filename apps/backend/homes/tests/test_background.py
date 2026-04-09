import json
from unittest.mock import patch, MagicMock
from django.test import TestCase
from django.contrib.auth.models import User
from homes.models import Automation, Home, Room, Lightbulb
from homes.scheduler import Scheduler
from homes.scada_ws import WebSocket2Scada

class SchedulerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='sched_test', password='123')
        self.home = Home.objects.create(user=self.user, home_name="Sched Home")
        self.room = Room.objects.create(home=self.home, room_name="Sched Room")
        self.scheduler = Scheduler()
        # Reset singleton state for tests if possible, 
        # but since it's a singleton, we just manage _running
        self.scheduler._running = False

    @patch('os.environ.get')
    @patch('sys.argv', ['manage.py', 'runserver'])
    @patch('threading.Thread')
    def test_start_runserver_reloader(self, mock_thread, mock_env_get):
        # Case: RUN_MAIN=true
        mock_env_get.return_value = 'true'
        self.scheduler.start()
        self.assertTrue(self.scheduler._running)
        mock_thread.assert_called()
        self.scheduler.stop()

    @patch('os.environ.get')
    @patch('sys.argv', ['manage.py', 'runserver'])
    def test_start_runserver_parent(self, mock_env_get):
        # Case: RUN_MAIN=None (parent process of reloader)
        mock_env_get.return_value = None
        self.scheduler._running = False
        self.scheduler.start()
        self.assertFalse(self.scheduler._running)

    @patch('sys.argv', ['gunicorn'])
    @patch('threading.Thread')
    def test_start_production(self, mock_thread):
        # Case: Gunicorn (no runserver in argv)
        self.scheduler._running = False
        self.scheduler.start()
        self.assertTrue(self.scheduler._running)
        self.scheduler.stop()

    @patch("homes.services.get_channel_layer", return_value=None)
    def test_execute_automation_edge_cases(self, _mock_channel):
        light = Lightbulb.objects.create(
            room=self.room, device_name="Bulb", tag=None, is_on=False
        )
        auto = Automation.objects.create(
            device=light, title="No Tag Auto", action={"is_on": True}
        )

        self.scheduler._execute_automation(auto)
        light.refresh_from_db()
        self.assertTrue(light.is_on)

        light.tag = "L1"
        light.save()
        auto.action = {"unknown_key": "val"}
        auto.save()
        with patch("homes.services.ScadaManager") as mock_scada_class:
            mock_scada = mock_scada_class.return_value
            self.scheduler._execute_automation(auto)
            mock_scada.send_command.assert_not_called()

    @patch('homes.scheduler.time.sleep')
    @patch('homes.services.update_all_solar_automations')
    @patch('homes.models.Automation.objects.filter')
    def test_run_loop_once(self, mock_filter, mock_update_solar, mock_sleep):
        # Mock _running to terminate loop after one iteration
        # We can't easily do it inside the loop, so we mock the first thing it does 
        # to set _running = False
        
        self.scheduler._running = True
        
        # To break the loop after 1 iteration
        def side_effect(*args, **kwargs):
            self.scheduler._running = False
            return Automation.objects.none()
        
        mock_filter.side_effect = side_effect
        
        self.scheduler._run_loop()
        mock_update_solar.assert_called()
        mock_sleep.assert_called()

class SCADAWSTests(TestCase):
    def setUp(self):
        self.client_ws = WebSocket2Scada(
            target="test.com", login="u", password="p", token="t"
        )

    @patch('requests.get')
    def test_check_token(self, mock_get):
        mock_get.return_value.status_code = 200
        self.assertTrue(self.client_ws._check_token())
        
        mock_get.return_value.status_code = 401
        self.assertFalse(self.client_ws._check_token())
        
        mock_get.side_effect = Exception("error")
        self.assertFalse(self.client_ws._check_token())

    @patch('requests.post')
    def test_login(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"token": "new_t"}
        self.assertTrue(self._login_wrapper())
        self.assertEqual(self.client_ws.token, "new_t")

    def _login_wrapper(self):
         return self.client_ws._login()

    def test_on_message(self):
        mock_on_tag = MagicMock()
        self.client_ws.on_tag = mock_on_tag
        
        # Test notify_tag payload (wrapped)
        msg = json.dumps({
            "message": json.dumps({
                "type": "notify_tag",
                "tag": "my.tag",
                "value": 1,
                "time": "now"
            })
        })
        self.client_ws._on_message(None, msg)
        mock_on_tag.assert_called_with("my.tag", 1, "now")

        # Test notify_tag payload (direct)
        msg_direct = json.dumps({
            "type": "notify_tag",
            "tag": "direct.tag",
            "value": 2,
            "time": "then"
        })
        self.client_ws._on_message(None, msg_direct)
        mock_on_tag.assert_called_with("direct.tag", 2, "then")

        # Test invalid json
        self.client_ws._on_message(None, "not json") # Should not crash

    @patch('websocket.WebSocketApp')
    @patch('threading.Thread')
    def test_start_stop(self, mock_thread, mock_ws_app):
        with patch.object(WebSocket2Scada, '_ensure_token', return_value=True):
            self.client_ws.start()
            self.assertTrue(self.client_ws.is_connected())
            
            self.client_ws.close()
            self.assertFalse(self.client_ws.is_connected())

    def test_subscribe_and_send(self):
        mock_ws = MagicMock()
        self.client_ws._ws = mock_ws
        
        self.client_ws.subscribe(["tag1"])
        mock_ws.send.assert_called()
        
        self.client_ws.send_value("tag2", True)
        mock_ws.send.assert_called()
        
        self.client_ws.send_value("tag3", 42)
        mock_ws.send.assert_called()
