from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.accounting.models import ExchangeRate, SubAccount
from apps.accounting.services import LineSpec, base_currency, build_and_post_journal
from apps.core.models import DocumentSequence

TWO = Decimal('0.01')
ZERO = Decimal('0')


class Supplier(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    tax_number = models.CharField(max_length=50, blank=True)
    default_currency = models.CharField(max_length=3, default='USD')
    payment_terms_days = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    custom_fields = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.code} · {self.name}'


class PurchaseOrder(models.Model):
    STATUS = [
        ('draft', 'Draft'), ('submitted', 'Submitted'), ('approved', 'Approved'),
        ('partially_received', 'Partially received'), ('received', 'Received'),
        ('closed', 'Closed'), ('cancelled', 'Cancelled'),
    ]

    number = models.CharField(max_length=20, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='purchase_orders')
    date = models.DateField()
    expected_date = models.DateField(null=True, blank=True)
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=20, choices=STATUS, default='draft', db_index=True)
    notes = models.TextField(blank=True)
    approved_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    approved_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.number} · {self.supplier.name}'

    @property
    def total(self):
        return sum((line.quantity * line.unit_price for line in self.lines.all()), ZERO)

    def approve(self, user=None):
        if self.status not in ('draft', 'submitted'):
            raise ValidationError(f'Cannot approve a {self.status} purchase order.')
        self.status = 'approved'
        self.approved_by = user
        self.approved_at = timezone.now()
        self.save(update_fields=['status', 'approved_by', 'approved_at'])

    def refresh_receipt_status(self):
        lines = list(self.lines.all())
        if not lines:
            return
        if all(line.qty_received >= line.quantity for line in lines):
            self.status = 'received'
        elif any(line.qty_received > 0 for line in lines):
            self.status = 'partially_received'
        self.save(update_fields=['status'])


class POLine(models.Model):
    po = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey('inventory.Item', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    description = models.CharField(max_length=300, blank=True)
    # For non-stock purchases (services, direct expenses).
    expense_account = models.ForeignKey(
        'accounting.ChartOfAccount', null=True, blank=True, on_delete=models.PROTECT, related_name='+'
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_price = models.DecimalField(max_digits=18, decimal_places=4)
    qty_received = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)

    class Meta:
        ordering = ['id']

    def clean(self):
        if not self.item_id and not self.expense_account_id:
            raise ValidationError('A PO line needs an item or an expense account.')


class GoodsReceivedNote(models.Model):
    STATUS = [('draft', 'Draft'), ('posted', 'Posted')]

    number = models.CharField(max_length=20, unique=True)
    po = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name='grns')
    warehouse = models.ForeignKey('inventory.Warehouse', on_delete=models.PROTECT, related_name='grns')
    date = models.DateField()
    received_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    status = models.CharField(max_length=10, choices=STATUS, default='draft')
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.number} ({self.po.number})'

    def post(self, user=None):
        """Receive stock (moving average) and post Dr Inventory / Cr GRNI in base
        currency at the PO price converted at the GRN-date rate."""
        from apps.inventory.models import receive_stock

        if self.journal_id:
            return self.journal
        if self.status != 'draft':
            raise ValidationError(f'GRN {self.number} is already {self.status}.')

        rate = ExchangeRate.get_rate(self.po.currency, base_currency(), self.date)
        lines = list(self.lines.select_related('po_line__item__category'))
        if not lines:
            raise ValidationError('GRN has no lines.')

        with transaction.atomic():
            specs = []
            for grn_line in lines:
                po_line = grn_line.po_line
                if grn_line.quantity <= 0:
                    continue
                if po_line.item_id is None:
                    raise ValidationError('Only stock item PO lines can be received on a GRN.')
                if po_line.qty_received + grn_line.quantity > po_line.quantity:
                    raise ValidationError(
                        f'Receiving {grn_line.quantity} exceeds outstanding quantity on {po_line.item.code}.'
                    )
                unit_cost_base = ((grn_line.unit_cost or po_line.unit_price) * rate).quantize(Decimal('0.0001'))
                cost = (grn_line.quantity * unit_cost_base).quantize(TWO)
                receive_stock(
                    item=po_line.item,
                    warehouse=self.warehouse,
                    quantity=grn_line.quantity,
                    unit_cost_base=unit_cost_base,
                    date=self.date,
                    source=('procurement.GoodsReceivedNote', self.pk),
                    journal=None,
                    user=user,
                    post_gl=False,
                )
                grn_line.unit_cost_base = unit_cost_base
                grn_line.save(update_fields=['unit_cost_base'])
                specs.append(LineSpec(
                    account=po_line.item.category.inventory_account,
                    debit=cost,
                    description=f'{self.number} {po_line.item.code} x{grn_line.quantity}',
                ))
                specs.append(LineSpec(
                    mapping_purpose='grni',
                    credit=cost,
                    description=f'{self.number} GRNI {po_line.item.code}',
                ))
                po_line.qty_received += grn_line.quantity
                po_line.save(update_fields=['qty_received'])

            journal = build_and_post_journal(
                journal_type='inventory',
                date=self.date,
                currency=base_currency(),
                description=f'GRN {self.number} for {self.po.number}',
                lines=specs,
                reference=self.number,
                exchange_rate=Decimal('1'),
                user=user,
                source=('procurement.GoodsReceivedNote', self.pk, self.number),
            )
            self.journal = journal
            self.status = 'posted'
            self.save(update_fields=['journal', 'status'])
            self.po.refresh_receipt_status()
        return journal


