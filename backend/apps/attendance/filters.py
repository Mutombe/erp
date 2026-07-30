from django_filters import rest_framework as filters

from .models import AttendanceRecord, AttendanceSession


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class NumberInFilter(filters.BaseInFilter, filters.NumberFilter):
    pass


class AttendanceSessionFilter(filters.FilterSet):
    class_room__in = NumberInFilter(field_name='class_room', lookup_expr='in')
    session__in = CharInFilter(field_name='session', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')

    class Meta:
        model = AttendanceSession
        fields = ['class_room', 'date', 'session']


class AttendanceRecordFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    session__in = NumberInFilter(field_name='session', lookup_expr='in')
    student__in = NumberInFilter(field_name='student', lookup_expr='in')

    class Meta:
        model = AttendanceRecord
        fields = ['session', 'student', 'status']
