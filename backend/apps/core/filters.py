"""FilterSet classes for the core list endpoints (see convention in
apps.accounting.filters)."""
from django_filters import rest_framework as filters

from .models import AuditTrail, User


class NumberInFilter(filters.BaseInFilter, filters.NumberFilter):
    pass


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class UserFilter(filters.FilterSet):
    role__in = CharInFilter(field_name='role', lookup_expr='in')
    date_joined__gte = filters.DateFilter(field_name='date_joined', lookup_expr='gte')
    date_joined__lte = filters.DateFilter(field_name='date_joined', lookup_expr='lte')

    class Meta:
        model = User
        fields = ['role', 'is_active', 'is_staff', 'is_superuser', 'home_school', 'is_hq']


class AuditTrailFilter(filters.FilterSet):
    action__in = CharInFilter(field_name='action', lookup_expr='in')
    model_name__in = CharInFilter(field_name='model_name', lookup_expr='in')
    user__in = NumberInFilter(field_name='user', lookup_expr='in')
    timestamp__gte = filters.DateFilter(field_name='timestamp', lookup_expr='gte')
    timestamp__lte = filters.DateFilter(field_name='timestamp', lookup_expr='lte')

    class Meta:
        model = AuditTrail
        fields = ['action', 'model_name', 'record_id', 'user']
