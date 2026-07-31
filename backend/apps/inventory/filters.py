"""FilterSet classes for the inventory list endpoints (see convention in
apps.accounting.filters)."""
from django_filters import rest_framework as filters

from .models import Department, Item, StockLevel, StockMove, Warehouse


class NumberInFilter(filters.BaseInFilter, filters.NumberFilter):
    pass


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class ItemFilter(filters.FilterSet):
    category__in = NumberInFilter(field_name='category', lookup_expr='in')
    item_type__in = CharInFilter(field_name='item_type', lookup_expr='in')
    avg_cost__gte = filters.NumberFilter(field_name='avg_cost', lookup_expr='gte')
    avg_cost__lte = filters.NumberFilter(field_name='avg_cost', lookup_expr='lte')
    qty_on_hand__gte = filters.NumberFilter(field_name='qty_on_hand', lookup_expr='gte')
    qty_on_hand__lte = filters.NumberFilter(field_name='qty_on_hand', lookup_expr='lte')
    reorder_level__gte = filters.NumberFilter(field_name='reorder_level', lookup_expr='gte')
    reorder_level__lte = filters.NumberFilter(field_name='reorder_level', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = Item
        # `school` lets HQ (all-schools view) scope pickers to one school; scoped
        # users are already limited by the tenant middleware.
        fields = ['category', 'item_type', 'is_active', 'school']


class WarehouseFilter(filters.FilterSet):
    class Meta:
        model = Warehouse
        fields = ['is_active', 'storekeeper', 'school']


class DepartmentFilter(filters.FilterSet):
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = Department
        fields = ['is_active', 'expense_account']


class StockLevelFilter(filters.FilterSet):
    item__in = NumberInFilter(field_name='item', lookup_expr='in')
    warehouse__in = NumberInFilter(field_name='warehouse', lookup_expr='in')
    quantity__gte = filters.NumberFilter(field_name='quantity', lookup_expr='gte')
    quantity__lte = filters.NumberFilter(field_name='quantity', lookup_expr='lte')

    class Meta:
        model = StockLevel
        fields = ['item', 'warehouse']


class StockMoveFilter(filters.FilterSet):
    item__in = NumberInFilter(field_name='item', lookup_expr='in')
    move_type__in = CharInFilter(field_name='move_type', lookup_expr='in')
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    warehouse_from__in = NumberInFilter(field_name='warehouse_from', lookup_expr='in')
    warehouse_to__in = NumberInFilter(field_name='warehouse_to', lookup_expr='in')
    department__in = NumberInFilter(field_name='department', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    quantity__gte = filters.NumberFilter(field_name='quantity', lookup_expr='gte')
    quantity__lte = filters.NumberFilter(field_name='quantity', lookup_expr='lte')
    unit_cost__gte = filters.NumberFilter(field_name='unit_cost', lookup_expr='gte')
    unit_cost__lte = filters.NumberFilter(field_name='unit_cost', lookup_expr='lte')
    total_cost_base__gte = filters.NumberFilter(field_name='total_cost_base', lookup_expr='gte')
    total_cost_base__lte = filters.NumberFilter(field_name='total_cost_base', lookup_expr='lte')

    class Meta:
        model = StockMove
        fields = ['item', 'move_type', 'warehouse_from', 'warehouse_to', 'department', 'status']
