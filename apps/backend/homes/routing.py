from django.conf import settings
from django.urls import re_path

from . import consumers

_api_prefix = getattr(settings, "API_PREFIX", "") or ""
_api_prefix = _api_prefix.strip().strip("/")
_ws_route = f"{_api_prefix}/ws/homes/$" if _api_prefix else "ws/homes/$"

websocket_urlpatterns = [
    re_path(_ws_route, consumers.HomeConsumer.as_asgi()),
]