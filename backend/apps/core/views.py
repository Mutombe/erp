from django.contrib.auth import authenticate, login, logout
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .filters import AuditTrailFilter, UserFilter
from .models import (
    Actions,
    AuditTrail,
    DocumentSequence,
    Modules,
    Organization,
    RolePermission,
    School,
    User,
    UserPermissionOverride,
)
from .permissions import (
    ACTIONS,
    MODULES,
    ModulePermission,
    RoleWritePermission,
    effective_permissions,
    role_matrix,
)
from .serializers import (
    AuditTrailSerializer,
    DocumentSequenceSerializer,
    LoginSerializer,
    OrganizationSerializer,
    SchoolSerializer,
    SchoolSettingsSerializer,
    SchoolSummarySerializer,
    UserSerializer,
)


class LoginThrottle(ScopedRateThrottle):
    scope = 'login'


# Sentinel values a client may pass for `school` to mean "Golden Knot — all
# schools" (HQ viewing everything, no single active school).
_ALL_SCHOOL_TOKENS = {'', 'all', 'null', 'none'}


def _resolve_school(value):
    """Resolve a `school` payload value (id or code) to a School, or None when
    the value means "all schools". Returns (school_or_None, is_all)."""
    if value is None:
        return None, True
    token = str(value).strip()
    if token.lower() in _ALL_SCHOOL_TOKENS:
        return None, True
    qs = School.objects.filter(is_active=True)
    school = None
    if token.isdigit():
        school = qs.filter(id=int(token)).first()
    if school is None:
        school = qs.filter(code__iexact=token).first()
    return school, False


def _me_payload(request, user):
    """The extended `me` shape: the user, tenancy flags, the schools they may
    see and the currently-active school (null = HQ viewing all)."""
    ctx = {'request': request}
    data = UserSerializer(user).data
    active = getattr(request, 'school', None)
    data['is_hq'] = user.is_hq
    data['home_school'] = user.home_school_id
    data['accessible_schools'] = SchoolSummarySerializer(
        user.accessible_schools.order_by('code'), many=True, context=ctx
    ).data
    data['active_school'] = (
        SchoolSummarySerializer(active, context=ctx).data if active else None
    )
    # Effective permission matrix for the active school (falls back to the
    # user's home / the default school) so the frontend can gate the UI.
    perm_school = active or user.home_school or School.get_default()
    data['permissions'] = effective_permissions(user, perm_school)
    return data


