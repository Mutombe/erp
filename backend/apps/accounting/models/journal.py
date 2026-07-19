from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.core.models import AuditTrail, DocumentSequence

from .coa import ChartOfAccount, FiscalPeriod

TWO_PLACES = Decimal('0.01')

JOURNAL_TYPES = [
    ('general', 'General'),
    ('sales', 'Sales'),
    ('receipts', 'Receipts'),
    ('payments', 'Payments'),
    ('purchases', 'Purchases'),
    ('inventory', 'Inventory'),
    ('depreciation', 'Depreciation'),
    ('adjustment', 'Adjustment'),
    ('reversal', 'Reversal'),
    ('opening', 'Opening'),
]

JOURNAL_STATUS = [('draft', 'Draft'), ('posted', 'Posted'), ('reversed', 'Reversed')]


class Journal(models.Model):
    number = models.CharField(max_length=20, unique=True)
    journal_type = models.CharField(max_length=15, choices=JOURNAL_TYPES, default='general')
    date = models.DateField(db_index=True)
    description = models.CharField(max_length=500, blank=True)
    reference = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=10, choices=JOURNAL_STATUS, default='draft')
    currency = models.CharField(max_length=3)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal('1'))
    # Reversal linkage: the original points at its reversal.
    reversed_by = models.OneToOneField(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='reversal_of'
    )
    reversal_reason = models.CharField(max_length=500, blank=True)
    # Source-document backlink for drill-down (e.g. 'fees.FeeInvoice', 42).
    source_type = models.CharField(max_length=50, blank=True)
    source_id = models.PositiveBigIntegerField(null=True, blank=True)
    source_ref = models.CharField(max_length=50, blank=True)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    posted_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    posted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['status', 'date']),
            models.Index(fields=['source_type', 'source_id']),
        ]

    def __str__(self):
        return f'{self.number} ({self.get_status_display()})'

    # ---------- validation ----------

    def totals(self):
        agg = self.lines.aggregate(
            debit=models.Sum('debit_amount'), credit=models.Sum('credit_amount'),
            debit_base=models.Sum('debit_base'), credit_base=models.Sum('credit_base'),
        )
        return {k: v or Decimal('0') for k, v in agg.items()}

    def validate_balance(self):
        t = self.totals()
        if t['debit'] == 0 and t['credit'] == 0:
            raise ValidationError(f'Journal {self.number} has no lines.')
        if t['debit'] != t['credit']:
            raise ValidationError(
                f'Journal {self.number} is out of balance: Dr {t["debit"]} vs Cr {t["credit"]}.'
            )
        if t['debit_base'] != t['credit_base']:
            raise ValidationError(
                f'Journal {self.number} base-currency amounts are out of balance: '
                f'Dr {t["debit_base"]} vs Cr {t["credit_base"]}.'
            )

    # ---------- posting engine ----------

    def post(self, user=None):
        """Atomically post this journal: write immutable GL rows with running
        balances, update account/bank/sub-ledger balances, lock the rows involved."""
        from .subledger import SubAccountTransaction

        with transaction.atomic():
            journal = Journal.objects.select_for_update().get(pk=self.pk)
            if journal.status != 'draft':
                raise ValidationError(f'Journal {journal.number} is {journal.status}; only drafts can be posted.')
            FiscalPeriod.assert_open(journal.date)
            journal.validate_balance()

            lines = list(
                journal.lines.select_related('account', 'sub_account', 'bank_account').order_by('id')
            )

            account_ids = sorted({line.account_id for line in lines})
            locked_accounts = {
                acc.id: acc
                for acc in ChartOfAccount.objects.select_for_update().filter(id__in=account_ids).order_by('id')
            }

            bank_ids = sorted({line.bank_account_id for line in lines if line.bank_account_id})
            locked_banks = {}
            if bank_ids:
                from .banking import BankAccount

                locked_banks = {
                    bank.id: bank
                    for bank in BankAccount.objects.select_for_update().filter(id__in=bank_ids).order_by('id')
                }

            gl_rows = []
            for line in lines:
                account = locked_accounts[line.account_id]
                signed = Decimal('0')
                if line.debit_base:
                    signed = line.debit_base if account.normal_balance == 'debit' else -line.debit_base
                if line.credit_base:
                    signed = line.credit_base if account.normal_balance == 'credit' else -line.credit_base
                account.current_balance += signed

                gl_rows.append(
                    GeneralLedger(
                        journal_line=line,
                        journal=journal,
                        account=account,
                        date=journal.date,
                        description=line.description or journal.description,
                        debit_amount=line.debit_amount,
                        credit_amount=line.credit_amount,
                        debit_base=line.debit_base,
                        credit_base=line.credit_base,
                        balance=account.current_balance,
                        currency=journal.currency,
                        exchange_rate=journal.exchange_rate,
                    )
                )

                if line.bank_account_id:
                    bank = locked_banks[line.bank_account_id]
                    bank.book_balance += (line.debit_amount or 0) - (line.credit_amount or 0)

                if line.sub_account_id:
                    SubAccountTransaction.create_entry(
                        sub_account_id=line.sub_account_id,
                        date=journal.date,
                        contra_account=account.code,
                        reference=journal.number,
                        description=line.description or journal.description,
                        debit=line.debit_amount or Decimal('0'),
                        credit=line.credit_amount or Decimal('0'),
                        journal_line=line,
                    )

            for account in locked_accounts.values():
                account.save(update_fields=['current_balance', 'updated_at'])
            for bank in locked_banks.values():
                bank.save(update_fields=['book_balance', 'updated_at'])
            GeneralLedger.objects.bulk_create(gl_rows)

            journal.status = 'posted'
            journal.posted_by = user
            journal.posted_at = timezone.now()
            journal.save(update_fields=['status', 'posted_by', 'posted_at'])

            AuditTrail.log('post', journal, user=user, changes={'number': journal.number})

            # Refresh self if called on an unsaved-state instance
            self.status, self.posted_by, self.posted_at = journal.status, journal.posted_by, journal.posted_at
            return journal

    def reverse(self, reason='', user=None, date=None):
        """Create and post a mirror-image journal; mark this one reversed. GL rows
        are only ever added — nothing is deleted or mutated."""
        with transaction.atomic():
            original = Journal.objects.select_for_update().get(pk=self.pk)
            if original.status != 'posted':
                raise ValidationError(f'Only posted journals can be reversed (status={original.status}).')

            reversal = Journal.objects.create(
                number=DocumentSequence.next_for('JRN'),
                journal_type='reversal',
                date=date or original.date,
                description=f'Reversal of {original.number}' + (f': {reason}' if reason else ''),
                reference=original.number,
                currency=original.currency,
                exchange_rate=original.exchange_rate,
                reversal_reason=reason,
                source_type=original.source_type,
                source_id=original.source_id,
                source_ref=original.source_ref,
                created_by=user,
            )
            for line in original.lines.all().order_by('id'):
                JournalLine.objects.create(
                    journal=reversal,
                    account_id=line.account_id,
                    debit_amount=line.credit_amount,
                    credit_amount=line.debit_amount,
                    debit_base=line.credit_base,
                    credit_base=line.debit_base,
                    sub_account_id=line.sub_account_id,
                    bank_account_id=line.bank_account_id,
                    description=f'Reversal: {line.description}' if line.description else 'Reversal',
                )
            reversal.post(user=user)

            original.status = 'reversed'
            original.reversed_by = reversal
            original.reversal_reason = reason
            original.save(update_fields=['status', 'reversed_by', 'reversal_reason'])
            AuditTrail.log('reverse', original, user=user, changes={'reversal': reversal.number, 'reason': reason})
            self.status, self.reversed_by = original.status, original.reversed_by
            return reversal


