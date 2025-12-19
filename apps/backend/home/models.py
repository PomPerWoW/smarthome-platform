import uuid
from django.contrib.gis.db import models
from django.contrib.auth.models import User

class PositionHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_id = models.UUIDField(db_index=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    # 3D point; PostGIS supports Z – store in SRID 4326 by default
    point = models.PointField(dim=3, srid=4326)  # you can store (x,y,z); z kept

    class Meta:
        indexes = [models.Index(fields=["device_id", "recorded_at"])]
        ordering = ["-recorded_at"]


class UserHome(models.Model):
    """Model to track home ownership - maps users to their homes"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='homes')
    home_id = models.UUIDField(db_index=True, help_text="UUID of the home in ZODB")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = [['user', 'home_id']]
        indexes = [
            models.Index(fields=['user', 'home_id']),
            models.Index(fields=['home_id']),
        ]
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.user.email} - Home {self.home_id}"
