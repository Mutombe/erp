from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

# Range-locked chart of accounts. An account's numeric code determines (and is
# validated against) its type and subtype — the mechanism proven in the
# reference system, with conventional ranges.
#   (start, end, account_type, subtype)
CODE_RANGES = [
    (1000, 1099, 'asset', 'cash'),
    (1100, 1199, 'asset', 'accounts_receivable'),
    (1200, 1299, 'asset', 'inventory'),
    (1300, 1399, 'asset', 'prepayment'),
    (1500, 1599, 'asset', 'fixed_asset'),
    (1600, 1699, 'asset', 'accumulated_depreciation'),
    (2000, 2099, 'liability', 'accounts_payable'),
    (2100, 2199, 'liability', 'accrual'),
    (2200, 2299, 'liability', 'deferred_income'),
    (2300, 2399, 'liability', 'statutory'),
    (2500, 2599, 'liability', 'loan'),
    (3000, 3899, 'equity', 'fund'),
    (3900, 3999, 'equity', 'opening_contra'),
    (4000, 4499, 'revenue', 'fee_income'),
    (4500, 4899, 'revenue', 'other_income'),
    (4900, 4949, 'revenue', 'fx_gain'),
    (4950, 4999, 'revenue', 'contra_income'),
    (5000, 5799, 'expense', 'operating_expense'),
    (5800, 5899, 'expense', 'depreciation'),
    (5900, 5999, 'expense', 'fx_loss'),
]

ACCOUNT_TYPES = [
    ('asset', 'Asset'),
    ('liability', 'Liability'),
    ('equity', 'Equity'),
    ('revenue', 'Revenue'),
    ('expense', 'Expense'),
]

REPORT_GROUPS = [
    # Balance sheet
    ('current_assets', 'Current Assets'),
    ('non_current_assets', 'Non-current Assets'),
    ('current_liabilities', 'Current Liabilities'),
    ('non_current_liabilities', 'Non-current Liabilities'),
    ('equity', 'Accumulated Fund / Equity'),
    # Income statement
    ('fee_income', 'Fee Income'),
    ('other_income', 'Other Income'),
    ('operating_expenses', 'Operating Expenses'),
    ('administrative_expenses', 'Administrative Expenses'),
    ('finance_costs', 'Finance Costs'),
]


def classify_code(code):
    """Return (account_type, subtype) for a numeric account code, or raise."""
    try:
        numeric = int(str(code).strip()[:4])
    except (ValueError, TypeError):
        raise ValidationError({'code': f'Account code "{code}" must start with 4 digits.'})
    for start, end, acc_type, subtype in CODE_RANGES:
        if start <= numeric <= end:
            return acc_type, subtype
    raise ValidationError({'code': f'Code {numeric} is outside every reserved range.'})


class ChartOfAccount(models.Model):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=10, choices=ACCOUNT_TYPES)
    account_subtype = models.CharField(max_length=30)
    report_group = models.CharField(max_length=30, choices=REPORT_GROUPS)
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.PROTECT, related_name='children')
    # Set only on monetary per-currency accounts (banks, AR, AP, deferred income).
    currency = models.CharField(max_length=3, blank=True)
    description = models.TextField(blank=True)
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    allow_manual_journal = models.BooleanField(default=True)
    # Lifetime running balance in base currency; dated reports aggregate from GL instead.
    current_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'

    @property
    def normal_balance(self):
        return 'debit' if self.account_type in ('asset', 'expense') else 'credit'

    def clean(self):
        acc_type, subtype = classify_code(self.code)
        if self.account_type and self.account_type != acc_type:
            raise ValidationError({
                'account_type': f'Code {self.code} is reserved for {acc_type} accounts.'
            })
        self.account_type = acc_type
        if not self.account_subtype:
            self.account_subtype = subtype

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self.is_system:
            raise ValidationError('System accounts cannot be deleted.')
        if self.journal_lines.exists():
            raise ValidationError('Accounts with journal activity cannot be deleted; deactivate instead.')
        super().delete(*args, **kwargs)


class ExchangeRate(models.Model):
    from_currency = models.CharField(max_length=3)
    to_currency = models.CharField(max_length=3)
    rate = models.DecimalField(max_digits=18, decimal_places=6)
    effective_date = models.DateField(db_index=True)
    source = models.CharField(max_length=100, blank=True)
    is_locked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('from_currency', 'to_currency', 'effective_date')]
        ordering = ['-effective_date']

    def __str__(self):
        return f'{self.from_currency}/{self.to_currency} {self.rate} @ {self.effective_date}'

    @classmethod
    def get_rate(cls, from_currency, to_currency, date):
        if from_currency == to_currency:
            return Decimal('1')
        row = (
            cls.objects.filter(
                from_currency=from_currency, to_currency=to_currency, effective_date__lte=date
            )
            .order_by('-effective_date')
            .first()
        )
        if row:
            return row.rate
        inverse = (
            cls.objects.filter(
                from_currency=to_currency, to_currency=from_currency, effective_date__lte=date
            )
            .order_by('-effective_date')
            .first()
        )
        if inverse and inverse.rate:
            return Decimal('1') / inverse.rate
        raise ValidationError(
            f'No exchange rate found for {from_currency}->{to_currency} on or before {date}.'
        )


class FiscalYear(models.Model):
    name = models.CharField(max_length=20, unique=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=[('open', 'Open'), ('closed', 'Closed')], default='open')

    class Meta:
        ordering = ['start_date']

    def __str__(self):
        return self.name


class FiscalPeriod(models.Model):
    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.CASCADE, related_name='periods')
    period_no = models.PositiveIntegerField()
    start_date = models.DateField()
    end_date = models.DateField()
    is_locked = models.BooleanField(default=False)
    locked_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    locked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('fiscal_year', 'period_no')]
        ordering = ['start_date']

    def __str__(self):
        return f'{self.fiscal_year.name} P{self.period_no}'

    @classmethod
    def for_date(cls, date):
        return cls.objects.filter(start_date__lte=date, end_date__gte=date).first()

    @classmethod
    def assert_open(cls, date):
        from django.core.exceptions import ValidationError

        period = cls.for_date(date)
        if period is None:
            raise ValidationError(f'No fiscal period covers {date}. Create the fiscal year first.')
        if period.is_locked or period.fiscal_year.status == 'closed':
            raise ValidationError(f'Fiscal period {period} is locked; cannot post on {date}.')
        return period
