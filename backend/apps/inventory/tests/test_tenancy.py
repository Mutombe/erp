"""Multi-tenant isolation for inventory, procurement and assets: stock,
purchase-to-pay and depreciation stay inside their own school, numbering
restarts per school, and cross-school assembly is refused."""
from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.accounting.models import ChartOfAccount, GeneralLedger
from apps.core.models import DocumentSequence, Organization, School
from apps.inventory.models import Item, ItemCategory, StockMove, Warehouse, issue_stock, receive_stock

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def two_schools(seeded_db):
    from apps.core.provisioning import provision_school

    ocw = School.get_default()
    kns = School.objects.create(
        organization=Organization.get(), code='KNS', slug='kingsknot',
        name='Kingsknot Academy', base_currency='USD', secondary_currency='ZWG',
    )
    provision_school(kns)
    return ocw, kns


def _item(school, code='PEN-01'):
    category = ItemCategory.objects.create(
        school=school, name='Stationery',
        inventory_account=ChartOfAccount.objects.get(school=school, code='1200'),
        consumption_expense_account=ChartOfAccount.objects.get(school=school, code='5210'),
    )
    item = Item.objects.create(school=school, code=code, name='Blue Pens', category=category)
    warehouse = Warehouse.objects.create(school=school, code='MAIN', name='Main Store')
    return item, warehouse


def test_stock_move_numbering_and_isolation(two_schools):
    ocw, kns = two_schools
    ocw_item, ocw_wh = _item(ocw)
    kns_item, kns_wh = _item(kns)

    ocw_move = receive_stock(item=ocw_item, warehouse=ocw_wh, quantity=D('10'),
                             unit_cost_base=D('5'), date=date(2026, 2, 1))
    kns_move = receive_stock(item=kns_item, warehouse=kns_wh, quantity=D('20'),
                             unit_cost_base=D('7'), date=date(2026, 2, 1))

    # ADJ sequence restarts per school.
    assert ocw_move.number == 'ADJ00001'
    assert kns_move.number == 'ADJ00001'
    assert ocw_move.school_id == ocw.id and kns_move.school_id == kns.id
    assert StockMove.objects.filter(school=kns).count() == 1
    assert StockMove.objects.filter(school=ocw).count() == 1
    # KNS GL rows never touch an Oceanwaves account.
    assert GeneralLedger.objects.filter(school=kns).exclude(account__school=kns).count() == 0


def test_cross_school_stock_issue_is_rejected(two_schools):
    ocw, kns = two_schools
    ocw_item, ocw_wh = _item(ocw)
    kns_item, kns_wh = _item(kns)
    receive_stock(item=kns_item, warehouse=kns_wh, quantity=D('20'),
                  unit_cost_base=D('7'), date=date(2026, 2, 1))
    # Issue a KNS item out of an Oceanwaves warehouse: refuse.
    with pytest.raises(ValidationError):
        issue_stock(item=kns_item, warehouse=ocw_wh, quantity=D('1'), date=date(2026, 2, 5))


