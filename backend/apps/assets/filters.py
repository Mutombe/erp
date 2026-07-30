"""FilterSet classes for the assets list endpoints (see convention in
apps.accounting.filters)."""
from django_filters import rest_framework as filters

from .models import Asset, DepreciationRun


class NumberInFilter(filters.BaseInFilter, filters.NumberFilter):
    pass


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class AssetFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    category__in = NumberInFilter(field_name='category', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    acquisition_date__gte = filters.DateFilter(field_name='acquisition_date', lookup_expr='gte')
    acquisition_date__lte = filters.DateFilter(field_name='acquisition_date', lookup_expr='lte')
    in_service_date__gte = filters.DateFilter(field_name='in_service_date', lookup_expr='gte')
    in_service_date__lte = filters.DateFilter(field_name='in_service_date', lookup_expr='lte')
    disposal_date__gte = filters.DateFilter(field_name='disposal_date', lookup_expr='gte')
    disposal_date__lte = filters.DateFilter(field_name='disposal_date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    cost_base__gte = filters.NumberFilter(field_name='cost_base', lookup_expr='gte')
    cost_base__lte = filters.NumberFilter(field_name='cost_base', lookup_expr='lte')
    cost__gte = filters.NumberFilter(field_name='cost', lookup_expr='gte')
    cost__lte = filters.NumberFilter(field_name='cost', lookup_expr='lte')
    accumulated_depreciation__gte = filters.NumberFilter(
        field_name='accumulated_depreciation', lookup_expr='gte')
    accumulated_depreciation__lte = filters.NumberFilter(
        field_name='accumulated_depreciation', lookup_expr='lte')

    class Meta:
        model = Asset
        fields = ['status', 'category', 'currency', 'depreciation_method']


class DepreciationRunFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    period__in = NumberInFilter(field_name='period', lookup_expr='in')
    run_date__gte = filters.DateFilter(field_name='run_date', lookup_expr='gte')
    run_date__lte = filters.DateFilter(field_name='run_date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    total_amount__gte = filters.NumberFilter(field_name='total_amount', lookup_expr='gte')
    total_amount__lte = filters.NumberFilter(field_name='total_amount', lookup_expr='lte')

    class Meta:
        model = DepreciationRun
        fields = ['status', 'period']