class GRNLine(models.Model):
    grn = models.ForeignKey(GoodsReceivedNote, on_delete=models.CASCADE, related_name='lines')
    po_line = models.ForeignKey(POLine, on_delete=models.PROTECT, related_name='grn_lines')
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    # Optional override of the PO price (in PO currency); base cost stamped at post.
    unit_cost = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    unit_cost_base = models.DecimalField(max_digits=18, decimal_places=4, default=ZERO)

    class Meta:
        ordering = ['id']


class VendorBill(models.Model):
    STATUS = [
        ('draft', 'Draft'), ('posted', 'Posted'), ('partial', 'Partially paid'),
        ('paid', 'Paid'), ('cancelled', 'Cancelled'),
    ]

    number = models.CharField(max_length=20, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='bills')
    supplier_reference = models.CharField(max_length=100, blank=True)
    po = models.ForeignKey(PurchaseOrder, null=True, blank=True, on_delete=models.SET_NULL, related_name='bills')
    date = models.DateField()
    due_date = models.DateField()
    currency = models.CharField(max_length=3)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal('1'))
    total = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    amount_paid = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    status = models.CharField(max_length=10, choices=STATUS, default='draft', db_index=True)
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    ocr_payload = models.JSONField(null=True, blank=True)  # AI bill digitization landing zone
    attachment = models.FileField(upload_to='vendor_bills/', null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [models.Index(fields=['status', 'due_date'])]

    def __str__(self):
        return f'{self.number} · {self.supplier.name}'

    @property
    def balance(self):
        return self.total - self.amount_paid

    def post(self, user=None):
        """GRN-matched lines clear GRNI (base currency); direct-expense lines hit
        their expense accounts. Credit AP control on the supplier's pocket."""
        if self.journal_id:
            return self.journal
        if self.status != 'draft':
            raise ValidationError(f'Bill {self.number} is already {self.status}.')

        rate = ExchangeRate.get_rate(self.currency, base_currency(), self.date)
        lines = list(self.lines.select_related('grn_line__po_line__item', 'expense_account'))
        if not lines:
            raise ValidationError('Bill has no lines.')

        total = ZERO
        specs = []
        for line in lines:
            amount = (line.quantity * line.unit_price).quantize(TWO)
            total += amount
            if line.grn_line_id:
                # Clear GRNI at the received base cost; price variance goes to inventory adjustment.
                grn_cost_base = (line.grn_line.quantity * line.grn_line.unit_cost_base).quantize(TWO)
                billed_base = (amount * rate).quantize(TWO)
                # GRNI was booked in base at the GRN; clear that base value while
                # carrying the bill's transaction amount on the same line.
                specs.append(LineSpec(
                    mapping_purpose='grni', debit=amount, debit_base=grn_cost_base,
                    description=f'{self.number} clear GRNI {line.grn_line.grn.number}',
                ))
                variance = billed_base - grn_cost_base
                if variance > 0:
                    specs.append(LineSpec(mapping_purpose='inventory_adjustment', debit=ZERO, debit_base=variance,
                                          description=f'{self.number} price variance'))
                elif variance < 0:
                    specs.append(LineSpec(mapping_purpose='inventory_adjustment', credit=ZERO, credit_base=-variance,
                                          description=f'{self.number} price variance'))
                specs.append(LineSpec(
                    mapping_purpose='ap_control', credit=amount,
                    sub_account=SubAccount.for_supplier(self.supplier, self.currency),
                    description=f'{self.number} {line.description or ""}'.strip(),
                ))
            else:
                if line.expense_account_id is None:
                    raise ValidationError('Non-GRN bill lines need an expense account.')
                specs.append(LineSpec(
                    account=line.expense_account, debit=amount,
                    description=f'{self.number} {line.description or line.expense_account.name}',
                ))
                specs.append(LineSpec(
                    mapping_purpose='ap_control', credit=amount,
                    sub_account=SubAccount.for_supplier(self.supplier, self.currency),
                    description=f'{self.number} {line.description or ""}'.strip(),
                ))

        with transaction.atomic():
            journal = build_and_post_journal(
                journal_type='purchases',
                date=self.date,
                currency=self.currency,
                description=f'Vendor bill {self.number} — {self.supplier.name}',
                lines=specs,
                reference=self.supplier_reference or self.number,
                exchange_rate=rate,
                user=user,
                source=('procurement.VendorBill', self.pk, self.number),
            )
            self.journal = journal
            self.exchange_rate = rate
            self.total = total
            self.status = 'posted'
            self.save(update_fields=['journal', 'exchange_rate', 'total', 'status'])
        return journal


class VendorBillLine(models.Model):
    bill = models.ForeignKey(VendorBill, on_delete=models.CASCADE, related_name='lines')
    grn_line = models.ForeignKey(GRNLine, null=True, blank=True, on_delete=models.PROTECT, related_name='bill_lines')
    expense_account = models.ForeignKey(
        'accounting.ChartOfAccount', null=True, blank=True, on_delete=models.PROTECT, related_name='+'
    )
    item = models.ForeignKey('inventory.Item', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    description = models.CharField(max_length=300, blank=True)
    quantity = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('1'))
    unit_price = models.DecimalField(max_digits=18, decimal_places=4)

    class Meta:
        ordering = ['id']


class SupplierPayment(models.Model):
    STATUS = [('posted', 'Posted'), ('reversed', 'Reversed')]

    number = models.CharField(max_length=20, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='payments')
    bank_account = models.ForeignKey('accounting.BankAccount', on_delete=models.PROTECT, related_name='supplier_payments')
    date = models.DateField()
    currency = models.CharField(max_length=3)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=6, default=Decimal('1'))
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    reference = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=10, choices=STATUS, default='posted')
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.number} · {self.supplier.name} {self.currency} {self.amount}'


