import uuid
from django.contrib.gis.db import models

class PositionHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_id = models.UUIDField(db_index=True)
    recorded_at = models.DateTimeField(auto_now_add=True)
    # 3D point; PostGIS supports Z – store in SRID 4326 by default
    point = models.PointField(dim=3, srid=4326)  # you can store (x,y,z); z kept

    class Meta:
        indexes = [models.Index(fields=["device_id", "recorded_at"])]
        ordering = ["-recorded_at"]
