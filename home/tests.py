from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from django.contrib.auth.models import User


class HomeFlowTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tester", password="pass1234")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_hierarchy_and_device_actions(self):
        # Create Home
        resp = self.client.post("/api/home/homes/", {"name": "MyHome"}, format="json")
        self.assertEqual(resp.status_code, 201)
        home_id = resp.data["id"]

        # Create Floor
        resp = self.client.post(f"/api/home/homes/{home_id}/floors/", {"name": "Main", "number": 1}, format="json")
        self.assertEqual(resp.status_code, 201)
        floor_id = resp.data["id"]

        # Create Room
        resp = self.client.post(
            f"/api/home/homes/{home_id}/floors/{floor_id}/rooms/",
            {"name": "Living"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        room_id = resp.data["id"]

        # Add Device (Lightbulb)
        resp = self.client.post(
            f"/api/home/homes/{home_id}/floors/{floor_id}/rooms/{room_id}/devices/",
            {"type": "lightbulb", "name": "Ceiling Light"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        device_id = resp.data["id"]

        # Toggle power
        resp = self.client.post(f"/api/home/devices/{device_id}/toggle/", {"on": True}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["is_on"]) 

        # Set brightness
        resp = self.client.post(
            f"/api/home/devices/{device_id}/lightbulb/",
            {"brightness": 80, "colour": "warm"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["brightness"], 80)

        # Set position
        resp = self.client.post(
            f"/api/home/devices/{device_id}/position/",
            {"lon": 100.5, "lat": 13.75, "alt": 5.0},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["position"], [100.5, 13.75, 5.0])

