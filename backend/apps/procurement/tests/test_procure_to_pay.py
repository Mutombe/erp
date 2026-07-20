from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.accounting.models import BankAccount, ChartOfAccount, SubAccount
from apps.core.models import DocumentSequence
from apps.inventory.models import (
    Department,
    Item,
    ItemCategory,
    StockLevel,
    Warehouse,
    issue_stock,
    transfer_stock,
)
from apps.procurement.models import (
    GoodsReceivedNote,
    GRNLine,
    POLine,
    PurchaseOrder,
    Supplier,
    VendorBill,
    VendorBillLine,
    create_supplier_payment,
)
from conftest import assert_gl_balanced

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def stationery(seeded_db):
    category = ItemCategory.objects.create(
        name='Stationery',
        inventory_account=ChartOfAccount.objects.get(code='1200'),
        consumption_expense_account=ChartOfAccount.objects.get(code='5210'),
    )
    return Item.objects.create(code='PEN-01', name='Blue Pens (box)', category=category)


@pytest.fixture
def store(seeded_db):
    return Warehouse.objects.create(code='MAIN', name='Main Store')


@pytest.fixture
def supplier(seeded_db):
    return Supplier.objects.create(code='SUP00001', name='OfficeMart', default_currency='USD')


def make_po_grn(supplier, item, store, qty='10', price='5.00'):
    po = PurchaseOrder.objects.create(
        number=DocumentSequence.next_for('PO'), supplier=supplier,
        date=date(2026, 2, 1), currency='USD',
    )
    po_line = POLine.objects.create(po=po, item=item, quantity=D(qty), unit_price=D(price))
    po.approve()
    grn = GoodsReceivedNote.objects.create(
        number=DocumentSequence.next_for('GRN'), po=po, warehouse=store, date=date(2026, 2, 5)
    )
    GRNLine.objects.create(grn=grn, po_line=po_line, quantity=D(qty))
    grn.post()
    return po, po_line, grn


class TestProcureToPay:
    def test_grn_posts_inventory_and_grni_and_updates_avg_cost(self, supplier, stationery, store):
        po, _, grn = make_po_grn(supplier, stationery, store)
        stationery.refresh_from_db()
        po.refresh_from_db()
        assert stationery.qty_on_hand == D('10')
        assert stationery.avg_cost == D('5.0000')
        assert po.status == 'received'
        assert ChartOfAccount.objects.get(code='1200').current_balance == D('50.00')
        assert ChartOfAccount.objects.get(code='2100').current_balance == D('50.00')
        assert_gl_balanced()

    def test_moving_average_recomputes_on_second_receipt(self, supplier, stationery, store):
        make_po_grn(supplier, stationery, store, qty='10', price='5.00')
        make_po_grn(supplier, stationery, store, qty='10', price='7.00')
        stationery.refresh_from_db()
        assert stationery.qty_on_hand == D('20')
        assert stationery.avg_cost == D('6.0000')  # (50+70)/20

    def test_bill_clears_grni_and_credits_supplier_pocket(self, supplier, stationery, store):
        _, _, grn = make_po_grn(supplier, stationery, store)
        grn_line = grn.lines.first()
        bill = VendorBill.objects.create(
            number=DocumentSequence.next_for('BIL'), supplier=supplier,
            date=date(2026, 2, 10), due_date=date(2026, 3, 10), currency='USD',
        )
        VendorBillLine.objects.create(bill=bill, grn_line=grn_line, quantity=D('10'), unit_price=D('5.00'))
        bill.post()
        bill.refresh_from_db()
        assert bill.total == D('50.00')
        assert ChartOfAccount.objects.get(code='2100').current_balance == 0  # GRNI cleared
        assert ChartOfAccount.objects.get(code='2000').current_balance == D('50.00')  # AP
        pocket = SubAccount.objects.get(supplier=supplier, currency='USD')
        assert pocket.current_balance == D('50.00')
        assert_gl_balanced()

    def test_payment_settles_bill_fifo(self, supplier, stationery, store):
        _, _, grn = make_po_grn(supplier, stationery, store)
        grn_line = grn.lines.first()
        bill = VendorBill.objects.create(
            number=DocumentSequence.next_for('BIL'), supplier=supplier,
            date=date(2026, 2, 10), due_date=date(2026, 3, 10), currency='USD',
        )
        VendorBillLine.objects.create(bill=bill, grn_line=grn_line, quantity=D('10'), unit_price=D('5.00'))
        bill.post()
        bank = BankAccount.objects.get(code='BANK-USD')
        payment = create_supplier_payment(
            supplier=supplier, bank_account=bank, amount=D('50'), date=date(2026, 3, 1)
        )
        bill.refresh_from_db()
        assert bill.status == 'paid'
        assert ChartOfAccount.objects.get(code='2000').current_balance == 0
        assert SubAccount.objects.get(supplier=supplier, currency='USD').current_balance == 0
        bank.refresh_from_db()
        assert bank.book_balance == D('-50.00')
        assert_gl_balanced()

    def test_payment_exceeding_open_bills_is_rejected(self, supplier, seeded_db):
        bank = BankAccount.objects.get(code='BANK-USD')
        with pytest.raises(ValidationError):
            create_supplier_payment(
                supplier=supplier, bank_account=bank, amount=D('10'), date=date(2026, 3, 1)
            )


class TestStockOps:
    def test_issue_at_average_cost_hits_expense(self, supplier, stationery, store):
        make_po_grn(supplier, stationery, store, qty='10', price='5.00')
        move = issue_stock(item=stationery, warehouse=store, quantity=D('4'), date=date(2026, 2, 20),
                           department=Department.objects.get(code='ACAD'))
        stationery.refresh_from_db()
        assert stationery.qty_on_hand == D('6')
        assert move.total_cost_base == D('20.00')
        assert ChartOfAccount.objects.get(code='5210').current_balance == D('20.00')
        assert ChartOfAccount.objects.get(code='1200').current_balance == D('30.00')
        assert_gl_balanced()

    def test_cannot_issue_more_than_on_hand(self, supplier, stationery, store):
        make_po_grn(supplier, stationery, store, qty='10', price='5.00')
        with pytest.raises(ValidationError):
            issue_stock(item=stationery, warehouse=store, quantity=D('11'), date=date(2026, 2, 20))

    def test_transfer_moves_quantities_without_gl(self, supplier, stationery, store):
        make_po_grn(supplier, stationery, store, qty='10', price='5.00')
        other = Warehouse.objects.create(code='LAB', name='Science Lab Store')
        move = transfer_stock(
            item=stationery, warehouse_from=store, warehouse_to=other, quantity=D('3'), date=date(2026, 2, 21)
        )
        assert move.journal_id is None
        assert StockLevel.objects.get(item=stationery, warehouse=store).quantity == D('7')
        assert StockLevel.objects.get(item=stationery, warehouse=other).quantity == D('3')
