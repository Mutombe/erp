from django.core.exceptions import ValidationError
from django.db import models

# Engine-level account mappings. Posting code never contains an account code
# literal — it resolves a purpose through this table.
MAPPING_PURPOSES = [
    ('ar_control', 'Accounts receivable control'),
    ('ap_control', 'Accounts payable control'),
    ('deferred_fee_income', 'Deferred fee income'),
    ('grni', 'Goods received not invoiced'),
    ('inventory_adjustment', 'Inventory adjustment'),
    ('bursary_contra', 'Bursaries / scholarships contra'),
    ('fx_gain_realized', 'Realized FX gain'),
    ('fx_loss_realized', 'Realized FX loss'),
    ('fx_gain_unrealized', 'Unrealized FX gain'),
    ('fx_loss_unrealized', 'Unrealized FX loss'),
    ('gain_on_disposal', 'Gain on asset disposal'),
    ('loss_on_disposal', 'Loss on asset disposal'),
    ('opening_balances', 'Opening balances contra'),
    ('accumulated_fund', 'Accumulated fund'),
    ('vat_payable', 'VAT payable'),
    ('rounding', 'Rounding differences'),
]


class AccountMapping(models.Model):
    purpose = models.CharField(max_length=30, choices=MAPPING_PURPOSES)
    currency = models.CharField(max_length=3, blank=True, default='')  # '' = any currency
    account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='mappings')

    class Meta:
        unique_together = [('purpose', 'currency')]
        ordering = ['purpose', 'currency']

    def __str__(self):
        ccy = self.currency or 'any'
        return f'{self.purpose} [{ccy}] → {self.account.code}'

    @classmethod
    def resolve(cls, purpose, currency=None):
        """Exact-currency match, then currency-agnostic fallback, then hard error."""
        row = None
        if currency:
            row = cls.objects.select_related('account').filter(purpose=purpose, currency=currency).first()
        if row is None:
            row = cls.objects.select_related('account').filter(purpose=purpose, currency='').first()
        if row is None:
            raise ValidationError(
                f'No account mapping configured for "{purpose}"'
                + (f' in {currency}' if currency else '')
                + '. Configure it under Settings → Account mappings.'
            )
        return row.account
