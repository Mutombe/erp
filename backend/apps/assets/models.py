from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction

from apps.accounting.services import LineSpec, base_currency, build_and_post_journal
from apps.core.models import DocumentSequence

TWO = Decimal('0.01')
ZERO = Decimal('0')


class AssetCategory(models.Model):
    METHODS = [('straight_line', 'Straight line'), ('reducing_balance', 'Reducing balance')]

    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    depreciation_method = models.CharField(max_length=20, choices=METHODS, default='straight_line')
    useful_life_months = models.PositiveIntegerField(default=60)
    residual_rate = models.DecimalField(max_digits=5, decimal_places=2, default=ZERO)  # % of cost
    annual_rate = models.DecimalField(max_digits=5, decimal_places=2, default=ZERO)  # % for reducing balance
    asset_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+')
    accum_depr_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+')
    depr_expense_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+')

    class Meta:
        ordering = ['code']
        verbose_name_plural = 'Asset categories'

    def __str__(self):
        return f'{self.code} · {self.name}'


class Asset(models.Model):
    STATUS = [
        ('draft', 'Draft'), ('active', 'Active'), ('fully_depreciated', 'Fully depreciated'),
        ('disposed', 'Disposed'), ('written_off', 'Written off'),
    ]

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=200)
    category = models.ForeignKey(AssetCategory, on_delete=models.PROTECT, related_name='assets')
    description = models.TextField(blank=True)
    serial_number = models.CharField(max_length=100, blank=True)
    location = models.CharField(max_length=200, blank=True)
    custodian = models.CharField(max_length=100, blank=True)
    acquisition_date = models.DateField()
    in_service_date = models.DateField()
    cost = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')
    cost_base = models.DecimalField(max_digits=18, decimal_places=2)  # base currency at acquisition rate
    residual_value = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)  # base currency
    # Overrides; defaults come from the category.
    depreciation_method = models.CharField(max_length=20, choices=AssetCategory.METHODS, blank=True)
    useful_life_months = models.PositiveIntegerField(null=True, blank=True)
    annual_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    accumulated_depreciation = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    status = models.CharField(max_length=20, choices=STATUS, default='active', db_index=True)
    capitalization_journal = models.ForeignKey(
        'accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+'
    )
    disposal_date = models.DateField(null=True, blank=True)
    disposal_proceeds = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    disposal_journal = models.ForeignKey(
        'accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+'
    )
    custom_fields = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'

    @property
    def net_book_value(self):
        return self.cost_base - self.accumulated_depreciation

    @property
    def method(self):
        return self.depreciation_method or self.category.depreciation_method

    @property
    def life_months(self):
        return self.useful_life_months or self.category.useful_life_months

    @property
    def rb_annual_rate(self):
        rate = self.annual_rate if self.annual_rate is not None else self.category.annual_rate
        return rate or ZERO

    def dispose(self, *, date, proceeds, bank_account=None, user=None):
        """Dr accumulated depreciation (full) + Dr bank (proceeds) / Cr asset cost,
        balancing to gain/loss on disposal."""
        if self.status in ('disposed', 'written_off'):
            raise ValidationError(f'Asset {self.code} is already {self.status}.')
        proceeds = Decimal(proceeds or 0).quantize(TWO)
        if proceeds > 0 and bank_account is None:
            raise ValidationError('Disposal with proceeds needs a bank account.')

        specs = [
            LineSpec(account=self.category.accum_depr_account, debit=self.accumulated_depreciation,
                     description=f'Disposal {self.code}: clear accumulated depreciation'),
            LineSpec(account=self.category.asset_account, credit=self.cost_base,
                     description=f'Disposal {self.code}: derecognize cost'),
        ]
        if proceeds > 0:
            specs.append(LineSpec(account=bank_account.gl_account, debit=proceeds, bank_account=bank_account,
                                  description=f'Disposal {self.code}: proceeds'))
        result = proceeds - self.net_book_value
        if result > 0:
            specs.append(LineSpec(mapping_purpose='gain_on_disposal', credit=result,
                                  description=f'Gain on disposal of {self.code}'))
        elif result < 0:
            specs.append(LineSpec(mapping_purpose='loss_on_disposal', debit=-result,
                                  description=f'Loss on disposal of {self.code}'))

        with transaction.atomic():
            journal = build_and_post_journal(
                journal_type='general',
                date=date,
                currency=base_currency(),
                description=f'Disposal of asset {self.code} — {self.name}',
                lines=specs,
                reference=self.code,
                exchange_rate=Decimal('1'),
                user=user,
                source=('assets.Asset', self.pk, self.code),
            )
            self.disposal_date = date
            self.disposal_proceeds = proceeds
            self.disposal_journal = journal
            self.status = 'disposed'
            self.save(update_fields=['disposal_date', 'disposal_proceeds', 'disposal_journal', 'status'])
        return journal


class DepreciationRun(models.Model):
    STATUS = [('draft', 'Draft'), ('posted', 'Posted'), ('reversed', 'Reversed')]

    period = models.OneToOneField('accounting.FiscalPeriod', on_delete=models.PROTECT, related_name='depreciation_run')
    run_date = models.DateField()
    status = models.CharField(max_length=10, choices=STATUS, default='draft')
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-run_date']

    def __str__(self):
        return f'Depreciation {self.period} ({self.status})'


class DepreciationEntry(models.Model):
    run = models.ForeignKey(DepreciationRun, on_delete=models.CASCADE, related_name='entries')
    asset = models.ForeignKey(Asset, on_delete=models.PROTECT, related_name='depreciation_entries')
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    accumulated_after = models.DecimalField(max_digits=18, decimal_places=2)
    nbv_after = models.DecimalField(max_digits=18, decimal_places=2)

    class Meta:
        ordering = ['asset__code']
        verbose_name_plural = 'Depreciation entries'
