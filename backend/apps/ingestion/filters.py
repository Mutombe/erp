from django_filters import rest_framework as filters

from .models import IngestionItem


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class IngestionItemFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    doc_type__in = CharInFilter(field_name='doc_type', lookup_expr='in')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = IngestionItem
        fields = ['status', 'doc_type', 'source']
