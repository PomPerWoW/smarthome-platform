import json
from django.contrib.auth.models import User
from django.urls import reverse
from django.test import TransactionTestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.authtoken.models import Token
from channels.testing import WebsocketCommunicator
from app.asgi import application
from .models import Home, Room, Lightbulb, Device
from asgiref.sync import sync_to_async

class BackendIntegrationTests(TransactionTestCase):
    """
    Integration tests covering the full flow from User Registration 
    to database updates via WebSockets.
    
    This test uses standard Django tools and asgiref to handle async
    interactions without needing pytest.
    """
    
    def setUp(self):
        self.api_client = APIClient()
        self.user_data = {
            'email': 'integration@test.com',
            'password': 'password123',
            'password_confirm': 'password123'
        }

    async def test_full_user_flow_and_websocket_update(self):
        """
        Scenario:
        1. Register user via REST API
        2. Create Home, Room, and Device via DB (simulation)
        3. Connect to Home WebSocket (authenticated)
        4. Send a lightbulb_onoff command
        5. Verify database update and broadcast message
        """
        
        # 1. Register User via API
        reg_url = reverse('register')
        # Wrap sync APIClient call in sync_to_async
        response = await sync_to_async(self.api_client.post)(reg_url, self.user_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        user = await sync_to_async(User.objects.get)(email='integration@test.com')
        token = await sync_to_async(Token.objects.get)(user=user)

        # 2. Setup Device (Simulation of user setting up their home)
        home = await sync_to_async(Home.objects.create)(user=user, home_name="Integration Home")
        room = await sync_to_async(Room.objects.create)(home=home, room_name="Living Room")
        device = await sync_to_async(Lightbulb.objects.create)(room=room, device_name="Main Light", tag="LIGHT_001")

        # 3. Connect to WebSocket
        # The TokenAuthMiddleware looks for 'token' in query string
        path = f"/ws/homes/?token={token.key}"
        communicator = WebsocketCommunicator(application, path)
        connected, _ = await communicator.connect()
        self.assertTrue(connected, "WebSocket failed to connect")

        # 4. Send action from Frontend (WebSocket)
        await communicator.send_json_to({
            "action": "lightbulb_onoff",
            "device_id": str(device.id),
            "value": True
        })

        # 5. Receive broadcast back from server
        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "device_update")
        self.assertEqual(response["device_id"], str(device.id))
        self.assertEqual(response["value"], True)

        # 6. Verify Database Update
        updated_device = await sync_to_async(Device.objects.get)(id=device.id)
        self.assertTrue(updated_device.is_on)

        # 7. Close connection
        await communicator.disconnect()
