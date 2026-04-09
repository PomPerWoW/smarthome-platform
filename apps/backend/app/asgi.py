# config/asgi.py
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'app.settings')
# Initialize Django ASGI application early to ensure the AppRegistry
# is populated before importing code that may import ORM models.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
# from channels.auth import AuthMiddlewareStack # <-- Remove standard auth
from homes.middleware import TokenAuthMiddleware  # noqa: E402
import homes.routing  # noqa: E402

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": TokenAuthMiddleware(  # <-- Use your new middleware
        URLRouter(
            homes.routing.websocket_urlpatterns
        )
    ),
})