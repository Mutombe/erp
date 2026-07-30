"""FilterSet classes for the accounting list endpoints.

Rich, uniform query convention shared across every app:
  * exact match      ?<field>=v
  * multi-select      ?<field>__in=a,b,c
  * date ranges       ?<field>__gte=YYYY-MM-DD & ?<field>__lte=YYYY-MM-DD
  * amount ranges     ?<field>__gte=n & ?<field>__lte=n
"""
from django_filters import rest_framework as filters

from .models import (
    BankAccount,
    ChartOfAccount,
    ExchangeRate,
    GeneralLedger,
    Journal,
    OpeningBalance,
    SubAccount,
)


class NumberInFilter(filters.BaseInFilter, filters.NumberFilter):
    pass


class CharInFilter(filters.BaseInFilter, filters.CharFilter):
    pass


class ChartOfAccountFilter(filters.FilterSet):
    account_type__in = CharInFilter(field_name='account_type', lookup_expr='in')
    account_subtype__in = CharInFilter(field_name='account_subtype', lookup_expr='in')
    report_group__in = CharInFilter(field_name='report_group', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    current_balance__gte = filters.NumberFilter(field_name='current_balance', lookup_expr='gte')
    current_balance__lte = filters.NumberFilter(field_name='current_balance', lookup_expr='lte')
    created_at__gte = filters.DateFilter(field_name='created_at', lookup_expr='gte')
    created_at__lte = filters.DateFilter(field_name='created_at', lookup_expr='lte')

    class Meta:
        model = ChartOfAccount
        fields = ['account_type', 'account_subtype', 'report_group', 'is_active',
                  'currency', 'parent', 'is_system', 'allow_manual_journal']


class JournalFilter(filters.FilterSet):
    journal_type__in = CharInFilter(field_name='journal_type', lookup_expr='in')
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')

    class Meta:
        model = Journal
        fields = ['journal_type', 'status', 'currency', 'source_type', 'source_id']


class GeneralLedgerFilter(filters.FilterSet):
    account__in = NumberInFilter(field_name='account', lookup_expr='in')
    journal__in = NumberInFilter(field_name='journal', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')

    class Meta:
        model = GeneralLedger
        fields = ['account', 'currency', 'journal']


class SubAccountFilter(filters.FilterSet):
    party_type__in = CharInFilter(field_name='party_type', lookup_expr='in')
    category__in = CharInFilter(field_name='category', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    student__in = NumberInFilter(field_name='student', lookup_expr='in')
    supplier__in = NumberInFilter(field_name='supplier', lookup_expr='in')
    current_balance__gte = filters.NumberFilter(field_name='current_balance', lookup_expr='gte')
    current_balance__lte = filters.NumberFilter(field_name='current_balance', lookup_expr='lte')

    class Meta:
        model = SubAccount
        fields = ['party_type', 'category', 'currency', 'student', 'supplier', 'is_active']


class BankAccountFilter(filters.FilterSet):
    account_type__in = CharInFilter(field_name='account_type', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    book_balance__gte = filters.NumberFilter(field_name='book_balance', lookup_expr='gte')
    book_balance__lte = filters.NumberFilter(field_name='book_balance', lookup_expr='lte')

    class Meta:
        model = BankAccount
        fields = ['currency', 'account_type', 'is_active', 'is_default']


class ExchangeRateFilter(filters.FilterSet):
    from_currency__in = CharInFilter(field_name='from_currency', lookup_expr='in')
    to_currency__in = CharInFilter(field_name='to_currency', lookup_expr='in')
    effective_date__gte = filters.DateFilter(field_name='effective_date', lookup_expr='gte')
    effective_date__lte = filters.DateFilter(field_name='effective_date', lookup_expr='lte')
    rate__gte = filters.NumberFilter(field_name='rate', lookup_expr='gte')
    rate__lte = filters.NumberFilter(field_name='rate', lookup_expr='lte')

    class Meta:
        model = ExchangeRate
        fields = ['from_currency', 'to_currency', 'is_locked']


class OpeningBalanceFilter(filters.FilterSet):
    status__in = CharInFilter(field_name='status', lookup_expr='in')
    currency__in = CharInFilter(field_name='currency', lookup_expr='in')
    direction__in = CharInFilter(field_name='direction', lookup_expr='in')
    student__in = NumberInFilter(field_name='student', lookup_expr='in')
    supplier__in = NumberInFilter(field_name='supplier', lookup_expr='in')
    date__gte = filters.DateFilter(field_name='date', lookup_expr='gte')
    date__lte = filters.DateFilter(field_name='date', lookup_expr='lte')
    amount__gte = filters.NumberFilter(field_name='amount', lookup_expr='gte')
    amount__lte = filters.NumberFilter(field_name='amount', lookup_expr='lte')

    class Meta:
        model = OpeningBalance
        fields = ['status', 'currency', 'student', 'supplier', 'direction', 'target_account']
