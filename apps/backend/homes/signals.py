# homes/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Device, AirConditioner, Fan, Lightbulb, Television, SmartMeter, PositionHistory
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

@receiver(post_save, sender=Device)
@receiver(post_save, sender=AirConditioner)
@receiver(post_save, sender=Fan)
@receiver(post_save, sender=Lightbulb)
@receiver(post_save, sender=Television)
@receiver(post_save, sender=SmartMeter)
def create_initial_device_history(sender, instance, created, **kwargs):
    if created:
        if not PositionHistory.objects.filter(device_id=instance.id).exists():
            PositionHistory.objects.create(
                device_id=instance.id,
                point=None
            )

@receiver(post_save, sender=Device)
@receiver(post_save, sender=AirConditioner)
@receiver(post_save, sender=Fan)
@receiver(post_save, sender=Lightbulb)
@receiver(post_save, sender=Television)
@receiver(post_save, sender=SmartMeter)
def broadcast_device_update(sender, instance, created, **kwargs):
    # Prevent duplicate broadcasts for multi-table inheritance
    if type(instance) != sender:
        return
        
    channel_layer = get_channel_layer()
    if channel_layer:
        async_to_sync(channel_layer.group_send)(
            "homes_group",
            {
                "type": "device_update",
                "device_id": str(instance.id),
                "action": "update",
                "status": "success",
            }
        )