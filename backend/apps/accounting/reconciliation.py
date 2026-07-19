"""Bank statement import and Sage-style reconciliation API."""
import csv
import io
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.core.permissions import RoleWritePermission

from .models import (
    BankAccount,
    BankReconciliation,
    BankStatement,
    BankStatementLine,
    JournalLine,
    ReconciliationItem,
)

ZERO = Decimal('0')


class BankStatementLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankStatementLine
        fields = '__all__'


class BankStatementSerializer(serializers.ModelSerializer):
    lines = BankStatementLineSerializer(many=True, read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)

    class Meta:
        model = BankStatement
        fields = '__all__'


class ReconciliationItemSerializer(serializers.ModelSerializer):
    date = serializers.DateField(source='journal_line.journal.date', read_only=True)
    description = serializers.CharField(source='journal_line.description', read_only=True)
    journal_number = serializers.CharField(source='journal_line.journal.number', read_only=True)
    journal_id = serializers.IntegerField(source='journal_line.journal_id', read_only=True)
    debit = serializers.DecimalField(source='journal_line.debit_amount', max_digits=18, decimal_places=2, read_only=True)
    credit = serializers.DecimalField(source='journal_line.credit_amount', max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = ReconciliationItem
        fields = ['id', 'is_ticked', 'date', 'description', 'journal_number', 'journal_id', 'debit', 'credit']


class BankReconciliationSerializer(serializers.ModelSerializer):
    items = ReconciliationItemSerializer(many=True, read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)
    opening_balance = serializers.SerializerMethodField()
    ticked_total = serializers.SerializerMethodField()
    reconciled_balance = serializers.SerializerMethodField()
    difference = serializers.SerializerMethodField()

    class Meta:
        model = BankReconciliation
        fields = '__all__'
        read_only_fields = ['status', 'book_balance', 'completed_by', 'completed_at']

    def get_opening_balance(self, obj):
        return obj.bank_account.last_reconciled_balance or ZERO

    def get_ticked_total(self, obj):
        agg = obj.items.filter(is_ticked=True).aggregate(
            d=models.Sum('journal_line__debit_amount'), c=models.Sum('journal_line__credit_amount')
        )
        return (agg['d'] or ZERO) - (agg['c'] or ZERO)

    def get_reconciled_balance(self, obj):
        return self.get_opening_balance(obj) + self.get_ticked_total(obj)

    def get_difference(self, obj):
        return obj.statement_balance - self.get_reconciled_balance(obj)


class BankStatementViewSet(viewsets.ModelViewSet):
    queryset = BankStatement.objects.select_related('bank_account').prefetch_related('lines').all()
    serializer_class = BankStatementSerializer
    permission_classes = [RoleWritePermission]
    write_area = 'accounting'
    filterset_fields = ['bank_account']
    throttle_scope = 'uploads'

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        """Import a CSV statement: columns date,description,reference,debit,credit
        (header row required; date ISO or DD/MM/YYYY)."""
        bank_id = request.data.get('bank_account')
        file = request.FILES.get('file')
        if not bank_id or not file:
            raise ValidationError('bank_account and file are required.')
        bank = BankAccount.objects.get(pk=bank_id)

        text = file.read().decode('utf-8-sig', errors='replace')
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise ValidationError('Empty CSV.')
        normalized = {name.strip().lower(): name for name in reader.fieldnames}
        required = {'date', 'description'}
        if not required.issubset(normalized):
            raise ValidationError(f'CSV must have columns: date, description, debit, credit. Found {reader.fieldnames}')

        from datetime import datetime

        def parse_date(raw):
            raw = raw.strip()
            for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y'):
                try:
                    return datetime.strptime(raw, fmt).date()
                except ValueError:
                    continue
            raise ValidationError(f'Unparseable date: "{raw}"')

        def parse_amount(row, key):
            raw = (row.get(normalized.get(key, ''), '') or '').replace(',', '').strip()
            if not raw:
                return ZERO
            try:
                return Decimal(raw)
            except InvalidOperation:
                raise ValidationError(f'Unparseable amount "{raw}" in column {key}.')

        with transaction.atomic():
            statement = BankStatement.objects.create(
                bank_account=bank,
                statement_date=timezone.localdate(),
                opening_balance=Decimal(request.data.get('opening_balance') or 0),
                closing_balance=Decimal(request.data.get('closing_balance') or 0),
                file=file,
            )
            lines = []
            for row in reader:
                if not (row.get(normalized['date']) or '').strip():
                    continue
                lines.append(BankStatementLine(
                    statement=statement,
                    date=parse_date(row[normalized['date']]),
                    description=(row.get(normalized['description'], '') or '').strip()[:500],
                    reference=(row.get(normalized.get('reference', ''), '') or '').strip()[:100],
                    debit=parse_amount(row, 'debit'),
                    credit=parse_amount(row, 'credit'),
                ))
            if not lines:
                raise ValidationError('No data rows found in the CSV.')
            BankStatementLine.objects.bulk_create(lines)
        return Response(BankStatementSerializer(statement).data, status=201)


class BankReconciliationViewSet(viewsets.ModelViewSet):
    queryset = BankReconciliation.objects.select_related('bank_account').all()
    serializer_class = BankReconciliationSerializer
    permission_classes = [RoleWritePermission]
    write_area = 'accounting'
    filterset_fields = ['bank_account', 'status']

    def perform_create(self, serializer):
        """Snapshot the book balance and populate items from all not-yet-reconciled
        posted bank journal lines up to the end date."""
        with transaction.atomic():
            recon = serializer.save(book_balance=serializer.validated_data['bank_account'].book_balance)
            already_reconciled = ReconciliationItem.objects.filter(
                reconciliation__bank_account=recon.bank_account,
                reconciliation__status='completed',
                is_ticked=True,
            ).values_list('journal_line_id', flat=True)
            candidates = (
                JournalLine.objects.filter(
                    bank_account=recon.bank_account,
                    journal__status__in=['posted', 'reversed'],
                    journal__date__lte=recon.end_date,
                )
                .exclude(id__in=list(already_reconciled))
                .order_by('journal__date', 'id')
            )
            ReconciliationItem.objects.bulk_create(
                ReconciliationItem(reconciliation=recon, journal_line=line) for line in candidates
            )

    @action(detail=True, methods=['post'])
    def toggle_item(self, request, pk=None):
        recon = self.get_object()
        if recon.status != 'in_progress':
            raise ValidationError('This reconciliation is already completed.')
        item = recon.items.get(pk=request.data.get('item'))
        item.is_ticked = not item.is_ticked
        item.save(update_fields=['is_ticked'])
        return Response(BankReconciliationSerializer(recon).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        recon = self.get_object()
        if recon.status != 'in_progress':
            raise ValidationError('Already completed.')
        serializer = BankReconciliationSerializer(recon)
        difference = serializer.get_difference(recon)
        if difference != 0 and not request.data.get('force'):
            raise ValidationError(
                f'Reconciliation is out by {difference}. Tick the outstanding items or pass force=true.'
            )
        with transaction.atomic():
            recon.status = 'completed'
            recon.completed_by = request.user
            recon.completed_at = timezone.now()
            recon.save(update_fields=['status', 'completed_by', 'completed_at'])
            bank = recon.bank_account
            bank.last_reconciled_date = recon.end_date
            bank.last_reconciled_balance = recon.statement_balance
            bank.bank_balance = recon.statement_balance
            bank.save(update_fields=['last_reconciled_date', 'last_reconciled_balance', 'bank_balance'])
        return Response(BankReconciliationSerializer(recon).data)
