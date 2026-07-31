"""FilterSet classes for the fees list endpoints (see convention in
apps.accounting.filters)."""
from django_filters import rest_framework as filters

from .models import (
    BillingRun,
    BursaryAward,
    CreditNote,
    FeeInvoice,
    FeeStructure,
    PaymentIntent,
    Receipt,
)


class NumberInFilter(filters.BaseInFilter, filters.NumberFilter):
    pass


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class FeeStructureFilter(filters.FilterSet):
    academic_year__in = NumberInFilter(field_name='academic_year', lookup_expr='in')
    term__in = NumberInFilter(field_name='term', lookup_expr='in')
    grade__in = NumberInFilter(field_name='grade', lookup_expr='in')
    fee_category__in = NumberInFilter(field_name='fee_category', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    applies_to__in = CharInFilter(field_name='applies_to', lookup_expr='in')
    amount__gte = filters.NumberFilter(field_name='amount', lookup_expr='gte')
    amount__lte = filters.NumberFilter(field_name='amount', lookup_expr='lte')

    class Meta:
        model = FeeStructure
        fields = ['academic_year', 'term', 'grade', 'fee_category', 'currency',
                  'applies_to', 'is_mandatory']


class BursaryAwardFilter(filters.FilterSet):
    student__in = NumberInFilter(field_name='student', lookup_expr='in')
    fee_category__in = NumberInFilter(field_name='fee_category', lookup_expr='in')
    academic_year__in = NumberInFilter(field_name='academic_year', lookup_expr='in')
    term__in = NumberInFilter(field_name='term', lookup_expr='in')
    award_type__in = CharInFilter(field_name='award_type', lookup_expr='in')
    value__gte = filters.NumberFilter(field_name='value', lookup_expr='gte')
    value__lte = filters.NumberFilter(field_name='value', lookup_expr='lte')

    class Meta:
        model = BursaryAward
        fields = ['student', 'fee_category', 'academic_year', 'term', 'award_type', 'is_active']


class BillingRunFilter(filters.FilterSet):
    term__in = NumberInFilter(field_name='term', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    due_date__gte = filters.DateFilter(field_name='due_date', lookup_expr='gte')
    due_date__lte = filters.DateFilter(field_name='due_date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    total_billed__gte = filters.NumberFilter(field_name='total_billed', lookup_expr='gte')
    total_billed__lte = filters.NumberFilter(field_name='total_billed', lookup_expr='lte')

    class Meta:
        model = BillingRun
        fields = ['term', 'currency', 'status']


class FeeInvoiceFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    term__in = NumberInFilter(field_name='term', lookup_expr='in')
    student__in = NumberInFilter(field_name='student', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    billing_run__in = NumberInFilter(field_name='billing_run', lookup_expr='in')
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
        model = FeeInvoice
        fields = ['status', 'term', 'student', 'currency', 'billing_run']


class CreditNoteFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    student__in = NumberInFilter(field_name='student', lookup_expr='in')
    invoice__in = NumberInFilter(field_name='invoice', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    total__gte = filters.NumberFilter(field_name='total', lookup_expr='gte')
    total__lte = filters.NumberFilter(field_name='total', lookup_expr='lte')

    class Meta:
        model = CreditNote
        fields = ['status', 'student', 'invoice', 'currency']


class ReceiptFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    student__in = NumberInFilter(field_name='student', lookup_expr='in')
    bank_account__in = NumberInFilter(field_name='bank_account', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    payment_method__in = CharInFilter(field_name='payment_method', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    amount__gte = filters.NumberFilter(field_name='amount', lookup_expr='gte')
    amount__lte = filters.NumberFilter(field_name='amount', lookup_expr='lte')

    class Meta:
        model = Receipt
        fields = ['student', 'bank_account', 'currency', 'status', 'payment_method', 'payer_guardian']


class PaymentIntentFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    student__in = NumberInFilter(field_name='student', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    payment_method__in = CharInFilter(field_name='payment_method', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')
    amount__gte = filters.NumberFilter(field_name='amount', lookup_expr='gte')
    amount__lte = filters.NumberFilter(field_name='amount', lookup_expr='lte')

    class Meta:
        model = PaymentIntent
        fields = ['student', 'guardian', 'currency', 'status', 'payment_method']
