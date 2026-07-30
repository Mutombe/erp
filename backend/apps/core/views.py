from django.contrib.auth import authenticate, login, logout
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .filters import AuditTrailFilter, UserFilter
from .models import AuditTrail, DocumentSequence, Organization, School, User
from .permissions import IsAdmin, RoleWritePermission
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
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    search_fields = ['email', 'first_name', 'last_name']
    filterset_class = UserFilter
    ordering_fields = '__all__'


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer
    permission_classes = [RoleWritePermission]
    write_area = 'core'
    pagination_class = None


class SchoolViewSet(viewsets.ModelViewSet):
    queryset = School.objects.select_related('organization').all()
    serializer_class = SchoolSerializer
    permission_classes = [RoleWritePermission]
    write_area = 'core'
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
    write_area = 'core'

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
    write_area = 'core'


class AuditTrailViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditTrail.objects.select_related('user').all()
    serializer_class = AuditTrailSerializer
    filterset_class = AuditTrailFilter
    search_fields = ['model_name', 'record_id', 'user_email']
    ordering_fields = '__all__'