class PaymentAllocation(models.Model):
    payment = models.ForeignKey(SupplierPayment, on_delete=models.CASCADE, related_name='allocations')
    bill = models.ForeignKey(VendorBill, on_delete=models.PROTECT, related_name='allocations')
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    fx_difference_base = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)

    class Meta:
        ordering = ['id']


def create_supplier_payment(*, supplier, bank_account, amount, date, reference='', notes='',
                            explicit_allocations=None, user=None):
    """Dr AP control (supplier pocket) / Cr Bank, allocated FIFO oldest-due-first."""
    amount = Decimal(amount).quantize(TWO)
    if amount <= 0:
        raise ValidationError('Payment amount must be positive.')
    currency = bank_account.currency
    rate = ExchangeRate.get_rate(currency, base_currency(), date)

    with transaction.atomic():
        payment = SupplierPayment.objects.create(
            number=DocumentSequence.next_for('PAY'),
            supplier=supplier,
            bank_account=bank_account,
            date=date,
            currency=currency,
            exchange_rate=rate,
            amount=amount,
            reference=reference,
            notes=notes,
            created_by=user,
        )
        open_bills = (
            VendorBill.objects.select_for_update()
            .filter(supplier=supplier, currency=currency, status__in=['posted', 'partial'])
            .order_by('due_date', 'date', 'id')
        )
        remaining = amount
        planned = []
        if explicit_allocations:
            by_id = {bill.pk: bill for bill in open_bills}
            for bill_id, alloc in explicit_allocations:
                bill = by_id.get(int(bill_id))
                if bill is None:
                    raise ValidationError(f'Bill {bill_id} is not open for this supplier in {currency}.')
                alloc = Decimal(alloc).quantize(TWO)
                if alloc <= 0:
                    continue
                if alloc > bill.balance:
                    raise ValidationError(f'Allocation to {bill.number} exceeds its balance.')
                if alloc > remaining:
                    raise ValidationError('Allocations exceed the payment amount.')
                planned.append((bill, alloc))
                remaining -= alloc
        else:
            for bill in open_bills:
                if remaining <= 0:
                    break
                alloc = min(bill.balance, remaining)
                if alloc > 0:
                    planned.append((bill, alloc))
                    remaining -= alloc
        if remaining > 0:
            raise ValidationError(
                f'Payment exceeds open bills by {remaining} {currency}. Reduce the amount or leave bills unallocated.'
            )

        pocket = SubAccount.for_supplier(supplier, currency)
        specs = []
        total_fx_base = ZERO
        for bill, alloc in planned:
            specs.append(LineSpec(
                mapping_purpose='ap_control', debit=alloc, sub_account=pocket,
                description=f'{payment.number} → {bill.number}',
                source=('procurement.VendorBill', bill.pk),
            ))
            fx_base = (alloc * (bill.exchange_rate - rate)).quantize(TWO)
            total_fx_base += fx_base
            PaymentAllocation.objects.create(payment=payment, bill=bill, amount=alloc, fx_difference_base=fx_base)
            bill.amount_paid += alloc
            bill.status = 'paid' if bill.amount_paid >= bill.total else 'partial'
            bill.save(update_fields=['amount_paid', 'status'])

        specs.append(LineSpec(
            account=bank_account.gl_account, credit=amount, bank_account=bank_account,
            description=f'Payment {payment.number} — {supplier.name}',
        ))

        if total_fx_base > 0:
            # AP was booked higher in base than settled: gain.
            specs.append(LineSpec(mapping_purpose='ap_control', debit=ZERO, debit_base=total_fx_base,
                                  description=f'{payment.number} FX settlement'))
            specs.append(LineSpec(mapping_purpose='fx_gain_realized', credit=ZERO, credit_base=total_fx_base,
                                  description=f'{payment.number} realized FX gain'))
        elif total_fx_base < 0:
            specs.append(LineSpec(mapping_purpose='ap_control', credit=ZERO, credit_base=-total_fx_base,
                                  description=f'{payment.number} FX settlement'))
            specs.append(LineSpec(mapping_purpose='fx_loss_realized', debit=ZERO, debit_base=-total_fx_base,
                                  description=f'{payment.number} realized FX loss'))

        journal = build_and_post_journal(
            journal_type='payments',
            date=date,
            currency=currency,
            description=f'Supplier payment {payment.number} — {supplier.name}',
            lines=specs,
            reference=payment.number,
            exchange_rate=rate,
            user=user,
            source=('procurement.SupplierPayment', payment.pk, payment.number),
        )
        payment.journal = journal
        payment.save(update_fields=['journal'])
        return payment
