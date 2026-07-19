from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Roles

# Roles allowed to write in each functional area; auditors are always read-only.
WRITE_ROLES = {
    'accounting': {Roles.ADMIN, Roles.BURSAR, Roles.ACCOUNTS_CLERK},
    'fees': {Roles.ADMIN, Roles.BURSAR, Roles.ACCOUNTS_CLERK},
    'students': {Roles.ADMIN, Roles.BURSAR, Roles.HEAD},
    'inventory': {Roles.ADMIN, Roles.BURSAR, Roles.STOREKEEPER},
    'procurement': {Roles.ADMIN, Roles.BURSAR, Roles.STOREKEEPER},
    'core': {Roles.ADMIN},
    'assets': {Roles.ADMIN, Roles.BURSAR},
}


class RoleWritePermission(BasePermission):
    """Read for any authenticated user; write restricted per module.

    ViewSets set `write_area = '<module>'`.
    """

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        area = getattr(view, 'write_area', None)
        if area is None:
            return user.role == Roles.ADMIN
        return user.role in WRITE_ROLES.get(area, {Roles.ADMIN})


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == Roles.ADMIN)