def test_procure_to_pay_isolated(two_schools):
    ocw, kns = two_schools
    kns_item, kns_wh = _item(kns)

    from apps.procurement.models import (
        GoodsReceivedNote, GRNLine, POLine, PurchaseOrder, Supplier, VendorBill, VendorBillLine,
        create_supplier_payment,
    )
    from apps.accounting.models import BankAccount, SubAccount

    supplier = Supplier.objects.create(school=kns, code=DocumentSequence.next_for('SUP', kns),
                                       name='KNS Supplies', default_currency='USD')
    po = PurchaseOrder.objects.create(school=kns, number=DocumentSequence.next_for('PO', kns),
                                      supplier=supplier, date=date(2026, 2, 1), currency='USD')
    assert po.number == 'PO00001'
    po_line = POLine.objects.create(po=po, item=kns_item, quantity=D('10'), unit_price=D('5'))
    po.approve()
    grn = GoodsReceivedNote.objects.create(school=kns, number=DocumentSequence.next_for('GRN', kns),
                                           po=po, warehouse=kns_wh, date=date(2026, 2, 5))
    GRNLine.objects.create(grn=grn, po_line=po_line, quantity=D('10'))
    grn.post()

    bill = VendorBill.objects.create(school=kns, number=DocumentSequence.next_for('BIL', kns),
                                     supplier=supplier, date=date(2026, 2, 10),
                                     due_date=date(2026, 3, 10), currency='USD')
    VendorBillLine.objects.create(bill=bill, grn_line=grn.lines.first(), quantity=D('10'), unit_price=D('5'))
    bill.post()
    bill.refresh_from_db()
    assert bill.total == D('50.00')

    kns_bank = BankAccount.objects.get(school=kns, code='BANK-USD')
    payment = create_supplier_payment(supplier=supplier, bank_account=kns_bank, amount=D('50'),
                                      date=date(2026, 3, 1))
    assert payment.school_id == kns.id
    # Supplier pocket and every GL row are KNS-only; Oceanwaves is untouched.
    assert SubAccount.objects.filter(school=ocw, supplier=supplier).count() == 0
    assert GeneralLedger.objects.filter(school=kns).exclude(account__school=kns).count() == 0
    assert GeneralLedger.objects.filter(school=ocw).count() == 0


def test_cross_school_grn_is_rejected(two_schools):
    ocw, kns = two_schools
    ocw_item, ocw_wh = _item(ocw)
    kns_item, kns_wh = _item(kns)

    from apps.procurement.models import GoodsReceivedNote, GRNLine, POLine, PurchaseOrder, Supplier

    supplier = Supplier.objects.create(school=kns, code=DocumentSequence.next_for('SUP', kns),
                                       name='KNS Supplies', default_currency='USD')
    po = PurchaseOrder.objects.create(school=kns, number=DocumentSequence.next_for('PO', kns),
                                      supplier=supplier, date=date(2026, 2, 1), currency='USD')
    po_line = POLine.objects.create(po=po, item=kns_item, quantity=D('10'), unit_price=D('5'))
    po.approve()
    # Receive KNS goods into an Oceanwaves warehouse: refuse.
    grn = GoodsReceivedNote.objects.create(school=kns, number=DocumentSequence.next_for('GRN', kns),
                                           po=po, warehouse=ocw_wh, date=date(2026, 2, 5))
    GRNLine.objects.create(grn=grn, po_line=po_line, quantity=D('10'))
    with pytest.raises(ValidationError):
        grn.post()


def test_depreciation_scoped_to_period_school(two_schools):
    ocw, kns = two_schools
    from apps.accounting.models import FiscalPeriod
    from apps.assets.models import Asset, AssetCategory
    from apps.assets.services import run_depreciation

    category = AssetCategory.objects.create(
        school=kns, code='COMP', name='Computers', depreciation_method='straight_line',
        useful_life_months=36,
        asset_account=ChartOfAccount.objects.get(school=kns, code='1530'),
        accum_depr_account=ChartOfAccount.objects.get(school=kns, code='1630'),
        depr_expense_account=ChartOfAccount.objects.get(school=kns, code='5800'),
    )
    Asset.objects.create(
        school=kns, code=DocumentSequence.next_for('AST', kns), name='Laptop', category=category,
        acquisition_date=date(2026, 1, 10), in_service_date=date(2026, 1, 10),
        cost=D('900'), currency='USD', cost_base=D('900'),
    )
    period = FiscalPeriod.objects.get(school=kns, fiscal_year__name='FY2026', period_no=1)
    run = run_depreciation(period)
    assert run.status == 'posted'
    assert run.school_id == kns.id
    # The depreciation journal only touched KNS accounts; Oceanwaves has no GL.
    assert GeneralLedger.objects.filter(school=kns).exclude(account__school=kns).count() == 0
    assert GeneralLedger.objects.filter(school=ocw).count() == 0
