"""Data-driven, per-school permission matrix (the "Lego" system).

`RolePermission` rows define what each role may do per (module, action) in a
given school; `UserPermissionOverride` rows adjust individual users on top of
that. `effective_permissions` resolves the two into a flat matrix, `can` is the
yes/no convenience, and `ModulePermission` is the DRF gate every viewset uses.

Superusers bypass everything (the escape hatch that keeps admins from being
locked out). Missing rows fall back to read-by-default for authenticated
non-portal users, matching the pre-matrix behaviour exactly.
"""
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .models import Actions, Modules, Roles

MODULES = [value for value, _ in Modules.choices]
ACTIONS = [value for value, _ in Actions.choices]

# Read-ish actions granted by default to any authenticated non-portal user.
# Reproduces the pre-matrix rule where every signed-in user could GET anything.
DEFAULT_ALLOWED_ACTIONS = frozenset({'view', 'export'})
WRITE_ACTIONS = ('create', 'edit', 'delete', 'post', 'approve')

PORTAL_ROLES = frozenset({Roles.GUARDIAN_PORTAL, Roles.STUDENT_PORTAL})

# Legacy `write_area` values that predate the module vocabulary.
MODULE_ALIASES = {'core': 'settings'}

# Roles permitted to write in each module today. Mirrors the pre-matrix
# WRITE_ROLES exactly; `seed_permissions` replays this into RolePermission rows.
# (Ingestion currently rides on the procurement write_area, so it shares roles.)
WRITE_ROLES = {
    'accounting': {Roles.ADMIN, Roles.BURSAR, Roles.ACCOUNTS_CLERK},
    'fees': {Roles.ADMIN, Roles.BURSAR, Roles.ACCOUNTS_CLERK},
    'students': {Roles.ADMIN, Roles.BURSAR, Roles.HEAD},
    'attendance': {Roles.ADMIN, Roles.BURSAR, Roles.HEAD, Roles.TEACHER},
    'inventory': {Roles.ADMIN, Roles.BURSAR, Roles.STOREKEEPER},
    'procurement': {Roles.ADMIN, Roles.BURSAR, Roles.STOREKEEPER},
    'ingestion': {Roles.ADMIN, Roles.BURSAR, Roles.STOREKEEPER},
    'assets': {Roles.ADMIN, Roles.BURSAR},
    'reports': {Roles.ADMIN},
    'settings': {Roles.ADMIN},
    'users': {Roles.ADMIN},
}

# Human, lowercase module labels for the one-line refusal message.
MODULE_LABELS = {
    'accounting': 'accounting records',
    'fees': 'fee records',
    'students': 'student records',
    'attendance': 'attendance',
    'inventory': 'inventory',
    'procurement': 'procurement records',
    'assets': 'asset records',
    'ingestion': 'document ingestion',
    'reports': 'reports',
    'settings': 'settings',
    'users': 'users',
}

ACTION_LABELS = {
    'view': 'view', 'create': 'create', 'edit': 'edit', 'delete': 'delete',
    'post': 'post', 'approve': 'approve', 'export': 'export',
}

# DRF standard viewset action → permission ACTION.
_CRUD_ACTIONS = {
    'list': 'view', 'retrieve': 'view', 'metadata': 'view',
    'create': 'create',
    'update': 'edit', 'partial_update': 'edit',
    'destroy': 'delete',
}

# Known custom @action method names → permission ACTION. A viewset may override
# per-action via `action_permissions`; these defaults cover every app so
# viewsets need no per-action config.
DEFAULT_ACTION_MAP = {
    'post_journal': 'post', 'post_entry': 'post', 'post_invoice': 'post',
    'post_credit_note': 'post', 'post_grn': 'post', 'post_bill': 'post',
    'reverse': 'post', 'cancel': 'post', 'preview': 'post', 'execute': 'post',
    'lock': 'post', 'unlock': 'post', 'complete': 'post',
    'dispose': 'post', 'run': 'post',
    'toggle_item': 'edit', 'mark': 'edit', 'extract': 'edit', 'edit_extraction': 'edit',
    'upload': 'create', 'receive': 'create', 'issue': 'create', 'transfer': 'create',
    'approve': 'approve', 'reject': 'approve',
}


def _canon_module(name):
    return MODULE_ALIASES.get(name, name)


