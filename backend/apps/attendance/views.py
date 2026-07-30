from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import TenantScopedViewSet
from apps.core.permissions import RoleWritePermission

from . import services
from .filters import AttendanceRecordFilter, AttendanceSessionFilter
from .models import AttendanceRecord, AttendanceSession
from .serializers import (
    AttendanceRecordSerializer,
    AttendanceSessionListSerializer,
    AttendanceSessionSerializer,
    MarkEntrySerializer,
)


class AttendanceViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'attendance'


class AttendanceSessionViewSet(AttendanceViewSet):
    queryset = AttendanceSession.objects.select_related('class_room__grade').prefetch_related(
        'records__student'
    ).all()
    serializer_class = AttendanceSessionSerializer
    filterset_class = AttendanceSessionFilter
    search_fields = ['class_room__name']
    ordering_fields = '__all__'

    def get_serializer_class(self):
        if self.action == 'list':
            return AttendanceSessionListSerializer
        return AttendanceSessionSerializer

    def create(self, request, *args, **kwargs):
        """Create (or fetch) the register and auto-seed a present record for
        every active student in the class."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        session = services.get_or_create_session(
            class_room=data['class_room'],
            date=data['date'],
            session=data.get('session', 'full_day'),
            marked_by=request.user if request.user.is_authenticated else None,
            notes=data.get('notes', ''),
        )
        out = AttendanceSessionSerializer(session)
        return Response(out.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def mark(self, request, pk=None):
        """Bulk-set records: body is a list of {student, status, note}."""
        session = self.get_object()
        entries = MarkEntrySerializer(data=request.data, many=True)
        entries.is_valid(raise_exception=True)
        services.mark_session(session, entries.validated_data)
        session.refresh_from_db()
        return Response(AttendanceSessionSerializer(session).data)


class AttendanceRecordViewSet(AttendanceViewSet):
    queryset = AttendanceRecord.objects.select_related('student', 'session').all()
    serializer_class = AttendanceRecordSerializer
    filterset_class = AttendanceRecordFilter
    search_fields = ['student__code', 'student__first_name', 'student__last_name']
    ordering_fields = '__all__'

    def get_queryset(self):
        # AttendanceRecord has no direct `school` FK; scope via its session.
        qs = viewsets.ModelViewSet.get_queryset(self)
        request = self.request
        active = getattr(request, 'school', None)
        if active is not None:
            return qs.filter(session__school=active)
        user = getattr(request, 'user', None)
        if user is None or not getattr(user, 'is_authenticated', False):
            return qs
        if getattr(user, 'is_hq', False) or getattr(user, 'is_superuser', False):
            return qs
        school_ids = set(user.accessible_schools.values_list('id', flat=True))
        if not school_ids:
            return qs
        return qs.filter(session__school_id__in=school_ids)
