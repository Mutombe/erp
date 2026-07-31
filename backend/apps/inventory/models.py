from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction

from apps.accounting.services import LineSpec, build_and_post_journal
from apps.core.models import DocumentSequence

TWO = Decimal('0.01')
FOUR = Decimal('0.0001')
ZERO = Decimal('0')


def _default_school():
    from apps.core.models import School

    return School.get_default()


class ItemCategory(models.Model):
    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='item_categories')
    name = models.CharField(max_length=100)
    inventory_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+')
    consumption_expense_account = models.ForeignKey(
        'accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Item categories'
        unique_together = [('school', 'name')]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school = _default_school()
        super().save(*args, **kwargs)


class Department(models.Model):
    """Consumption dimension for stock issues (Agriculture, Kitchen, Sports…).

    When ``expense_account`` is set, stock issued to the department debits that
    account instead of the item category's consumption expense account."""

    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='departments')
    code = models.CharField(max_length=10)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    expense_account = models.ForeignKey(
        'accounting.ChartOfAccount', null=True, blank=True, on_delete=models.PROTECT, related_name='+'
    )
    head_name = models.CharField(max_length=150, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        unique_together = [('school', 'code')]

    def __str__(self):
        return f'{self.code} · {self.name}'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school = _default_school()
        super().save(*args, **kwargs)


class Item(models.Model):
    ITEM_TYPES = [('stockable', 'Stockable'), ('consumable', 'Consumable'), ('service', 'Service')]

    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='items')
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=200)
    category = models.ForeignKey(ItemCategory, on_delete=models.PROTECT, related_name='items')
    uom = models.CharField(max_length=20, default='each')
    item_type = models.CharField(max_length=12, choices=ITEM_TYPES, default='stockable')
    # Moving average cost in base currency; quantities per warehouse in StockLevel.
    avg_cost = models.DecimalField(max_digits=18, decimal_places=4, default=ZERO)
    qty_on_hand = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    reorder_level = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    # Target quantity to bring stock back up to when reordering (the "max").
    reorder_qty = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    # When true, receipts/issues track quantities against dated lots (FEFO).
    track_lots = models.BooleanField(default=False)
    barcode = models.CharField(max_length=64, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']
        unique_together = [('school', 'code')]

    def __str__(self):
        return f'{self.code} · {self.name}'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = self.category.school_id if self.category_id else _default_school().pk
        super().save(*args, **kwargs)

    @property
    def is_low_stock(self):
        return self.reorder_level > 0 and self.qty_on_hand <= self.reorder_level

    @property
    def suggested_order_qty(self):
        """How much to buy to reach the reorder target (or clear the shortfall)."""
        if not self.is_low_stock:
            return ZERO
        target = self.reorder_qty if self.reorder_qty > 0 else self.reorder_level
        return max(target - self.qty_on_hand, ZERO)


class Warehouse(models.Model):
    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='warehouses')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=200, blank=True)
    storekeeper = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['code']
        unique_together = [('school', 'code')]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school = _default_school()
        super().save(*args, **kwargs)


class StockLevel(models.Model):
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='stock_levels')
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='stock_levels')
    quantity = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)

    class Meta:
        unique_together = [('item', 'warehouse')]

    def __str__(self):
        return f'{self.item.code} @ {self.warehouse.code}: {self.quantity}'


class StockLot(models.Model):
    """A dated batch of an item in a warehouse (for lot-tracked items). Costing
    stays moving-average at the item level; lots add batch + expiry visibility
    and drive FEFO (first-expiry-first-out) issuing."""

    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='stock_lots')
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='lots')
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='lots')
    lot_code = models.CharField(max_length=60)
    expiry_date = models.DateField(null=True, blank=True)
    quantity = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    received_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['expiry_date', 'id']
        unique_together = [('item', 'warehouse', 'lot_code')]
        indexes = [models.Index(fields=['item', 'warehouse', 'expiry_date'])]

    def __str__(self):
        return f'{self.item.code} · lot {self.lot_code} x{self.quantity}'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = self.item.school_id if self.item_id else _default_school().pk
        super().save(*args, **kwargs)


def _receive_lot(item, warehouse, quantity, lot_code, expiry_date, date):
    lot, _ = StockLot.objects.select_for_update().get_or_create(
        item=item, warehouse=warehouse, lot_code=lot_code,
        defaults={'school_id': item.school_id, 'expiry_date': expiry_date, 'received_date': date},
    )
    lot.quantity += quantity
    if expiry_date and not lot.expiry_date:
        lot.expiry_date = expiry_date
    lot.save(update_fields=['quantity', 'expiry_date'])
    return lot


