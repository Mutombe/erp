from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models


class BankAccount(models.Model):
    ACCOUNT_TYPES = [('bank', 'Bank'), ('mobile_money', 'Mobile Money'), ('cash', 'Cash')]

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=15, choices=ACCOUNT_TYPES, default='bank')
    bank_name = models.CharField(max_length=100, blank=True)
    branch = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    currency = models.CharField(max_length=3)
    gl_account = models.ForeignKey(
        'accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='bank_accounts'
    )
    book_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    bank_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    last_reconciled_date = models.DateField(null=True, blank=True)
    last_reconciled_balance = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.name} ({self.currency})'

    def clean(self):
        if self.gl_account_id and self.gl_account.account_subtype != 'cash':
            raise ValidationError({'gl_account': 'Bank accounts must map to a cash/bank GL account (1000s).'})
        if self.gl_account_id and self.gl_account.currency and self.gl_account.currency != self.currency:
            raise ValidationError({'gl_account': 'GL account currency must match the bank account currency.'})

    def save(self, *args, **kwargs):
        self.clean()
        if self.is_default:
            BankAccount.objects.filter(currency=self.currency, is_default=True).exclude(pk=self.pk).update(
                is_default=False
            )
        super().save(*args, **kwargs)


class BankStatement(models.Model):
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='statements')
    statement_date = models.DateField()
    opening_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    closing_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    file = models.FileField(upload_to='bank_statements/', null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-statement_date']

    def __str__(self):
        return f'{self.bank_account.name} statement {self.statement_date}'


class BankStatementLine(models.Model):
    STATUS = [('unmatched', 'Unmatched'), ('matched', 'Matched'), ('disputed', 'Disputed')]

    statement = models.ForeignKey(BankStatement, on_delete=models.CASCADE, related_name='lines')
    date = models.DateField()
    description = models.CharField(max_length=500, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    debit = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=10, choices=STATUS, default='unmatched')
    matched_journal_line = models.ForeignKey(
        'accounting.JournalLine', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    # Schema-ready for AI-assisted matching (later phase).
    ai_match_confidence = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    ai_match_suggestion = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['date', 'id']

    def __str__(self):
        return f'{self.date} {self.description[:40]}'


class BankReconciliation(models.Model):
    STATUS = [('in_progress', 'In progress'), ('completed', 'Completed')]

    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='reconciliations')
    start_date = models.DateField()
    end_date = models.DateField()
    statement_balance = models.DecimalField(max_digits=18, decimal_places=2)
    book_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    status = models.CharField(max_length=15, choices=STATUS, default='in_progress')
    completed_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-end_date']

    def __str__(self):
        return f'{self.bank_account.name} reconciliation to {self.end_date}'


class ReconciliationItem(models.Model):
    reconciliation = models.ForeignKey(BankReconciliation, on_delete=models.CASCADE, related_name='items')
    journal_line = models.ForeignKey('accounting.JournalLine', on_delete=models.PROTECT, related_name='+')
    is_ticked = models.BooleanField(default=False)

    class Meta:
        unique_together = [('reconciliation', 'journal_line')]
