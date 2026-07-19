from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.accounting.models import ExchangeRate, SubAccount
from apps.accounting.services import LineSpec, base_currency, build_and_post_journal
from apps.core.models import DocumentSequence

TWO = Decimal('0.01')
ZERO = Decimal('0')


class FeeCategory(models.Model):
    """A fee stream (Tuition, Boarding, Levy...) mapped to its income account.
    Also drives the student's sub-ledger pocket for that stream."""

    code = models.CharField(max_length=10, unique=True)  # TUI, BRD, LVY...
    name = models.CharField(max_length=100)
    income_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+')
    deferred_account = models.ForeignKey(
        'accounting.ChartOfAccount', null=True, blank=True, on_delete=models.PROTECT, related_name='+'
    )
    pocket_order = models.PositiveIntegerField(default=0)  # allocation priority (lowest first)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['pocket_order', 'code']
        verbose_name_plural = 'Fee categories'

    def __str__(self):
        return f'{self.code} · {self.name}'


class FeeStructure(models.Model):
    APPLIES_TO = [('all', 'All students'), ('day', 'Day scholars'), ('boarder', 'Boarders')]

    academic_year = models.ForeignKey('students.AcademicYear', on_delete=models.CASCADE, related_name='fee_structures')
    term = models.ForeignKey('students.Term', on_delete=models.CASCADE, related_name='fee_structures')
    grade = models.ForeignKey('students.Grade', on_delete=models.CASCADE, related_name='fee_structures')
    fee_category = models.ForeignKey(FeeCategory, on_delete=models.PROTECT, related_name='structures')
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3)
    applies_to = models.CharField(max_length=10, choices=APPLIES_TO, default='all')
    is_mandatory = models.BooleanField(default=True)

    class Meta:
        unique_together = [('term', 'grade', 'fee_category', 'currency', 'applies_to')]
        ordering = ['term__start_date', 'grade__level']

    def __str__(self):
        return f'{self.grade} {self.term} {self.fee_category.code} {self.currency} {self.amount}'


class BursaryAward(models.Model):
    TYPES = [('percent', 'Percentage'), ('fixed', 'Fixed amount')]

    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='bursaries')
    fee_category = models.ForeignKey(
        FeeCategory, null=True, blank=True, on_delete=models.CASCADE, related_name='+'
    )  # null = all categories
    academic_year = models.ForeignKey('students.AcademicYear', on_delete=models.CASCADE, related_name='+')
    term = models.ForeignKey('students.Term', null=True, blank=True, on_delete=models.CASCADE, related_name='+')  # null = all terms
    award_type = models.CharField(max_length=10, choices=TYPES)
    value = models.DecimalField(max_digits=18, decimal_places=2)
    funder = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['-id']

    def __str__(self):
        return f'{self.student.code} {self.award_type} {self.value}'

    def discount_for(self, fee_category, amount):
        if self.fee_category_id and self.fee_category_id != fee_category.id:
            return ZERO
        if self.award_type == 'percent':
            return (amount * self.value / Decimal('100')).quantize(TWO)
        return min(self.value, amount)


class BillingRun(models.Model):
    STATUS = [
        ('draft', 'Draft'), ('previewed', 'Previewed'), ('running', 'Running'),
        ('completed', 'Completed'), ('failed', 'Failed'),
    ]

    number = models.CharField(max_length=20, unique=True)
    term = models.ForeignKey('students.Term', on_delete=models.PROTECT, related_name='billing_runs')
    currency = models.CharField(max_length=3)
    date = models.DateField()
    due_date = models.DateField(null=True, blank=True)
    grades = models.ManyToManyField('students.Grade', blank=True)  # empty = all grades
    status = models.CharField(max_length=10, choices=STATUS, default='draft')
    invoices_created = models.PositiveIntegerField(default=0)
    total_billed = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    error_message = models.TextField(blank=True)
    task_id = models.CharField(max_length=100, blank=True)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.number} ({self.term})'


