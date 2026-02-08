from django.contrib.auth.models import AnonymousUser
from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from rest_framework.authtoken.models import Token
from urllib.parse import parse_qs

@database_sync_to_async
def get_user(token_key):
    try:
        return Token.objects.get(key=token_key).user
    except Token.DoesNotExist:
        return AnonymousUser()

class TokenAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        # 1. Try to find token in query string: ?token=xxxx
        print(f"[TokenAuthMiddleware] Scope type: {scope['type']}")
        query_string = scope.get("query_string", b"").decode()
        query_params = parse_qs(query_string)
        token_key = query_params.get("token", [None])[0]

        # 2. If not in query, try to find in 'auth_token' cookie
        if not token_key:
            headers = dict(scope.get("headers", []))
            print(f"[TokenAuthMiddleware] Headers: {headers}")
            if b"cookie" in headers:
                cookies = headers[b"cookie"].decode()
                print(f"[TokenAuthMiddleware] Cookies: {cookies}")
                for cookie in cookies.split(";"):
                    if "=" in cookie:
                        key, value = cookie.strip().split("=", 1)
                        if key == "auth_token":
                            token_key = value
                            print(f"[TokenAuthMiddleware] Found token in cookie: {token_key}")
                            break
            else:
                print("[TokenAuthMiddleware] No cookie header found")

        if token_key:
            scope["user"] = await get_user(token_key)
            print(f"[TokenAuthMiddleware] User found: {scope['user']}")
        else:
            print("[TokenAuthMiddleware] No token found, setting AnonymousUser")
            scope["user"] = AnonymousUser()
        
        return await super().__call__(scope, receive, send)