def _set_active_school(request, user, raw_value, *, required_when_present=True):
    """Authorize and persist the active school for this session.

    Returns an error Response on failure, else None (session updated)."""
    school, is_all = _resolve_school(raw_value)

    if is_all:
        # "All schools" is only meaningful for HQ users. A scoped user must
        # settle on a concrete school.
        if not user.is_hq:
            return Response(
                {'detail': 'Select a school to continue.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.session['active_school_id'] = None
        request.school = None
        return None

    if school is None:
        return Response(
            {'detail': 'That school was not found.'}, status=status.HTTP_404_NOT_FOUND
        )

    # Authorize: HQ sees all; everyone else must have the school in their set.
    allowed = user.is_hq or user.accessible_schools.filter(id=school.id).exists()
    if not allowed:
        return Response(
            {'detail': f"You don't have access to {school.name}."},
            status=status.HTTP_403_FORBIDDEN,
        )

    request.session['active_school_id'] = school.id
    request.school = school
    return None


@api_view(['GET'])
@permission_classes([AllowAny])
def public_schools_view(request):
    """Pre-login list of active schools for the school picker."""
    schools = School.objects.filter(is_active=True).order_by('code')
    return Response(SchoolSummarySerializer(schools, many=True, context={'request': request}).data)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = authenticate(
        request,
        username=serializer.validated_data['email'],
        password=serializer.validated_data['password'],
    )
    if user is None:
        return Response({'detail': 'Invalid email or password.'}, status=status.HTTP_401_UNAUTHORIZED)
    if not user.is_active:
        return Response({'detail': 'Account is disabled.'}, status=status.HTTP_403_FORBIDDEN)

    login(request, user)

    # Resolve + authorize the requested school before we commit the response.
    raw_school = serializer.validated_data.get('school', None)
    if raw_school is None and 'school' not in request.data and not user.is_hq:
        # A scoped user who omitted the school defaults to their home school.
        raw_school = user.home_school_id
    error = _set_active_school(request, user, raw_school)
    if error is not None:
        logout(request)
        return error

    AuditTrail.log('login', user, user=user)
    return Response(_me_payload(request, user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    AuditTrail.log('logout', request.user, user=request.user)
    request.session.pop('active_school_id', None)
    logout(request)
    return Response({'detail': 'Logged out.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response(_me_payload(request, request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def switch_school_view(request):
    """Change the active school mid-session (HQ / multi-school users)."""
    raw_school = request.data.get('school', None)
    error = _set_active_school(request, request.user, raw_school)
    if error is not None:
        return error
    return Response(_me_payload(request, request.user))


class UserViewSet(viewsets.ModelViewSet):
    """Onboarding + user admin. Gated by the `users` module (admin-only, since
    the matrix seeds users as admin-only). A non-superuser/non-HQ admin manages
    only users of their own school(s); superuser/HQ manage everyone."""

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [ModulePermission]
    module = 'users'
    search_fields = ['email', 'first_name', 'last_name']
    filterset_class = UserFilter
    ordering_fields = '__all__'

    def get_queryset(self):
        qs = super().get_queryset()
        actor = self.request.user
        if actor.is_superuser or actor.is_hq:
            return qs
        school_ids = set(actor.accessible_schools.values_list('id', flat=True))
        return qs.filter(home_school_id__in=school_ids)

    def _assert_school_scope(self, serializer):
        """A scoped admin may only create/manage users in their own school and
        may not mint HQ users."""
        actor = self.request.user
        if actor.is_superuser or actor.is_hq:
            return
        if serializer.validated_data.get('is_hq'):
            raise PermissionDenied('Only HQ can create HQ users.')
        allowed = set(actor.accessible_schools.values_list('id', flat=True))
        home = serializer.validated_data.get('home_school', None)
        target = getattr(home, 'id', None)
        if target is None and serializer.instance is not None:
            target = serializer.instance.home_school_id
        if target is None or target not in allowed:
            raise PermissionDenied("You can only manage users in your own school.")

    def perform_create(self, serializer):
        self._assert_school_scope(serializer)
        serializer.save()

    def perform_update(self, serializer):
        self._assert_school_scope(serializer)
        serializer.save()


def _write_matrix_rows(model_manager, keyfields, payload):
    """Upsert {module: {action: bool}} rows into RolePermission/UserPermissionOverride."""
    written = 0
    for module, actions in (payload or {}).items():
        if module not in MODULES or not isinstance(actions, dict):
            continue
        for action, allowed in actions.items():
            if action not in ACTIONS:
                continue
            model_manager.update_or_create(
                module=module, action=action, defaults={'allowed': bool(allowed)}, **keyfields
            )
            written += 1
    return written


class RolePermissionMatrixView(APIView):
    """GET/PUT the editable role matrix for a (school, role).

    GET  /api/core/role-permissions/?school=&role=  → {permissions: {module: {action: bool}}}
    PUT  body {school, role, permissions}            → upserts and echoes it back."""

    permission_classes = [ModulePermission]
    module = 'users'

    def _school(self, request):
        raw = request.query_params.get('school') or request.data.get('school')
        if raw:
            school, _is_all = _resolve_school(raw)
            if school is not None:
                return school
        return getattr(request, 'school', None) or School.get_default()

    def _role(self, request):
        role = request.query_params.get('role') or request.data.get('role')
        if not role:
            raise PermissionDenied('A role is required.')
        return role

    def get(self, request):
        school = self._school(request)
        role = self._role(request)
        return Response({'school': school.id, 'role': role, 'permissions': role_matrix(school, role)})

    def put(self, request):
        school = self._school(request)
        role = self._role(request)
        _write_matrix_rows(
            RolePermission.objects, {'school': school, 'role': role},
            request.data.get('permissions', {}),
        )
        return Response({'school': school.id, 'role': role, 'permissions': role_matrix(school, role)})


class UserOverrideView(APIView):
    """GET/PUT a single user's permission overrides (on top of their role)."""

    permission_classes = [ModulePermission]
    module = 'users'

    def _overrides(self, user_id):
        out = {}
        for ov in UserPermissionOverride.objects.filter(user_id=user_id):
            out.setdefault(ov.module, {})[ov.action] = ov.allowed
        return out

    def get(self, request, user_id):
        return Response({'user': int(user_id), 'overrides': self._overrides(user_id)})

    def put(self, request, user_id):
        user = User.objects.filter(id=user_id).first()
        if user is None:
            return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        _write_matrix_rows(
            UserPermissionOverride.objects, {'user': user},
            request.data.get('overrides', request.data.get('permissions', {})),
        )
        return Response({'user': user.id, 'overrides': self._overrides(user.id)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def permission_schema_view(request):
    """The module + action vocabulary (values + human labels) for rendering the grid."""
    return Response({
        'modules': [{'value': v, 'label': label} for v, label in Modules.choices],
        'actions': [{'value': v, 'label': label} for v, label in Actions.choices],
    })


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [RoleWritePermission]
    module = 'settings'
    pagination_class = None


class SchoolViewSet(viewsets.ModelViewSet):
    queryset = School.objects.select_related('organization').all()
    serializer_class = SchoolSerializer
    permission_classes = [RoleWritePermission]
    module = 'settings'
    search_fields = ['code', 'name', 'email']
    ordering_fields = '__all__'
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user and user.is_authenticated and not user.is_hq:
            return qs.filter(id__in=user.accessible_schools.values_list('id', flat=True))
        return qs


class SchoolSettingsViewSet(viewsets.ViewSet):
    """Settings for the active/default school: GET/PUT /api/core/settings/.

    Kept for backward compatibility with the pre-tenancy singleton endpoint;
    now reads/writes the active school (falls back to the default school)."""

    permission_classes = [RoleWritePermission]
    module = 'settings'

    def _school(self, request):
        return getattr(request, 'school', None) or School.get_default()

    def list(self, request):
        return Response(SchoolSettingsSerializer(self._school(request)).data)

    def create(self, request):
        instance = self._school(request)
        serializer = SchoolSettingsSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class DocumentSequenceViewSet(viewsets.ModelViewSet):
    queryset = DocumentSequence.objects.all()
    serializer_class = DocumentSequenceSerializer
    permission_classes = [RoleWritePermission]
    module = 'settings'


class AuditTrailViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditTrail.objects.select_related('user').all()
    serializer_class = AuditTrailSerializer
    filterset_class = AuditTrailFilter
    search_fields = ['model_name', 'record_id', 'user_email']
    ordering_fields = '__all__'
