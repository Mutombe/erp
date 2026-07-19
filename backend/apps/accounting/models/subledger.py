from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction


class SubAccount(models.Model):
    """A party sub-ledger 'pocket': per student × fee-category × currency, or
    per supplier × currency. Student pockets are debit-normal (they owe the
    school); supplier pockets are credit-normal (the school owes them)."""

    PARTY_TYPES = [('student', 'Student'), ('supplier', 'Supplier')]

    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=200)
    party_type = models.CharField(max_length=10, choices=PARTY_TYPES)
    student = models.ForeignKey(
        'students.Student', null=True, blank=True, on_delete=models.CASCADE, related_name='sub_accounts'
    )
    supplier = models.ForeignKey(
        'procurement.Supplier', null=True, blank=True, on_delete=models.CASCADE, related_name='sub_accounts'
    )
    category = models.CharField(max_length=20)  # fee-category code, or 'PAYABLE' for suppliers
    currency = models.CharField(max_length=3)
    current_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']
        unique_together = [
            ('student', 'category', 'currency'),
            ('supplier', 'category', 'currency'),
        ]
        indexes = [models.Index(fields=['party_type', 'category', 'currency'])]

    def __str__(self):
        return f'{self.code} · {self.name}'

    @property
    def normal_balance(self):
        return 'debit' if self.party_type == 'student' else 'credit'

    def clean(self):
        if self.party_type == 'student' and not self.student_id:
            raise ValidationError('Student sub-accounts must reference a student.')
        if self.party_type == 'supplier' and not self.supplier_id:
            raise ValidationError('Supplier sub-accounts must reference a supplier.')

    @classmethod
    def for_student(cls, student, category_code, currency):
        obj, _ = cls.objects.get_or_create(
            student=student,
            category=category_code,
            currency=currency,
            defaults={
                'party_type': 'student',
                'code': f'STU/{student.code}/{category_code}/{currency}',
                'name': f'{student.full_name} — {category_code} ({currency})',
            },
        )
        return obj

    @classmethod
    def for_supplier(cls, supplier, currency):
        obj, _ = cls.objects.get_or_create(
            supplier=supplier,
            category='PAYABLE',
            currency=currency,
            defaults={
                'party_type': 'supplier',
                'code': f'SUP/{supplier.code}/{currency}',
                'name': f'{supplier.name} — Payable ({currency})',
            },
        )
        return obj

    def balance_as_of(self, date):
        """Always computed by summing movements — never trust the stored running balance for dated reports."""
        agg = self.transactions.filter(date__lte=date).aggregate(
            debit=models.Sum('debit'), credit=models.Sum('credit')
        )
        debit, credit = agg['debit'] or Decimal('0'), agg['credit'] or Decimal('0')
        return debit - credit if self.normal_balance == 'debit' else credit - debit


class SubAccountTransaction(models.Model):
    """Statement rows for a sub-account, with a running balance."""

    sub_account = models.ForeignKey(SubAccount, on_delete=models.PROTECT, related_name='transactions')
    date = models.DateField(db_index=True)
    contra_account = models.CharField(max_length=10, blank=True)
    reference = models.CharField(max_length=50, blank=True)
    description = models.CharField(max_length=500, blank=True)
    debit = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    credit = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    balance = models.DecimalField(max_digits=18, decimal_places=2)
    journal_line = models.ForeignKey(
        'accounting.JournalLine', null=True, blank=True, on_delete=models.PROTECT, related_name='sub_transactions'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'id']
        indexes = [models.Index(fields=['sub_account', 'date'])]

    def __str__(self):
        return f'{self.sub_account.code} {self.reference} ({self.date})'

    @classmethod
    def create_entry(cls, sub_account_id, date, contra_account, reference, description, debit, credit, journal_line=None):
        with transaction.atomic():
            account = SubAccount.objects.select_for_update().get(pk=sub_account_id)
            if account.normal_balance == 'debit':
                account.current_balance += debit - credit
            else:
                account.current_balance += credit - debit
            account.save(update_fields=['current_balance'])
            return cls.objects.create(
                sub_account=account,
                date=date,
                contra_account=contra_account,
                reference=reference,
                description=description,
                debit=debit,
                credit=credit,
                balance=account.current_balance,
                journal_line=journal_line,
            )
