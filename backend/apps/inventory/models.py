from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction

from apps.accounting.services import LineSpec, build_and_post_journal
from apps.core.models import DocumentSequence

TWO = Decimal('0.01')
FOUR = Decimal('0.0001')
ZERO = Decimal('0')


class ItemCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    inventory_account = models.ForeignKey('accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+')
    consumption_expense_account = models.ForeignKey(
        'accounting.ChartOfAccount', on_delete=models.PROTECT, related_name='+'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Item categories'

    def __str__(self):
        return self.name


class Item(models.Model):
    ITEM_TYPES = [('stockable', 'Stockable'), ('consumable', 'Consumable'), ('service', 'Service')]

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=200)
    category = models.ForeignKey(ItemCategory, on_delete=models.PROTECT, related_name='items')
    uom = models.CharField(max_length=20, default='each')
    item_type = models.CharField(max_length=12, choices=ITEM_TYPES, default='stockable')
    # Moving average cost in base currency; quantities per warehouse in StockLevel.
    avg_cost = models.DecimalField(max_digits=18, decimal_places=4, default=ZERO)
    qty_on_hand = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    reorder_level = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)
    barcode = models.CharField(max_length=64, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'


class Warehouse(models.Model):
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    location = models.CharField(max_length=200, blank=True)
    storekeeper = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return self.name


class StockLevel(models.Model):
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='stock_levels')
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='stock_levels')
    quantity = models.DecimalField(max_digits=18, decimal_places=2, default=ZERO)

    class Meta:
        unique_together = [('item', 'warehouse')]

    def __str__(self):
        return f'{self.item.code} @ {self.warehouse.code}: {self.quantity}'


class StockMove(models.Model):
    MOVE_TYPES = [
        ('receipt', 'Receipt'), ('issue', 'Issue'), ('transfer', 'Transfer'),
        ('adjustment_in', 'Adjustment in'), ('adjustment_out', 'Adjustment out'),
    ]
    STATUS = [('posted', 'Posted')]

    number = models.CharField(max_length=20, unique=True)
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
    department = models.CharField(max_length=100, blank=True)  # consumption dimension
    reason = models.CharField(max_length=300, blank=True)
    source_type = models.CharField(max_length=50, blank=True)
    source_id = models.PositiveBigIntegerField(null=True, blank=True)
    journal = models.ForeignKey('accounting.Journal', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    status = models.CharField(max_length=10, choices=STATUS, default='posted')
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-id']
        indexes = [models.Index(fields=['item', 'date'])]

    def __str__(self):
        return f'{self.number} {self.move_type} {self.item.code} x{self.quantity}'


def _adjust_level(item, warehouse, delta):
    level, _ = StockLevel.objects.select_for_update().get_or_create(item=item, warehouse=warehouse)
    level.quantity += delta
    if level.quantity < 0:
        raise ValidationError(
            f'Insufficient stock of {item.code} in {warehouse.code}: have {level.quantity - delta}, need {-delta}.'
        )
    level.save(update_fields=['quantity'])


def receive_stock(*, item, warehouse, quantity, unit_cost_base, date, source=None, journal=None, user=None, post_gl=True):
    """Stock receipt at actual cost; updates the moving average under a row lock.
    When post_gl is False the caller (e.g. GRN) posts the journal itself."""
    quantity = Decimal(quantity)
    if quantity <= 0:
        raise ValidationError('Receipt quantity must be positive.')
    unit_cost_base = Decimal(unit_cost_base)

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

        move = StockMove.objects.create(
            number=DocumentSequence.next_for('ADJ'),
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
                source=('inventory.StockMove', move.pk, move.number),
            )
            move.journal = gl_journal
            move.save(update_fields=['journal'])
        return move


def issue_stock(*, item, warehouse, quantity, date, department='', reason='', user=None, expense_account=None):
    """Issue at moving-average cost: Dr consumption expense / Cr inventory."""
    from django.conf import settings

    quantity = Decimal(quantity)
    if quantity <= 0:
        raise ValidationError('Issue quantity must be positive.')

    with transaction.atomic():
        item = Item.objects.select_for_update().get(pk=item.pk)
        cost = (quantity * item.avg_cost).quantize(TWO)
        _adjust_level(item, warehouse, -quantity)
        item.qty_on_hand -= quantity
        item.save(update_fields=['qty_on_hand'])

        move = StockMove.objects.create(
            number=DocumentSequence.next_for('ADJ'),
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
                description=f'Stock issue {item.code} x{quantity}' + (f' to {department}' if department else ''),
                lines=[
                    LineSpec(account=expense_account or item.category.consumption_expense_account, debit=cost),
                    LineSpec(account=item.category.inventory_account, credit=cost),
                ],
                reference=move.number,
                user=user,
                source=('inventory.StockMove', move.pk, move.number),
            )
            move.journal = journal
            move.save(update_fields=['journal'])
        return move


def transfer_stock(*, item, warehouse_from, warehouse_to, quantity, date, user=None):
    """Warehouse transfer — no GL impact, quantities only."""
    quantity = Decimal(quantity)
    if quantity <= 0:
        raise ValidationError('Transfer quantity must be positive.')
    if warehouse_from == warehouse_to:
        raise ValidationError('Source and destination warehouses must differ.')
    with transaction.atomic():
        item = Item.objects.select_for_update().get(pk=item.pk)
        _adjust_level(item, warehouse_from, -quantity)
        _adjust_level(item, warehouse_to, quantity)
        return StockMove.objects.create(
            number=DocumentSequence.next_for('ADJ'),
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
