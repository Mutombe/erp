from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction


class OpeningBalance(models.Model):
    """Takeover/opening entries. One side is always the Opening Balances contra
    account (3900) so pre-system history enters the books without fabricating
    cash or income."""

    DIRECTIONS = [('debit', 'Debit target account'), ('credit', 'Credit target account')]
    STATUS = [('draft', 'Draft'), ('posted', 'Posted'), ('reversed', 'Reversed')]

    number = models.CharField(max_length=20, unique=True)
    date = models.DateField()
    target_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+')
    direction = models.CharField(max_length=6, choices=DIRECTIONS)
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    currency = models.CharField(max_length=3)
    student = models.ForeignKey('students.Student', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    supplier = models.ForeignKey('procurement.Supplier', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    category = models.CharField(max_length=20, blank=True)  # fee category for student pockets
    description = models.CharField(max_length=500)
    status = models.CharField(max_length=10, choices=STATUS, default='draft')
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.number} {self.target_account.code} {self.direction} {self.amount}'

    def clean(self):
        if self.amount is not None and self.amount <= 0:
            raise ValidationError({'amount': 'Amount must be positive.'})
        if self.student_id and self.supplier_id:
            raise ValidationError('An opening balance can reference a student or a supplier, not both.')
        if self.student_id and not self.category:
            raise ValidationError({'category': 'Student opening balances need a fee category for the pocket.'})

    def post(self, user=None):
        from ..services import LineSpec, build_and_post_journal
        from .subledger import SubAccount

        if self.status != 'draft':
            raise ValidationError(f'Opening balance {self.number} is already {self.status}.')
        self.clean()

        sub_account = None
        if self.student_id:
            sub_account = SubAccount.for_student(self.student, self.category, self.currency)
        elif self.supplier_id:
            sub_account = SubAccount.for_supplier(self.supplier, self.currency)

        zero = Decimal('0')
        target = LineSpec(
            account=self.target_account,
            debit=self.amount if self.direction == 'debit' else zero,
            credit=self.amount if self.direction == 'credit' else zero,
            sub_account=sub_account,
            description=self.description,
        )
        contra = LineSpec(
            mapping_purpose='opening_balances',
            debit=self.amount if self.direction == 'credit' else zero,
            credit=self.amount if self.direction == 'debit' else zero,
            description=f'Opening balance contra: {self.description}',
        )

        with transaction.atomic():
            journal = build_and_post_journal(
                journal_type='opening',
                date=self.date,
                currency=self.currency,
                description=f'Opening balance {self.number}: {self.description}',
                lines=[target, contra],
                reference=self.number,
                user=user,
                source=('accounting.OpeningBalance', self.pk, self.number),
            )
            self.journal = journal
            self.status = 'posted'
            self.save(update_fields=['journal', 'status'])
        return journal
