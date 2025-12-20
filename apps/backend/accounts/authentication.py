from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import AuthenticationFailed


class CookieTokenAuthentication(TokenAuthentication):

    def authenticate(self, request):
        token_key = request.COOKIES.get("auth_token")
        if not token_key:
            return None

        try:
            token = Token.objects.select_related("user").get(key=token_key)
        except Token.DoesNotExist:
            raise AuthenticationFailed("Invalid token.")

        if not token.user.is_active:
            raise AuthenticationFailed("User inactive or deleted.")

        return (token.user, token)
