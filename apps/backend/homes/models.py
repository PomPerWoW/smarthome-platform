import uuid
from django.contrib.gis.db import models
from django.conf import settings

class Home(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='homes')
    home_name = models.CharField(max_length=255)

    def __str__(self):
        return self.home_name

class Room(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    home = models.ForeignKey(Home, on_delete=models.CASCADE, related_name='rooms')
    room_name = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.room_name} ({self.home.home_name})"

# --- BASE PARENT CLASS ---
class Device(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    device_name = models.CharField(max_length=255)
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True, related_name='devices')
    # PostGIS 3D Point (x, y, z)
    device_pos = models.PointField(dim=3, srid=4326, null=True, blank=True)

    def __str__(self):
        return self.device_name

class PositionHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='history')
    timestamp = models.DateTimeField(auto_now_add=True)
    
    point = models.PointField(dim=3, srid=4326, null=True, blank=True)

    class Meta:
        ordering = ['-timestamp']

# --- CHILD CLASSES ---

class AirConditioner(Device):
    temperature = models.FloatField(default=24.0)

class Fan(Device):
    speed = models.IntegerField(default=1)
    swing = models.BooleanField(default=False)

class Lightbulb(Device):
    brightness = models.IntegerField(default=100)
    colour = models.CharField(max_length=50, default="#FFFFFF")

class Television(Device):
    volume = models.IntegerField(default=20)
    channel = models.IntegerField(default=1)
    is_mute = models.BooleanField(default=False)