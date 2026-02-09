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
            
            from .scheduler import Scheduler
            Scheduler().start()
            
        elif any('gunicorn' in arg for arg in sys.argv) or 'daphne' in sys.argv[0] or 'uvicorn' in sys.argv[0]:
             from .scheduler import Scheduler
             Scheduler().start()