class FeeInvoice(models.Model):
    STATUS = [
        ('draft', 'Draft'), ('posted', 'Posted'), ('partial', 'Partially paid'),
        ('paid', 'Paid'), ('cancelled', 'Cancelled'),
    ]

    number = models.CharField(max_length=20, unique=True)
    student = models.ForeignKey('students.Student', on_delete=models.PROTECT, related_name='fee_invoices')
    enrollment = models.ForeignKey(
        'students.Enrollment', null=True, blank=True, on_delete=models.PROTECT, related_name='fee_invoices'
    )
    term = models.ForeignKey('students.Term', null=True, blank=True, on_delete=models.PROTECT, related_name='fee_invoices')
    billing_run = models.ForeignKey(BillingRun, null=True, blank=True, on_delete=models.SET_NULL, related_name='invoices')
    date = models.DateField()
    due_date = models.DateField()
    currency = models.CharField(max_length=3)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal('1'))
    subtotal = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    discount_total = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    total = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    status = models.CharField(max_length=10, choices=STATUS, default='draft', db_index=True)
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    notes = models.TextField(blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [
            models.Index(fields=['status', 'due_date']),
            models.Index(fields=['student', 'date']),
            models.Index(fields=['currency', 'status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['billing_run', 'student'],
                name='unique_invoice_per_run_per_student',
                condition=models.Q(billing_run__isnull=False),
            )
        ]

    def __str__(self):
        return f'{self.number} · {self.student.code}'

    @property
    def balance(self):
        return self.total - self.amount_paid

    def compute_totals(self):
        agg = self.lines.aggregate(sub=models.Sum('amount'), disc=models.Sum('discount_amount'))
        self.subtotal = agg['sub'] or ZERO
        self.discount_total = agg['disc'] or ZERO
        self.total = self.subtotal - self.discount_total

    def post(self, user=None):
        """Dr AR control (per category, on the student's pocket) / Cr fee income
        (or deferred income). Bursary discounts post gross income with a contra
        debit so I&E shows gross fees less bursaries."""
        from apps.core.models import SchoolSettings

        if self.journal_id:
            return self.journal
        if self.status != 'draft':
            raise ValidationError(f'Invoice {self.number} is {self.status}; only drafts can be posted.')

        self.compute_totals()
        if self.total <= 0:
            raise ValidationError('Invoice total must be positive.')

        deferred_mode = SchoolSettings.get().revenue_recognition == 'deferred'
        specs = []
        for line in self.lines.select_related('fee_category').order_by('id'):
            category = line.fee_category
            net = line.amount - line.discount_amount
            pocket = SubAccount.for_student(self.student, category.code, self.currency)
            specs.append(LineSpec(
                mapping_purpose='ar_control',
                debit=net,
                sub_account=pocket,
                description=f'{self.number} {category.name}',
                source=('fees.FeeInvoice', self.pk),
            ))
            income_account = category.deferred_account if (deferred_mode and category.deferred_account_id) \
                else category.income_account
            specs.append(LineSpec(
                account=income_account,
                credit=line.amount,
                description=f'{self.number} {category.name}',
                source=('fees.FeeInvoice', self.pk),
            ))
            if line.discount_amount:
                specs.append(LineSpec(
                    mapping_purpose='bursary_contra',
                    debit=line.discount_amount,
                    description=f'{self.number} bursary on {category.name}',
                    source=('fees.FeeInvoice', self.pk),
                ))

        with transaction.atomic():
            journal = build_and_post_journal(
                journal_type='sales',
                date=self.date,
                currency=self.currency,
                description=f'Fee invoice {self.number} — {self.student.full_name}',
                lines=specs,
                reference=self.number,
                user=user,
                source=('fees.FeeInvoice', self.pk, self.number),
            )
            self.journal = journal
            self.exchange_rate = journal.exchange_rate
            self.status = 'posted'
            self.save(update_fields=['journal', 'exchange_rate', 'status', 'subtotal', 'discount_total', 'total'])
        return journal

    def cancel(self, reason='', user=None):
        if self.status == 'draft':
            self.status = 'cancelled'
            self.save(update_fields=['status'])
            return None
        if self.amount_paid:
            raise ValidationError('Cannot cancel an invoice with payments; issue a credit note instead.')
        if self.status not in ('posted',):
            raise ValidationError(f'Cannot cancel a {self.status} invoice.')
        reversal = self.journal.reverse(reason=reason or f'Cancel {self.number}', user=user)
        self.status = 'cancelled'
        self.save(update_fields=['status'])
        return reversal


class FeeInvoiceLine(models.Model):
    invoice = models.ForeignKey(FeeInvoice, on_delete=models.CASCADE, related_name='lines')
    fee_category = models.ForeignKey(FeeCategory, on_delete=models.PROTECT, related_name='+')
    description = models.CharField(max_length=300, blank=True)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    bursary_award = models.ForeignKey(BursaryAward, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    discount_amount = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    # Paid-so-far against this line; drives per-category pocket credits on receipt.
    allocated_amount = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)

    @property
    def net_amount(self):
        return self.amount - self.discount_amount

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.invoice.number} {self.fee_category.code} {self.amount}'


class CreditNote(models.Model):
    STATUS = [('draft', 'Draft'), ('posted', 'Posted')]

    number = models.CharField(max_length=20, unique=True)
    student = models.ForeignKey('students.Student', on_delete=models.PROTECT, related_name='credit_notes')
    invoice = models.ForeignKey(FeeInvoice, null=True, blank=True, on_delete=models.PROTECT, related_name='credit_notes')
    date = models.DateField()
    currency = models.CharField(max_length=3)
    reason = models.CharField(max_length=500)
    total = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    status = models.CharField(max_length=10, choices=STATUS, default='draft')
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.number} · {self.student.code}'

    def post(self, user=None):
        from apps.core.models import SchoolSettings

        if self.journal_id:
            return self.journal
        if self.status != 'draft':
            raise ValidationError(f'Credit note {self.number} is already {self.status}.')
        agg = self.lines.aggregate(total=models.Sum('amount'))
        self.total = agg['total'] or ZERO
        if self.total <= 0:
            raise ValidationError('Credit note total must be positive.')
        if self.invoice_id and self.total > self.invoice.balance:
            raise ValidationError('Credit note exceeds the invoice balance.')

        deferred_mode = SchoolSettings.get().revenue_recognition == 'deferred'
        specs = []
        for line in self.lines.select_related('fee_category').order_by('id'):
            category = line.fee_category
            income_account = category.deferred_account if (deferred_mode and category.deferred_account_id) \
                else category.income_account
            pocket = SubAccount.for_student(self.student, category.code, self.currency)
            specs.append(LineSpec(
                account=income_account, debit=line.amount,
                description=f'{self.number} {category.name}',
            ))
            specs.append(LineSpec(
                mapping_purpose='ar_control', credit=line.amount, sub_account=pocket,
                description=f'{self.number} {category.name}',
            ))

        with transaction.atomic():
            journal = build_and_post_journal(
                journal_type='sales',
                date=self.date,
                currency=self.currency,
                description=f'Credit note {self.number} — {self.student.full_name}',
                lines=specs,
                reference=self.number,
                user=user,
                source=('fees.CreditNote', self.pk, self.number),
            )
            self.journal = journal
            self.status = 'posted'
            self.save(update_fields=['journal', 'status', 'total'])
            if self.invoice_id:
                invoice = FeeInvoice.objects.select_for_update().get(pk=self.invoice_id)
                invoice.amount_paid += self.total  # settled by credit, not cash
                invoice.status = 'paid' if invoice.amount_paid >= invoice.total else 'partial'
                invoice.save(update_fields=['amount_paid', 'status'])
        return journal


