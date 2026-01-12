import sys
from django.apps import AppConfig

class HomesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'homes'

    def ready(self):
        import homes.signals

        if 'runserver' in sys.argv:
            from .scada import ScadaManager
            ScadaManager().start()