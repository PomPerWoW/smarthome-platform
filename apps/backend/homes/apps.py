import sys
from django.apps import AppConfig

class HomesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'homes'

    def ready(self):
        import homes.signals

        # Check if we are running as a server (runserver, gunicorn, uvicorn)
        # sys.argv for gunicorn usually looks like ['/usr/local/bin/gunicorn', ...]
        is_runserver = 'runserver' in sys.argv
        is_gunicorn = any('gunicorn' in arg for arg in sys.argv)
        is_uvicorn = any('uvicorn' in arg for arg in sys.argv)

        if is_runserver or is_gunicorn or is_uvicorn:
            from .scada import ScadaManager
            ScadaManager().start()