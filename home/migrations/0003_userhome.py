# Generated manually for UserHome model

import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('home', '0002_alter_point_3d'),
    ]

    operations = [
        migrations.CreateModel(
            name='UserHome',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('home_id', models.UUIDField(db_index=True, help_text='UUID of the home in ZODB')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='homes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
                'unique_together': {('user', 'home_id')},
                'indexes': [
                    models.Index(fields=['user', 'home_id'], name='home_userho_user_id_home_i_idx'),
                    models.Index(fields=['home_id'], name='home_userho_home_id_idx'),
                ],
            },
        ),
    ]

