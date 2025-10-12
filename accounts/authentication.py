from rest_framework.authentication import TokenAuthentication
from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """
    SessionAuthentication with CSRF protection disabled for API endpoints
    """
    def enforce_csrf(self, request):
        return  # To not perform the csrf check previously happening
