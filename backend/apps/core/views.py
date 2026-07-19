from django.contrib.auth import authenticate, login, logout
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .models import AuditTrail, DocumentSequence, SchoolSettings, User
from .permissions import IsAdmin, RoleWritePermission
from .serializers import (
    AuditTrailSerializer,
    DocumentSequenceSerializer,
    LoginSerializer,
    SchoolSettingsSerializer,
    UserSerializer,
)


class LoginThrottle(ScopedRateThrottle):
    scope = 'login'


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
    AuditTrail.log('login', user, user=user)
    return Response(UserSerializer(user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    AuditTrail.log('logout', request.user, user=request.user)
    logout(request)
    return Response({'detail': 'Logged out.'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_view(request):
    return Response(UserSerializer(request.user).data)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    search_fields = ['email', 'first_name', 'last_name']
    filterset_fields = ['role', 'is_active']


class SchoolSettingsViewSet(viewsets.ViewSet):
    """Singleton settings: GET/PUT /api/core/settings/."""

    permission_classes = [RoleWritePermission]
    write_area = 'core'

    def list(self, request):
        return Response(SchoolSettingsSerializer(SchoolSettings.get()).data)

    def create(self, request):
        instance = SchoolSettings.get()
        serializer = SchoolSettingsSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class DocumentSequenceViewSet(viewsets.ModelViewSet):
    queryset = DocumentSequence.objects.all()
    serializer_class = DocumentSequenceSerializer
    permission_classes = [RoleWritePermission]
    write_area = 'core'
    pagination_class = None


class AuditTrailViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditTrail.objects.select_related('user').all()
    serializer_class = AuditTrailSerializer
    filterset_fields = ['action', 'model_name', 'record_id', 'user']
    search_fields = ['model_name', 'record_id', 'user_email']