class JournalLine(models.Model):
    """A double-entry line. Always hits a GL account; sub-ledger pocket and bank
    account are dimensions, so control accounts stay in sync by construction."""

    journal = models.ForeignKey(Journal, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.PROTECT, related_name='journal_lines')
    debit_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    debit_base = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit_base = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    sub_account = models.ForeignKey(
        'accounting.SubAccount', null=True, blank=True, on_delete=models.PROTECT, related_name='journal_lines'
    )
    bank_account = models.ForeignKey(
        'accounting.BankAccount', null=True, blank=True, on_delete=models.PROTECT, related_name='journal_lines'
    )
    description = models.CharField(max_length=500, blank=True)
    source_type = models.CharField(max_length=50, blank=True)
    source_id = models.PositiveBigIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        side = f'Dr {self.debit_amount}' if self.debit_amount else f'Cr {self.credit_amount}'
        return f'{self.account.code} {side}'

    def clean(self):
        # A line is debit-side or credit-side. FX-adjustment lines may carry only
        # base-currency amounts (zero transaction amount), so both columns count.
        has_debit = bool(self.debit_amount or self.debit_base)
        has_credit = bool(self.credit_amount or self.credit_base)
        if has_debit == has_credit:  # both or neither
            raise ValidationError('A journal line must have either a debit or a credit amount, not both.')
        if (self.debit_amount or 0) < 0 or (self.credit_amount or 0) < 0:
            raise ValidationError('Debit/credit amounts must be positive.')
        if (self.debit_base or 0) < 0 or (self.credit_base or 0) < 0:
            raise ValidationError('Base debit/credit amounts must be positive.')
        if self.bank_account_id and self.bank_account.gl_account_id != self.account_id:
            raise ValidationError('Bank-dimension lines must post to that bank account\'s GL account.')

    def save(self, *args, **kwargs):
        if self.journal.status != 'draft':
            raise ValidationError('Lines cannot be added to a posted journal.')
        # Default base amounts from the journal's rate when not supplied.
        rate = self.journal.exchange_rate or Decimal('1')
        if self.debit_amount and not self.debit_base:
            self.debit_base = (self.debit_amount * rate).quantize(TWO_PLACES)
        if self.credit_amount and not self.credit_base:
            self.credit_base = (self.credit_amount * rate).quantize(TWO_PLACES)
        self.clean()
        super().save(*args, **kwargs)


class GeneralLedger(models.Model):
    """Immutable posted ledger rows — the book of record."""

    journal_line = models.OneToOneField(JournalLine, on_delete=models.PROTECT, related_name='gl_entry')
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT, related_name='gl_entries')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.PROTECT, related_name='gl_entries')
    date = models.DateField(db_index=True)
    description = models.CharField(max_length=500, blank=True)
    debit_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit_amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    debit_base = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit_base = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    # Running base-currency balance of the account at time of posting.
    balance = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal('1'))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'id']
        indexes = [
            models.Index(fields=['account', 'date']),
            models.Index(fields=['currency', 'date']),
        ]

    def __str__(self):
        return f'GL {self.account.code} @ {self.date}'

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError('General ledger entries are immutable.')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('General ledger entries cannot be deleted; reverse the journal instead.')
