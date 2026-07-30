from django.db.models import Count, Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import TenantScopedViewSet
from apps.core.permissions import RoleWritePermission

from .filters import (
    AcademicYearFilter,
    ClassRoomFilter,
    EnrollmentFilter,
    GradeFilter,
    GuardianFilter,
    StudentFilter,
    TermFilter,
)
from .models import (
    AcademicYear,
    ClassRoom,
    Enrollment,
    Grade,
    Guardian,
    Student,
    StudentGuardian,
    Term,
)
from .serializers import (
    AcademicYearSerializer,
    ClassRoomSerializer,
    EnrollmentSerializer,
    GradeSerializer,
    GuardianSerializer,
    StudentGuardianSerializer,
    StudentSerializer,
    TermSerializer,
)


class StudentsViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'students'


class AcademicYearViewSet(StudentsViewSet):
    queryset = AcademicYear.objects.prefetch_related('terms').all()
    serializer_class = AcademicYearSerializer
    filterset_class = AcademicYearFilter
    search_fields = ['name']
    ordering_fields = '__all__'
    pagination_class = None


class TermViewSet(StudentsViewSet):
    queryset = Term.objects.select_related('academic_year').all()
    serializer_class = TermSerializer
    filterset_class = TermFilter
    search_fields = ['name']
    ordering_fields = '__all__'
    pagination_class = None


class GradeViewSet(StudentsViewSet):
    queryset = Grade.objects.all()
    serializer_class = GradeSerializer
    filterset_class = GradeFilter
    search_fields = ['name']
    ordering_fields = '__all__'


class ClassRoomViewSet(StudentsViewSet):
    queryset = ClassRoom.objects.select_related('grade', 'academic_year').annotate(
        student_count=Count('enrollments', filter=Q(enrollments__status='active'))
    )
    serializer_class = ClassRoomSerializer
    filterset_class = ClassRoomFilter
    search_fields = ['name', 'teacher_name']
    ordering_fields = '__all__'


class StudentViewSet(StudentsViewSet):
    queryset = Student.objects.all()
    serializer_class = StudentSerializer
    filterset_class = StudentFilter
    search_fields = ['code', 'first_name', 'last_name']
    ordering_fields = '__all__'

    @action(detail=True, methods=['get'])
    def sub_accounts(self, request, pk=None):
        from apps.accounting.models import SubAccount
        from apps.accounting.serializers import SubAccountSerializer

        student = self.get_object()
        qs = SubAccount.objects.filter(student=student).select_related('student', 'supplier').order_by('code')
        return Response(SubAccountSerializer(qs, many=True).data)


class GuardianViewSet(StudentsViewSet):
    queryset = Guardian.objects.prefetch_related('students').all()
    serializer_class = GuardianSerializer
    filterset_class = GuardianFilter
    search_fields = ['code', 'first_name', 'last_name', 'phone']
    ordering_fields = '__all__'


class StudentGuardianViewSet(StudentsViewSet):
    queryset = StudentGuardian.objects.select_related('student', 'guardian').all()
    serializer_class = StudentGuardianSerializer
    filterset_fields = ['student', 'guardian', 'relationship', 'is_primary_contact', 'is_billing_contact']


class EnrollmentViewSet(StudentsViewSet):
    queryset = Enrollment.objects.select_related('student', 'academic_year', 'class_room__grade').all()
    serializer_class = EnrollmentSerializer
    filterset_class = EnrollmentFilter
    search_fields = ['student__code', 'student__first_name', 'student__last_name']
    ordering_fields = '__all__'
