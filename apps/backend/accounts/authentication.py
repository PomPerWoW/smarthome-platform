from rest_framework.authentication import SessionAuthentication, TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import AuthenticationFailed


class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return


class MultiSourceTokenAuthentication(TokenAuthentication):
    keyword = "Token"

    def authenticate(self, request):
        auth = super().authenticate(request)
        if auth is not None:
            return auth

        token_key = request.COOKIES.get("auth_token")
        if token_key:
            return self._authenticate_token(token_key)

        token_key = request.query_params.get("token")
        if token_key:
            return self._authenticate_token(token_key)

        return None

    def _authenticate_token(self, token_key):
        try:
            token = Token.objects.select_related("user").get(key=token_key)
        except Token.DoesNotExist:
            raise AuthenticationFailed("Invalid token.")

        if not token.user.is_active:
            raise AuthenticationFailed("User inactive or deleted.")

        return (token.user, token)
