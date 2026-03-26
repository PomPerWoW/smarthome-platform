# Generated migration for room_model field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('homes', '0009_furniture'),
    ]

    operations = [
        migrations.AddField(
            model_name='room',
            name='room_model',
            field=models.CharField(default='LabPlan', help_text='3D model identifier for the room scene (e.g. LabPlan)', max_length=255),
        ),
    ]
