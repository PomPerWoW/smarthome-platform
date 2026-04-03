# Generated manually for AvatarScript feature

import uuid

import django.db.models.deletion
from django.db import migrations, models

import homes.models


class Migration(migrations.Migration):

    dependencies = [
        ("homes", "0014_merge_20260324_0929"),
    ]

    operations = [
        migrations.CreateModel(
            name="AvatarScript",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("avatar_id", models.CharField(max_length=50)),
                ("avatar_name", models.CharField(max_length=100)),
                ("avatar_type", models.CharField(choices=[("npc", "NPC"), ("robot", "Robot")], max_length=20)),
                (
                    "script_file",
                    models.FileField(blank=True, null=True, upload_to=homes.models.avatar_script_upload_path),
                ),
                ("script_data", models.JSONField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "room",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="avatar_scripts",
                        to="homes.room",
                    ),
                ),
            ],
        ),
        migrations.AddConstraint(
            model_name="avatarscript",
            constraint=models.UniqueConstraint(fields=("room", "avatar_id"), name="uniq_avatar_script_per_room_avatar"),
        ),
    ]
