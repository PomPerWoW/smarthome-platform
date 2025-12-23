from rest_framework.authentication import TokenAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed


class MultiTokenAuthentication(TokenAuthentication):
    """
    Token auth that supports:
    - Authorization header:  Authorization: Token <key>  (or Bearer <key>)
    - Cookie:               auth_token=<key>
    - Query param:          ?token=<key>

    This enables the same auth_token to be used across the main frontend and the
    scene creator (including initial XR access where a token might be embedded
    in the URL).
    """

    def authenticate(self, request):
        # 1) Authorization header (preferred)
        auth = get_authorization_header(request).split()
        if auth and len(auth) == 2:
            prefix = auth[0].lower()
            if prefix in (b"token", b"bearer"):
                try:
                    key = auth[1].decode()
                except UnicodeError:
                    raise AuthenticationFailed("Invalid token header.")
                return self.authenticate_credentials(key)

        # 2) Cookie
        token_key = request.COOKIES.get("auth_token")
        if token_key:
            return self.authenticate_credentials(token_key)

        # 3) Query param (for embedded-token flows)
        token_key = request.query_params.get("token")
        if token_key:
            return self.authenticate_credentials(token_key)

        return None
