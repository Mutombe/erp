from rest_framework.permissions import BasePermission

from apps.core.models import Roles

PORTAL_ROLES = {Roles.GUARDIAN_PORTAL, Roles.STUDENT_PORTAL}


class IsPortalUser(BasePermission):
    """Authenticated portal user (guardian or student role). Back-office staff
    and superusers are intentionally excluded — the portal is family-facing and
    has no cross-record visibility."""

    message = 'This area is for the family portal.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in PORTAL_ROLES)
