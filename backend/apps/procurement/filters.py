"""FilterSet classes for the procurement list endpoints (see convention in
apps.accounting.filters)."""
from django_filters import rest_framework as filters

from .models import (
    GoodsReceivedNote,
    PurchaseOrder,
    Supplier,
    SupplierPayment,
    VendorBill,
)


class NumberInFilter(filters.BaseInFilter, filters.NumberFilter):
    pass


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class SupplierFilter(filters.FilterSet):
    default_currency__in = CharInFilter(field_name='default_currency', lookup_expr='in')
    payment_terms_days__gte = filters.NumberFilter(field_name='payment_terms_days', lookup_expr='gte')
    payment_terms_days__lte = filters.NumberFilter(field_name='payment_terms_days', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = Supplier
        fields = ['is_active', 'default_currency']


class PurchaseOrderFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    supplier__in = NumberInFilter(field_name='supplier', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    expected_date__gte = filters.DateFilter(field_name='expected_date', lookup_expr='gte')
    expected_date__lte = filters.DateFilter(field_name='expected_date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = PurchaseOrder
        fields = ['status', 'supplier', 'currency']


class GRNFilter(filters.FilterSet):
    po__in = NumberInFilter(field_name='po', lookup_expr='in')
    warehouse__in = NumberInFilter(field_name='warehouse', lookup_expr='in')
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = GoodsReceivedNote
        fields = ['po', 'warehouse', 'status']


class VendorBillFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    supplier__in = NumberInFilter(field_name='supplier', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    po__in = NumberInFilter(field_name='po', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    due_date__gte = filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_date__lte = filters.DateFilter(field_name='due_date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    total__gte = filters.NumberFilter(field_name='total', lookup_expr='gte')
    total__lte = filters.NumberFilter(field_name='total', lookup_expr='lte')
    amount_paid__gte = filters.NumberFilter(field_name='amount_paid', lookup_expr='gte')
    amount_paid__lte = filters.NumberFilter(field_name='amount_paid', lookup_expr='lte')

    class Meta:
        model = VendorBill
        fields = ['status', 'supplier', 'currency', 'po']


class SupplierPaymentFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    supplier__in = NumberInFilter(field_name='supplier', lookup_expr='in')
    bank_account__in = NumberInFilter(field_name='bank_account', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    amount__gte = filters.NumberFilter(field_name='amount', lookup_expr='gte')
    amount__lte = filters.NumberFilter(field_name='amount', lookup_expr='lte')

    class Meta:
        model = SupplierPayment
        fields = ['supplier', 'bank_account', 'currency', 'status']
