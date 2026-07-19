from decimal import Decimal

from django.conf import settings
from rest_framework import serializers

from apps.accounting.models import BankAccount, ExchangeRate, FiscalPeriod
from apps.core.models import DocumentSequence

from .models import Asset, AssetCategory, DepreciationEntry, DepreciationRun


class AssetCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetCategory
        fields = [
            'id', 'code', 'name', 'depreciation_method', 'useful_life_months',
            'residual_rate', 'annual_rate', 'asset_account', 'accum_depr_account',
            'depr_expense_account',
        ]


class AssetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    net_book_value = serializers.ReadOnlyField()
    disposal_journal_number = serializers.CharField(source='disposal_journal.number', read_only=True)

    class Meta:
        model = Asset
        fields = [
            'id', 'code', 'name', 'category', 'category_name', 'description',
            'serial_number', 'location', 'custodian', 'acquisition_date',
            'in_service_date', 'cost', 'currency', 'cost_base', 'residual_value',
            'depreciation_method', 'useful_life_months', 'annual_rate',
            'accumulated_depreciation', 'net_book_value', 'status',
            'capitalization_journal', 'disposal_date', 'disposal_proceeds',
            'disposal_journal', 'disposal_journal_number', 'custom_fields', 'created_at',
        ]
        read_only_fields = [
            'accumulated_depreciation', 'status', 'capitalization_journal',
            'disposal_date', 'disposal_proceeds', 'disposal_journal', 'created_at',
        ]
        extra_kwargs = {
            'code': {'required': False},
            'cost_base': {'required': False},
        }

    def create(self, validated_data):
        if not validated_data.get('code'):
            validated_data['code'] = DocumentSequence.next_for('AST')
        if validated_data.get('cost_base') is None:
            currency = validated_data.get('currency') or 'USD'
            rate = ExchangeRate.get_rate(currency, settings.BASE_CURRENCY, validated_data['acquisition_date'])
            validated_data['cost_base'] = (validated_data['cost'] * rate).quantize(Decimal('0.01'))
        return super().create(validated_data)


class AssetDisposeSerializer(serializers.Serializer):
    date = serializers.DateField()
    proceeds = serializers.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0'))
    bank_account = serializers.PrimaryKeyRelatedField(
        queryset=BankAccount.objects.filter(is_active=True), required=False, allow_null=True
    )


class DepreciationEntrySerializer(serializers.ModelSerializer):
    asset_code = serializers.CharField(source='asset.code', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)

    class Meta:
        model = DepreciationEntry
        fields = ['id', 'asset', 'asset_code', 'asset_name', 'amount', 'accumulated_after', 'nbv_after']


class DepreciationRunSerializer(serializers.ModelSerializer):
    entries = DepreciationEntrySerializer(many=True, read_only=True)
    period_label = serializers.SerializerMethodField()
    journal_number = serializers.CharField(source='journal.number', read_only=True)

    class Meta:
        model = DepreciationRun
        fields = [
            'id', 'period', 'period_label', 'run_date', 'status', 'journal',
            'journal_number', 'total_amount', 'entries', 'created_by', 'created_at',
        ]

    def get_period_label(self, obj):
        return str(obj.period)


class DepreciationRunInputSerializer(serializers.Serializer):
    period = serializers.PrimaryKeyRelatedField(queryset=FiscalPeriod.objects.all())
