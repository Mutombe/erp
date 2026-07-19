from rest_framework.authentication import SessionAuthentication


class CsrfExemptSessionAuthentication(SessionAuthentication):
    """Session auth without CSRF enforcement (API is consumed by the SPA with SameSite cookies)."""

    def enforce_csrf(self, request):
        return