def _consume_lots_fefo(item, warehouse, quantity):
    """Draw `quantity` from a warehouse's lots, earliest-expiry first. Raises if
    the lots don't cover it (guards against issuing untracked stock)."""
    remaining = quantity
    lots = StockLot.objects.select_for_update().filter(
        item=item, warehouse=warehouse, quantity__gt=0
    ).order_by('expiry_date', 'id')
    for lot in lots:
        if remaining <= 0:
            break
        take = min(lot.quantity, remaining)
        lot.quantity -= take
        lot.save(update_fields=['quantity'])
        remaining -= take
    if remaining > 0:
        raise ValidationError(
            f'{item.code} is lot-tracked but its lots in {warehouse.code} are short by {remaining}.'
        )


class StockMove(models.Model):
    MOVE_TYPES = [
        ('receipt', 'Receipt'), ('issue', 'Issue'), ('transfer', 'Transfer'),
        ('adjustment_in', 'Adjustment in'), ('adjustment_out', 'Adjustment out'),
    ]
    STATUS = [('posted', 'Posted')]

    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='stock_moves')
    number = models.CharField(max_length=20)
    move_type = models.CharField(max_length=15, choices=MOVE_TYPES)
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='moves')
    warehouse_from = models.ForeignKey(
        Warehouse, null=True, blank=True, on_delete=models.PROTECT, related_name='moves_out'
    )
    warehouse_to = models.ForeignKey(
        Warehouse, null=True, blank=True, on_delete=models.PROTECT, related_name='moves_in'
    )
    quantity = models.DecimalField(max_digits=18, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=18, decimal_places=4, default=ZERO)  # base currency
    total_cost_base = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    date = models.DateField()
    department = models.ForeignKey(  # consumption dimension
        Department, null=True, blank=True, on_delete=models.PROTECT, related_name='stock_moves'
    )
    reason = models.CharField(max_length=300, blank=True)
    source_type = models.CharField(max_length=50, blank=True)
    source_id = models.PositiveBigIntegerField(null=True, blank=True)
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    status = models.CharField(max_length=10, choices=STATUS, default='posted')
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        unique_together = [('school', 'number')]
        indexes = [models.Index(fields=['item', 'date'])]

    def __str__(self):
        return f'{self.number} {self.move_type} {self.item.code} x{self.quantity}'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = (self.warehouse_to or self.warehouse_from).school_id \
                if (self.warehouse_to_id or self.warehouse_from_id) else _default_school().pk
        super().save(*args, **kwargs)


def _adjust_level(item, warehouse, delta):
    level, _ = StockLevel.objects.select_for_update().get_or_create(item=item, warehouse=warehouse)
    level.quantity += delta
    if level.quantity < 0:
        raise ValidationError(
            f'Insufficient stock of {item.code} in {warehouse.code}: have {level.quantity - delta}, need {-delta}.'
        )
    level.save(update_fields=['quantity'])


def receive_stock(*, item, warehouse, quantity, unit_cost_base, date, source=None, journal=None,
                  user=None, post_gl=True, school=None, lot_code='', expiry_date=None):
    """Stock receipt at actual cost; updates the moving average under a row lock.
    When post_gl is False the caller (e.g. GRN) posts the journal itself.

    Lot-tracked items require a `lot_code`; the batch (and optional expiry) is
    recorded for FEFO issuing and expiry reporting."""
    quantity = Decimal(quantity)
    if quantity <= 0:
        raise ValidationError('Receipt quantity must be positive.')
    unit_cost_base = Decimal(unit_cost_base)
    school = school or warehouse.school
    if item.school_id != school.id or warehouse.school_id != school.id:
        raise ValidationError('Stock receipt item and warehouse belong to different schools.')
    if item.track_lots and not lot_code:
        raise ValidationError(f'{item.code} is lot-tracked; a lot/batch code is required.')

    with transaction.atomic():
        item = Item.objects.select_for_update().get(pk=item.pk)
        new_qty = item.qty_on_hand + quantity
        if new_qty > 0:
            item.avg_cost = (
                (item.qty_on_hand * item.avg_cost + quantity * unit_cost_base) / new_qty
            ).quantize(FOUR)
        item.qty_on_hand = new_qty
        item.save(update_fields=['avg_cost', 'qty_on_hand'])
        _adjust_level(item, warehouse, quantity)
        if item.track_lots:
            _receive_lot(item, warehouse, quantity, lot_code, expiry_date, date)

        move = StockMove.objects.create(
            school=school,
            number=DocumentSequence.next_for('ADJ', school),
            move_type='receipt' if source else 'adjustment_in',
            item=item,
            warehouse_to=warehouse,
            quantity=quantity,
            unit_cost=unit_cost_base,
            total_cost_base=(quantity * unit_cost_base).quantize(TWO),
            date=date,
            source_type=source[0] if source else '',
            source_id=source[1] if source else None,
            journal=journal,
            created_by=user,
        )
        if post_gl and journal is None:
            from django.conf import settings

            gl_journal = build_and_post_journal(
                journal_type='inventory',
                date=date,
                currency=settings.BASE_CURRENCY,
                description=f'Stock adjustment in: {item.code} x{quantity}',
                lines=[
                    LineSpec(account=item.category.inventory_account, debit=move.total_cost_base),
                    LineSpec(mapping_purpose='inventory_adjustment', credit=move.total_cost_base),
                ],
                reference=move.number,
                user=user,
                school=school,
                source=('inventory.StockMove', move.pk, move.number),
            )
            move.journal = gl_journal
            move.save(update_fields=['journal'])
        return move


