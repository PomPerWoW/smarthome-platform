# homes/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Device, AirConditioner, Fan, Lightbulb, Television, PositionHistory

# List all models you want to listen to
@receiver(post_save, sender=Device)
@receiver(post_save, sender=AirConditioner)
@receiver(post_save, sender=Fan)
@receiver(post_save, sender=Lightbulb)
@receiver(post_save, sender=Television)
def create_initial_device_history(sender, instance, created, **kwargs):
    if created:
        # Check if we already created a history (to prevent duplicates if multiple signals fire)
        # Note: We use the Device instance ID
        if not PositionHistory.objects.filter(device_id=instance.id).exists():
            PositionHistory.objects.create(
                device_id=instance.id, # Use ID directly to handle polymorphism safely
                point=None
            )