def _resolve_school(user, school):
    """Fall back from an explicit school to the user's home school, then the
    default school — matching the codebase's single-tenant transition helpers."""
    if school is not None:
        return school
    from .models import School

    home = getattr(user, 'home_school', None)
    return home or School.get_default()


def effective_permissions(user, school):
    """Resolve the full {module: {action: bool}} matrix for `user` in `school`.

    Superusers get everything (escape hatch). Portal roles get nothing (the
    back office is off limits). Everyone else starts from the read-by-default
    baseline, then the school's RolePermission rows for their role, then their
    personal UserPermissionOverride rows (which win)."""
    blank = {m: {a: False for a in ACTIONS} for m in MODULES}
    if not (user and getattr(user, 'is_authenticated', False)):
        return blank
    if user.is_superuser:
        return {m: {a: True for a in ACTIONS} for m in MODULES}
    if user.role in PORTAL_ROLES:
        return blank

    matrix = {m: {a: (a in DEFAULT_ALLOWED_ACTIONS) for a in ACTIONS} for m in MODULES}

    if school is not None:
        from .models import RolePermission

        for rp in RolePermission.objects.filter(school=school, role=user.role):
            if rp.module in matrix and rp.action in matrix[rp.module]:
                matrix[rp.module][rp.action] = rp.allowed

    if getattr(user, 'pk', None):
        from .models import UserPermissionOverride

        for ov in UserPermissionOverride.objects.filter(user=user):
            if ov.module in matrix and ov.action in matrix[ov.module]:
                matrix[ov.module][ov.action] = ov.allowed
    return matrix


def role_matrix(school, role):
    """The stored matrix for a (school, role), backfilled with defaults — used
    by the admin grid endpoints (ignores per-user overrides)."""
    if role in PORTAL_ROLES:
        return {m: {a: False for a in ACTIONS} for m in MODULES}
    matrix = {m: {a: (a in DEFAULT_ALLOWED_ACTIONS) for a in ACTIONS} for m in MODULES}
    from .models import RolePermission

    for rp in RolePermission.objects.filter(school=school, role=role):
        if rp.module in matrix and rp.action in matrix[rp.module]:
            matrix[rp.module][rp.action] = rp.allowed
    return matrix


def can(user, school, module, action):
    """Yes/no: may `user` perform `action` on `module` within `school`?"""
    if not (user and getattr(user, 'is_authenticated', False)):
        return False
    if user.is_superuser:
        return True
    if user.role in PORTAL_ROLES:
        return False
    module = _canon_module(module)
    perms = effective_permissions(user, _resolve_school(user, school))
    return perms.get(module, {}).get(action, False)


class ModulePermission(BasePermission):
    """DRF gate backed by the per-school permission matrix.

    ViewSets declare `module` (preferred) or the legacy `write_area`. The DRF
    action is mapped to a permission ACTION, then checked against the effective
    matrix. Refusals are a clean one-liner."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        module = getattr(view, 'module', None) or getattr(view, 'write_area', None)
        if module is None:
            # Unspecified module: read for anyone, write for admins (legacy).
            if request.method in SAFE_METHODS or user.is_superuser or user.role == Roles.ADMIN:
                return True
            raise PermissionDenied("You don't have permission to perform this action.")

        module = _canon_module(module)
        action = self._action_for(request, view)
        if can(user, getattr(request, 'school', None), module, action):
            return True

        verb = ACTION_LABELS.get(action, action)
        label = MODULE_LABELS.get(module, module)
        raise PermissionDenied(f"You don't have permission to {verb} {label}.")

    @staticmethod
    def _action_for(request, view):
        view_action = getattr(view, 'action', None)
        overrides = getattr(view, 'action_permissions', None) or {}
        if view_action in overrides:
            return overrides[view_action]
        if view_action in _CRUD_ACTIONS:
            return _CRUD_ACTIONS[view_action]
        if view_action in DEFAULT_ACTION_MAP:
            return DEFAULT_ACTION_MAP[view_action]
        # No mapping: safe reads are 'view', anything else is a write ('edit').
        return 'view' if request.method in SAFE_METHODS else 'edit'


# Backward-compatible alias: every viewset still importing RoleWritePermission
# now transparently uses the matrix-driven gate.
RoleWritePermission = ModulePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == Roles.ADMIN)
