"""FilterSet classes for the students list endpoints (see convention in
apps.accounting.filters)."""
from django_filters import rest_framework as filters

from .models import (
    AcademicYear,
    ClassRoom,
    Enrollment,
    Grade,
    Guardian,
    Student,
    Subject,
    Teacher,
    TeachingAssignment,
    Term,
)


class NumberInFilter(filters.BaseInFilter, filters.NumberFilter):
    pass


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class StudentFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    attendance_type__in = CharInFilter(field_name='attendance_type', lookup_expr='in')
    gender__in = CharInFilter(field_name='gender', lookup_expr='in')
    admission_date__gte = filters.DateFilter(field_name='admission_date', lookup_expr='gte')
    admission_date__lte = filters.DateFilter(field_name='admission_date', lookup_expr='lte')
    dob__gte = filters.DateFilter(field_name='dob', lookup_expr='gte')
    dob__lte = filters.DateFilter(field_name='dob', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = Student
        fields = ['status', 'attendance_type', 'gender']


class GuardianFilter(filters.FilterSet):
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = Guardian
        fields = ['employer']


class ClassRoomFilter(filters.FilterSet):
    grade__in = NumberInFilter(field_name='grade', lookup_expr='in')
    academic_year__in = NumberInFilter(field_name='academic_year', lookup_expr='in')
    capacity__gte = filters.NumberFilter(field_name='capacity', lookup_expr='gte')
    capacity__lte = filters.NumberFilter(field_name='capacity', lookup_expr='lte')

    class Meta:
        model = ClassRoom
        fields = ['grade', 'academic_year']


class EnrollmentFilter(filters.FilterSet):
    academic_year__in = NumberInFilter(field_name='academic_year', lookup_expr='in')
    class_room__in = NumberInFilter(field_name='class_room', lookup_expr='in')
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    student__in = NumberInFilter(field_name='student', lookup_expr='in')
    attendance_type__in = CharInFilter(field_name='attendance_type', lookup_expr='in')
    enrolled_date__gte = filters.DateFilter(field_name='enrolled_date', lookup_expr='gte')
    enrolled_date__lte = filters.DateFilter(field_name='enrolled_date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = Enrollment
        fields = ['academic_year', 'class_room', 'status', 'student', 'attendance_type']


class AcademicYearFilter(filters.FilterSet):
    start_date__gte = filters.DateFilter(field_name='start_date', lookup_expr='gte')
    start_date__lte = filters.DateFilter(field_name='start_date', lookup_expr='lte')
    end_date__gte = filters.DateFilter(field_name='end_date', lookup_expr='gte')
    end_date__lte = filters.DateFilter(field_name='end_date', lookup_expr='lte')

    class Meta:
        model = AcademicYear
        fields = ['is_current']


class TermFilter(filters.FilterSet):
    academic_year__in = NumberInFilter(field_name='academic_year', lookup_expr='in')
    number__in = NumberInFilter(field_name='number', lookup_expr='in')
    start_date__gte = filters.DateFilter(field_name='start_date', lookup_expr='gte')
    start_date__lte = filters.DateFilter(field_name='start_date', lookup_expr='lte')
    end_date__gte = filters.DateFilter(field_name='end_date', lookup_expr='gte')
    end_date__lte = filters.DateFilter(field_name='end_date', lookup_expr='lte')

    class Meta:
        model = Term
        fields = ['academic_year', 'is_current', 'number']


class GradeFilter(filters.FilterSet):
    section__in = CharInFilter(field_name='section', lookup_expr='in')
    level__gte = filters.NumberFilter(field_name='level', lookup_expr='gte')
    level__lte = filters.NumberFilter(field_name='level', lookup_expr='lte')

    class Meta:
        model = Grade
        fields = ['section', 'level']


class SubjectFilter(filters.FilterSet):
    class Meta:
        model = Subject
        fields = ['is_active']


class TeacherFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    gender__in = CharInFilter(field_name='gender', lookup_expr='in')
    # A teacher linked to a class either as its form teacher or via an assignment.
    class_room = filters.NumberFilter(method='filter_class_room')
    subject = NumberInFilter(field_name='teaching_assignments__subject', lookup_expr='in')

    class Meta:
        model = Teacher
        fields = ['status', 'gender']

    def filter_class_room(self, queryset, name, value):
        from django.db.models import Q

        return queryset.filter(
            Q(form_classes=value) | Q(teaching_assignments__class_room=value)
        ).distinct()


class TeachingAssignmentFilter(filters.FilterSet):
    teacher__in = NumberInFilter(field_name='teacher', lookup_expr='in')
    class_room__in = NumberInFilter(field_name='class_room', lookup_expr='in')
    subject__in = NumberInFilter(field_name='subject', lookup_expr='in')

    class Meta:
        model = TeachingAssignment
        fields = ['teacher', 'class_room', 'subject']
