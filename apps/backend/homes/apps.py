from django.apps import AppConfig


class HomesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'homes'
    
    def ready(self):
        import homes.signals
