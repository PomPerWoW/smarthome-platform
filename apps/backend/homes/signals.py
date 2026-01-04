# homes/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Device, AirConditioner, Fan, Lightbulb, Television, PositionHistory

@receiver(post_save, sender=Device)
@receiver(post_save, sender=AirConditioner)
@receiver(post_save, sender=Fan)
@receiver(post_save, sender=Lightbulb)
@receiver(post_save, sender=Television)
def create_initial_device_history(sender, instance, created, **kwargs):
    if created:
        if not PositionHistory.objects.filter(device_id=instance.id).exists():
            PositionHistory.objects.create(
                device_id=instance.id,
                point=None
            )