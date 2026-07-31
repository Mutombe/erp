from decimal import Decimal

from django.db import models

ZERO = Decimal('0')


class InterSchoolTransfer(models.Model):
    """A movement of value between two schools of the same group, settled by
    mirror-posting to the inter-unit accounts (Due from / Due to Related
    Schools) so the group consolidates to zero.

    - `funds`   : cash moves from one school's bank to another's.
    - `student` : a pupil (and their outstanding balance) moves to a new school;
                  a fresh Student record is opened in the destination and the net
                  fee balance is carried across via the inter-unit settlement.
    """

    KINDS = [('funds', 'Funds'), ('student', 'Student'), ('stock', 'Stock')]
    STATUS = [('draft', 'Draft'), ('completed', 'Completed'), ('reversed', 'Reversed')]

    number = models.CharField(max_length=20)
    kind = models.CharField(max_length=10, choices=KINDS)
    from_school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='transfers_out')
    to_school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='transfers_in')
    date = models.DateField()
    currency = models.CharField(max_length=3)
    amount = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)  # signed for students
    status = models.CharField(max_length=10, choices=STATUS, default='draft', db_index=True)
    note = models.TextField(blank=True)

    # funds transfers
    from_bank = models.ForeignKey(
        'accounting.BankAccount', null=True, blank=True, on_delete=models.PROTECT, related_name='transfers_out'
    )
    to_bank = models.ForeignKey(
        'accounting.BankAccount', null=True, blank=True, on_delete=models.PROTECT, related_name='transfers_in'
    )

    # student transfers
    from_student = models.ForeignKey(
        'students.Student', null=True, blank=True, on_delete=models.PROTECT, related_name='transfers_out'
    )
    to_student = models.ForeignKey(
        'students.Student', null=True, blank=True, on_delete=models.SET_NULL, related_name='transfers_in'
    )

    # stock transfers
    from_item = models.ForeignKey(
        'inventory.Item', null=True, blank=True, on_delete=models.PROTECT, related_name='transfers_out'
    )
    to_item = models.ForeignKey(
        'inventory.Item', null=True, blank=True, on_delete=models.PROTECT, related_name='transfers_in'
    )
    from_warehouse = models.ForeignKey(
        'inventory.Warehouse', null=True, blank=True, on_delete=models.PROTECT, related_name='transfers_out'
    )
    to_warehouse = models.ForeignKey(
        'inventory.Warehouse', null=True, blank=True, on_delete=models.PROTECT, related_name='transfers_in'
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=2, null=True, blank=True)

    # mirror journals, one per school
    from_journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    to_journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')

    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['kind', 'status'])]

    def __str__(self):
        return f'{self.number} {self.kind} {self.from_school_id}→{self.to_school_id}'