def _issue_debit_account(item, department, expense_account):
    """Debit side for a stock issue, most specific source first:
    explicit override → department's own account → item category consumption."""
    if expense_account is not None:
        return expense_account
    if department is not None and department.expense_account_id:
        return department.expense_account
    return item.category.consumption_expense_account


def issue_stock(*, item, warehouse, quantity, date, department=None, reason='', user=None,
                expense_account=None, school=None):
    """Issue at moving-average cost: Dr consumption expense / Cr inventory.

    ``department`` is a Department instance (or None); when it carries its own
    expense_account the issue is charged there instead of the category default."""
    from django.conf import settings

    quantity = Decimal(quantity)
    if quantity <= 0:
        raise ValidationError('Issue quantity must be positive.')
    school = school or warehouse.school
    if item.school_id != school.id or warehouse.school_id != school.id:
        raise ValidationError('Stock issue item and warehouse belong to different schools.')

    with transaction.atomic():
        item = Item.objects.select_for_update().get(pk=item.pk)
        cost = (quantity * item.avg_cost).quantize(TWO)
        _adjust_level(item, warehouse, -quantity)
        if item.track_lots:
            _consume_lots_fefo(item, warehouse, quantity)
        item.qty_on_hand -= quantity
        item.save(update_fields=['qty_on_hand'])

        move = StockMove.objects.create(
            school=school,
            number=DocumentSequence.next_for('ADJ', school),
            move_type='issue',
            item=item,
            warehouse_from=warehouse,
            quantity=quantity,
            unit_cost=item.avg_cost,
            total_cost_base=cost,
            date=date,
            department=department,
            reason=reason,
            created_by=user,
        )
        if cost > 0:
            journal = build_and_post_journal(
                journal_type='inventory',
                date=date,
                currency=settings.BASE_CURRENCY,
                description=(
                    f'Stock issue {item.code} x{quantity}'
                    + (f' to {department.name}' if department else '')
                ),
                lines=[
                    LineSpec(account=_issue_debit_account(item, department, expense_account), debit=cost),
                    LineSpec(account=item.category.inventory_account, credit=cost),
                ],
                reference=move.number,
                user=user,
                school=school,
                source=('inventory.StockMove', move.pk, move.number),
            )
            move.journal = journal
            move.save(update_fields=['journal'])
        return move


def transfer_stock(*, item, warehouse_from, warehouse_to, quantity, date, user=None, school=None):
    """Warehouse transfer — no GL impact, quantities only. Lot-tracked items move
    their earliest-expiry lots FEFO into the destination warehouse."""
    quantity = Decimal(quantity)
    if quantity <= 0:
        raise ValidationError('Transfer quantity must be positive.')
    if warehouse_from == warehouse_to:
        raise ValidationError('Source and destination warehouses must differ.')
    school = school or warehouse_from.school
    if warehouse_from.school_id != school.id or warehouse_to.school_id != school.id:
        raise ValidationError('Stock transfer warehouses belong to different schools.')
    with transaction.atomic():
        item = Item.objects.select_for_update().get(pk=item.pk)
        _adjust_level(item, warehouse_from, -quantity)
        _adjust_level(item, warehouse_to, quantity)
        if item.track_lots:
            _move_lots_fefo(item, warehouse_from, warehouse_to, quantity, date)
        return StockMove.objects.create(
            school=school,
            number=DocumentSequence.next_for('ADJ', school),
            move_type='transfer',
            item=item,
            warehouse_from=warehouse_from,
            warehouse_to=warehouse_to,
            quantity=quantity,
            unit_cost=item.avg_cost,
            total_cost_base=(quantity * item.avg_cost).quantize(TWO),
            date=date,
            created_by=user,
        )


