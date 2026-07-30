from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import TenantScopedViewSet
from apps.core.permissions import RoleWritePermission

from .filters import (
    BankAccountFilter,
    ChartOfAccountFilter,
    ExchangeRateFilter,
    GeneralLedgerFilter,
    JournalFilter,
    OpeningBalanceFilter,
    SubAccountFilter,
)
from .models import (
    AccountMapping,
    BankAccount,
    ChartOfAccount,
    ExchangeRate,
    FiscalPeriod,
    FiscalYear,
    GeneralLedger,
    Journal,
    OpeningBalance,
    SubAccount,
)
from .serializers import (
    AccountMappingSerializer,
    BankAccountSerializer,
    ChartOfAccountSerializer,
    ExchangeRateSerializer,
    FiscalPeriodSerializer,
    FiscalYearSerializer,
    GeneralLedgerSerializer,
    JournalSerializer,
    ManualJournalSerializer,
    OpeningBalanceSerializer,
    SubAccountSerializer,
    SubAccountTransactionSerializer,
)


class AccountingViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'accounting'


class ChartOfAccountViewSet(AccountingViewSet):
    queryset = ChartOfAccount.objects.all()
    serializer_class = ChartOfAccountSerializer
    filterset_class = ChartOfAccountFilter
    search_fields = ['code', 'name', 'description']
    ordering_fields = '__all__'


class JournalViewSet(AccountingViewSet):
    queryset = Journal.objects.prefetch_related('lines__account', 'lines__sub_account').all()
    serializer_class = JournalSerializer
    filterset_class = JournalFilter
    search_fields = ['number', 'description', 'reference', 'source_ref']
    ordering_fields = '__all__'

    def create(self, request, *args, **kwargs):
        serializer = ManualJournalSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        journal = serializer.save()
        return Response(JournalSerializer(journal).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='post')
    def post_journal(self, request, pk=None):
        journal = self.get_object()
        journal.post(user=request.user)
        return Response(JournalSerializer(journal).data)

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        journal = self.get_object()
        reversal = journal.reverse(reason=request.data.get('reason', ''), user=request.user)
        return Response(JournalSerializer(reversal).data)


class GeneralLedgerViewSet(TenantScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = GeneralLedger.objects.select_related('account', 'journal').all()
    serializer_class = GeneralLedgerSerializer
    filterset_class = GeneralLedgerFilter
    search_fields = ['description', 'journal__number']
    ordering_fields = '__all__'

    def get_queryset(self):
        qs = super().get_queryset()
        start = self.request.query_params.get('from')
        end = self.request.query_params.get('to')
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return qs


class SubAccountViewSet(TenantScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = SubAccount.objects.select_related('student', 'supplier').all()
    serializer_class = SubAccountSerializer
    filterset_class = SubAccountFilter
    search_fields = ['code', 'name']
    ordering_fields = '__all__'

    @action(detail=True, methods=['get'])
    def transactions(self, request, pk=None):
        sub_account = self.get_object()
        qs = sub_account.transactions.all()
        start, end = request.query_params.get('from'), request.query_params.get('to')
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return Response(SubAccountTransactionSerializer(qs, many=True).data)


class BankAccountViewSet(AccountingViewSet):
    queryset = BankAccount.objects.select_related('gl_account').all()
    serializer_class = BankAccountSerializer
    filterset_class = BankAccountFilter
    search_fields = ['code', 'name', 'bank_name', 'account_number']
    ordering_fields = '__all__'


class ExchangeRateViewSet(AccountingViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    filterset_class = ExchangeRateFilter
    search_fields = ['from_currency', 'to_currency', 'source']
    ordering_fields = '__all__'


class FiscalYearViewSet(AccountingViewSet):
    queryset = FiscalYear.objects.prefetch_related('periods').all()
    serializer_class = FiscalYearSerializer


class FiscalPeriodViewSet(AccountingViewSet):
    queryset = FiscalPeriod.objects.select_related('fiscal_year').all()
    serializer_class = FiscalPeriodSerializer
    filterset_fields = ['fiscal_year', 'is_locked']

    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        period = self.get_object()
        period.is_locked = True
        period.locked_by = request.user
        period.locked_at = timezone.now()
        period.save(update_fields=['is_locked', 'locked_by', 'locked_at'])
        return Response(FiscalPeriodSerializer(period).data)

    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        period = self.get_object()
        period.is_locked = False
        period.save(update_fields=['is_locked'])
        return Response(FiscalPeriodSerializer(period).data)


class OpeningBalanceViewSet(AccountingViewSet):
    queryset = OpeningBalance.objects.select_related('target_account', 'student', 'supplier').all()
    serializer_class = OpeningBalanceSerializer
    filterset_class = OpeningBalanceFilter
    search_fields = ['number', 'description', 'category']
    ordering_fields = '__all__'

    @action(detail=True, methods=['post'], url_path='post')
    def post_entry(self, request, pk=None):
        entry = self.get_object()
        entry.post(user=request.user)
        return Response(OpeningBalanceSerializer(entry).data)


class AccountMappingViewSet(AccountingViewSet):
    queryset = AccountMapping.objects.select_related('account').all()
    serializer_class = AccountMappingSerializer
    filterset_fields = ['purpose', 'currency']
