from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.core.models import DocumentSequence

from .models import (
    AccountMapping,
    BankAccount,
    ChartOfAccount,
    ExchangeRate,
    FiscalPeriod,
    FiscalYear,
    GeneralLedger,
    Journal,
    JournalLine,
    OpeningBalance,
    SubAccount,
    SubAccountTransaction,
)


class ChartOfAccountSerializer(serializers.ModelSerializer):
    normal_balance = serializers.ReadOnlyField()

    class Meta:
        model = ChartOfAccount
        fields = [
            'id', 'code', 'name', 'account_type', 'account_subtype', 'report_group',
            'parent', 'currency', 'description', 'is_system', 'is_active',
            'allow_manual_journal', 'current_balance', 'normal_balance',
        ]
        read_only_fields = ['account_type', 'account_subtype', 'is_system', 'current_balance']


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = '__all__'
        read_only_fields = ['is_locked', 'school']


class FiscalPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalPeriod
        fields = '__all__'
        read_only_fields = ['locked_by', 'locked_at', 'school']


class FiscalYearSerializer(serializers.ModelSerializer):
    periods = FiscalPeriodSerializer(many=True, read_only=True)

    class Meta:
        model = FiscalYear
        fields = '__all__'
        read_only_fields = ['school']


class JournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    sub_account_code = serializers.CharField(source='sub_account.code', read_only=True)

    class Meta:
        model = JournalLine
        fields = [
            'id', 'account', 'account_code', 'account_name', 'debit_amount', 'credit_amount',
            'debit_base', 'credit_base', 'sub_account', 'sub_account_code', 'bank_account',
            'description', 'source_type', 'source_id',
        ]
        read_only_fields = ['debit_base', 'credit_base']


class JournalSerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True, read_only=True)
    total_debit = serializers.SerializerMethodField()
    total_credit = serializers.SerializerMethodField()
    reversed_by_number = serializers.CharField(source='reversed_by.number', read_only=True)
    posted_by_email = serializers.CharField(source='posted_by.email', read_only=True)

    class Meta:
        model = Journal
        fields = [
            'id', 'number', 'journal_type', 'date', 'description', 'reference', 'status',
            'currency', 'exchange_rate', 'reversed_by', 'reversed_by_number', 'reversal_reason',
            'source_type', 'source_id', 'source_ref', 'posted_by_email', 'posted_at',
            'created_at', 'lines', 'total_debit', 'total_credit',
        ]
        read_only_fields = ['number', 'status', 'posted_at', 'reversed_by']

    def get_total_debit(self, obj):
        return sum((line.debit_amount for line in obj.lines.all()), Decimal('0'))

    def get_total_credit(self, obj):
        return sum((line.credit_amount for line in obj.lines.all()), Decimal('0'))


class ManualJournalLineInput(serializers.Serializer):
    account = serializers.PrimaryKeyRelatedField(queryset=ChartOfAccount.objects.filter(is_active=True))
    debit_amount = serializers.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0'))
    credit_amount = serializers.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0'))
    sub_account = serializers.PrimaryKeyRelatedField(
        queryset=SubAccount.objects.all(), required=False, allow_null=True
    )
    description = serializers.CharField(required=False, allow_blank=True, default='')

    def validate(self, attrs):
        account = attrs['account']
        if not account.allow_manual_journal and not attrs.get('sub_account'):
            raise serializers.ValidationError(
                f'Account {account.code} is a control account; manual lines must specify a sub-account.'
            )
        return attrs


class ManualJournalSerializer(serializers.Serializer):
    """Create a draft manual journal with lines."""

    date = serializers.DateField()
    description = serializers.CharField(max_length=500)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    currency = serializers.CharField(max_length=3)
    journal_type = serializers.ChoiceField(
        choices=['general', 'adjustment'], default='general'
    )
    lines = ManualJournalLineInput(many=True)

    def validate(self, attrs):
        if len(attrs['lines']) < 2:
            raise serializers.ValidationError('A journal needs at least two lines.')
        debit = sum(line['debit_amount'] for line in attrs['lines'])
        credit = sum(line['credit_amount'] for line in attrs['lines'])
        if debit != credit:
            raise serializers.ValidationError(f'Journal is out of balance: Dr {debit} vs Cr {credit}.')
        return attrs

    def create(self, validated_data):
        from apps.core.mixins import active_school

        from .models import ExchangeRate
        from .services import base_currency

        lines = validated_data.pop('lines')
        request = self.context['request']
        user = request.user
        school = active_school(request)
        rate = ExchangeRate.get_rate(
            validated_data['currency'], base_currency(), validated_data['date'], school=school
        )
        with transaction.atomic():
            journal = Journal.objects.create(
                school=school,
                number=DocumentSequence.next_for('JRN', school),
                exchange_rate=rate,
                created_by=user,
                **validated_data,
            )
            for line in lines:
                JournalLine.objects.create(
                    journal=journal,
                    account=line['account'],
                    debit_amount=line['debit_amount'],
                    credit_amount=line['credit_amount'],
                    sub_account=line.get('sub_account'),
                    description=line.get('description', ''),
                )
        return journal


class GeneralLedgerSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    journal_number = serializers.CharField(source='journal.number', read_only=True)
    journal_id = serializers.IntegerField(source='journal.id', read_only=True)
    source_type = serializers.CharField(source='journal.source_type', read_only=True)
    source_id = serializers.IntegerField(source='journal.source_id', read_only=True)
    source_ref = serializers.CharField(source='journal.source_ref', read_only=True)

    class Meta:
        model = GeneralLedger
        fields = [
            'id', 'journal_id', 'journal_number', 'account', 'account_code', 'account_name',
            'date', 'description', 'debit_amount', 'credit_amount', 'debit_base', 'credit_base',
            'balance', 'currency', 'exchange_rate', 'source_type', 'source_id', 'source_ref',
        ]


class SubAccountTransactionSerializer(serializers.ModelSerializer):
    journal_id = serializers.IntegerField(source='journal_line.journal_id', read_only=True)

    class Meta:
        model = SubAccountTransaction
        fields = [
            'id', 'date', 'contra_account', 'reference', 'description',
            'debit', 'credit', 'balance', 'journal_id',
        ]


class SubAccountSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)

    class Meta:
        model = SubAccount
        fields = [
            'id', 'code', 'name', 'party_type', 'student', 'student_name', 'supplier',
            'supplier_name', 'category', 'currency', 'current_balance', 'is_active',
        ]
        read_only_fields = ['current_balance']


class BankAccountSerializer(serializers.ModelSerializer):
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)

    class Meta:
        model = BankAccount
        fields = '__all__'
        read_only_fields = ['book_balance', 'bank_balance', 'last_reconciled_date',
                            'last_reconciled_balance', 'school']


class AccountMappingSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)

    class Meta:
        model = AccountMapping
        fields = ['id', 'purpose', 'currency', 'account', 'account_code', 'account_name']


class OpeningBalanceSerializer(serializers.ModelSerializer):
    target_account_code = serializers.CharField(source='target_account.code', read_only=True)

    class Meta:
        model = OpeningBalance
        fields = '__all__'
        read_only_fields = ['number', 'status', 'journal', 'school']

    def create(self, validated_data):
        from apps.core.mixins import active_school

        school = validated_data.get('school') or active_school(self.context['request'])
        validated_data['school'] = school
        validated_data['number'] = DocumentSequence.next_for('OPB', school)
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)