def _move_lots_fefo(item, warehouse_from, warehouse_to, quantity, date):
    """Move `quantity` of lot-tracked stock between warehouses, FEFO, preserving
    each lot's code and expiry on the destination side."""
    remaining = quantity
    lots = StockLot.objects.select_for_update().filter(
        item=item, warehouse=warehouse_from, quantity__gt=0
    ).order_by('expiry_date', 'id')
    for lot in lots:
        if remaining <= 0:
            break
        take = min(lot.quantity, remaining)
        lot.quantity -= take
        lot.save(update_fields=['quantity'])
        _receive_lot(item, warehouse_to, take, lot.lot_code, lot.expiry_date, date)
        remaining -= take
    if remaining > 0:
        raise ValidationError(
            f'{item.code} is lot-tracked but its lots in {warehouse_from.code} are short by {remaining}.'
        )


class StockRequisition(models.Model):
    """An internal request to draw stock from a store to a department. Flows
    draft → submitted → approved/rejected → issued. Issuing runs the standard
    issue_stock() per line, so the GL/consumption postings are unchanged."""

    STATUS = [
        ('draft', 'Draft'), ('submitted', 'Submitted'), ('approved', 'Approved'),
        ('rejected', 'Rejected'), ('issued', 'Issued'), ('partially_issued', 'Partially issued'),
    ]

    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='requisitions')
    number = models.CharField(max_length=20)
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name='requisitions')
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.PROTECT, related_name='requisitions'
    )
    date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS, default='draft', db_index=True)
    note = models.TextField(blank=True)
    review_note = models.CharField(max_length=500, blank=True)
    requested_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    reviewed_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('school', 'number')]
        indexes = [models.Index(fields=['status', 'school'])]

    def __str__(self):
        return f'{self.number} ({self.status})'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = self.warehouse.school_id if self.warehouse_id else _default_school().pk
        super().save(*args, **kwargs)

    def submit(self):
        if self.status != 'draft':
            raise ValidationError(f'Requisition {self.number} is already {self.status}.')
        if not self.lines.exists():
            raise ValidationError('A requisition needs at least one line.')
        self.status = 'submitted'
        self.save(update_fields=['status'])

    def approve(self, *, user=None, approvals=None):
        """Approve (optionally adjusting per-line quantities). `approvals` maps
        line id → approved qty; omitted lines approve their requested quantity."""
        from django.utils import timezone

        if self.status != 'submitted':
            raise ValidationError(f'Only submitted requisitions can be approved (this is {self.status}).')
        approvals = approvals or {}
        for line in self.lines.all():
            qty = approvals.get(line.id, approvals.get(str(line.id), line.qty_requested))
            line.qty_approved = Decimal(qty)
            line.save(update_fields=['qty_approved'])
        self.status = 'approved'
        self.reviewed_by = user
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'reviewed_by', 'reviewed_at'])

    def reject(self, *, reason='', user=None):
        from django.utils import timezone

        if self.status not in ('submitted', 'approved'):
            raise ValidationError(f'Cannot reject a {self.status} requisition.')
        self.status = 'rejected'
        self.review_note = reason
        self.reviewed_by = user
        self.reviewed_at = timezone.now()
        self.save(update_fields=['status', 'review_note', 'reviewed_by', 'reviewed_at'])

    def issue(self, *, user=None):
        """Issue the approved quantities from the store to the department, posting
        the usual consumption journals via issue_stock()."""
        if self.status not in ('approved', 'partially_issued'):
            raise ValidationError(f'Only approved requisitions can be issued (this is {self.status}).')
        fully = True
        with transaction.atomic():
            for line in self.lines.select_related('item').all():
                outstanding = line.qty_approved - line.qty_issued
                if outstanding <= 0:
                    continue
                issue_stock(
                    item=line.item, warehouse=self.warehouse, quantity=outstanding,
                    date=self.date, department=self.department,
                    reason=f'Requisition {self.number}', user=user,
                )
                line.qty_issued += outstanding
                line.save(update_fields=['qty_issued'])
                if line.qty_issued < line.qty_approved:
                    fully = False
            self.status = 'issued' if fully else 'partially_issued'
            self.save(update_fields=['status'])


class StockRequisitionLine(models.Model):
    requisition = models.ForeignKey(StockRequisition, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(Item, on_delete=models.PROTECT, related_name='+')
    qty_requested = models.DecimalField(max_digits=18, decimal_places=2)
    qty_approved = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    qty_issued = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.requisition.number} · {self.item.code} x{self.qty_requested}'