class CreditNoteLine(models.Model):
    credit_note = models.ForeignKey(CreditNote, on_delete=models.CASCADE, related_name='lines')
    fee_category = models.ForeignKey(FeeCategory, on_delete=models.PROTECT, related_name='+')
    amount = models.DecimalField(max_digits=18, decimal_places=2)

    class Meta:
        ordering = ['id']


class Receipt(models.Model):
    STATUS = [('posted', 'Posted'), ('reversed', 'Reversed')]
    METHODS = [
        ('cash', 'Cash'), ('bank_transfer', 'Bank transfer'), ('ecocash', 'EcoCash'),
        ('card', 'Card'), ('cheque', 'Cheque'),
    ]

    number = models.CharField(max_length=20, unique=True)
    student = models.ForeignKey('students.Student', on_delete=models.PROTECT, related_name='receipts')
    payer_guardian = models.ForeignKey(
        'students.Guardian', null=True, blank=True, on_delete=models.SET_NULL, related_name='receipts'
    )
    date = models.DateField()
    bank_account = models.ForeignKey('accounting.BankAccount', on_delete=models.PROTECT, related_name='receipts')
    currency = models.CharField(max_length=3)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal('1'))
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    payment_method = models.CharField(max_length=15, choices=METHODS, default='cash')
    reference = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=10, choices=STATUS, default='posted')
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    unallocated_amount = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [models.Index(fields=['student', 'date'])]

    def __str__(self):
        return f'{self.number} · {self.student.code} {self.currency} {self.amount}'


class ReceiptAllocation(models.Model):
    receipt = models.ForeignKey(Receipt, on_delete=models.CASCADE, related_name='allocations')
    invoice = models.ForeignKey(FeeInvoice, on_delete=models.PROTECT, related_name='allocations')
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    fx_difference_base = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.receipt.number} → {self.invoice.number}: {self.amount}'


def next_number(doc_type):
    return DocumentSequence.next_for(doc_type)
