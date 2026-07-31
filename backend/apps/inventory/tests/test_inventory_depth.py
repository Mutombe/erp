from datetime import date
from decimal import Decimal

import pytest

from apps.accounting.models import ChartOfAccount
from apps.core.models import Roles, User
from apps.inventory.models import (
    Item,
    ItemCategory,
    StockLot,
    StockRequisition,
    StockRequisitionLine,
    Warehouse,
    issue_stock,
    receive_stock,
    transfer_stock,
)
from conftest import assert_gl_balanced

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def category(seeded_db):
    return ItemCategory.objects.create(
        name='Stationery',
        inventory_account=ChartOfAccount.objects.get(code='1200'),
        consumption_expense_account=ChartOfAccount.objects.get(code='5210'),
    )


@pytest.fixture
def store(seeded_db):
    return Warehouse.objects.create(code='MAIN', name='Main Store')


@pytest.fixture
def store2(seeded_db):
    return Warehouse.objects.create(code='ANNEX', name='Annex Store')


@pytest.fixture
def admin_client(seeded_db):
    from rest_framework.test import APIClient

    c = APIClient()
    c.force_authenticate(User.objects.create_superuser('inv@test.local', 'x'))
    return c


class TestReorderAlerts:
    def test_low_stock_endpoint_lists_items_below_reorder(self, admin_client, category, store):
        low = Item.objects.create(code='PEN', name='Pens', category=category,
                                  reorder_level=D('50'), reorder_qty=D('200'))
        receive_stock(item=low, warehouse=store, quantity=D('10'), unit_cost_base=D('1'), date=date(2026, 2, 1))
        Item.objects.create(code='OK', name='Ample', category=category, reorder_level=D('5'), qty_on_hand=D('99'))

        res = admin_client.get('/api/inventory/items/low-stock/')
        assert res.status_code == 200
        rows = res.data['results'] if 'results' in res.data else res.data
        codes = {r['code'] for r in rows}
        assert 'PEN' in codes and 'OK' not in codes
        pen = next(r for r in rows if r['code'] == 'PEN')
        assert pen['is_low_stock'] is True
        assert D(str(pen['suggested_order_qty'])) == D('190')  # 200 target - 10 on hand


class TestBarcodeLookup:
    def test_by_barcode_resolves_item(self, admin_client, category):
        Item.objects.create(code='BK1', name='Book', category=category, barcode='6001234567890')
        res = admin_client.get('/api/inventory/items/by-barcode/?barcode=6001234567890')
        assert res.status_code == 200
        assert res.data['code'] == 'BK1'

    def test_unknown_barcode_is_404(self, admin_client, category):
        res = admin_client.get('/api/inventory/items/by-barcode/?barcode=nope')
        assert res.status_code == 404


class TestLots:
    def test_receipt_requires_lot_for_tracked_item(self, category, store):
        item = Item.objects.create(code='MILK', name='Milk', category=category, track_lots=True)
        with pytest.raises(Exception):
            receive_stock(item=item, warehouse=store, quantity=D('10'), unit_cost_base=D('1'),
                          date=date(2026, 2, 1))

    def test_fefo_issue_consumes_earliest_expiry(self, category, store):
        item = Item.objects.create(code='MILK', name='Milk', category=category, track_lots=True)
        receive_stock(item=item, warehouse=store, quantity=D('10'), unit_cost_base=D('1'),
                      date=date(2026, 2, 1), lot_code='L-MAR', expiry_date=date(2026, 3, 1))
        receive_stock(item=item, warehouse=store, quantity=D('10'), unit_cost_base=D('1'),
                      date=date(2026, 2, 1), lot_code='L-FEB', expiry_date=date(2026, 2, 10))
        issue_stock(item=item, warehouse=store, quantity=D('12'), date=date(2026, 2, 5))
        feb = StockLot.objects.get(item=item, lot_code='L-FEB')
        mar = StockLot.objects.get(item=item, lot_code='L-MAR')
        assert feb.quantity == D('0')      # earliest expiry drained first
        assert mar.quantity == D('8')
        assert_gl_balanced()

    def test_warehouse_transfer_moves_lots(self, category, store, store2):
        item = Item.objects.create(code='MILK', name='Milk', category=category, track_lots=True)
        receive_stock(item=item, warehouse=store, quantity=D('10'), unit_cost_base=D('1'),
                      date=date(2026, 2, 1), lot_code='L1', expiry_date=date(2026, 3, 1))
        transfer_stock(item=item, warehouse_from=store, warehouse_to=store2, quantity=D('4'),
                       date=date(2026, 2, 2))
        assert StockLot.objects.get(item=item, warehouse=store, lot_code='L1').quantity == D('6')
        assert StockLot.objects.get(item=item, warehouse=store2, lot_code='L1').quantity == D('4')


class TestRequisitions:
    @pytest.fixture
    def stocked(self, category, store):
        item = Item.objects.create(code='CHALK', name='Chalk', category=category)
        receive_stock(item=item, warehouse=store, quantity=D('100'), unit_cost_base=D('2'),
                      date=date(2026, 2, 1))
        item.refresh_from_db()
        return item

    def _bursar(self, school):
        return User.objects.create_user('req@test.local', 'x', role=Roles.STOREKEEPER, home_school=school)

    def test_full_lifecycle(self, admin_client, stocked, store, school):
        # create draft
        res = admin_client.post('/api/inventory/requisitions/', {
            'warehouse': store.id, 'date': '2026-02-10',
            'lines': [{'item': stocked.id, 'qty_requested': '30'}],
        }, format='json')
        assert res.status_code == 201, res.data
        rid = res.data['id']
        assert res.data['status'] == 'draft'
        assert res.data['number'].startswith('REQ')

        assert admin_client.post(f'/api/inventory/requisitions/{rid}/submit/').data['status'] == 'submitted'
        approved = admin_client.post(f'/api/inventory/requisitions/{rid}/approve/', {}, format='json')
        assert approved.data['status'] == 'approved'
        assert D(str(approved.data['lines'][0]['qty_approved'])) == D('30')

        issued = admin_client.post(f'/api/inventory/requisitions/{rid}/issue/')
        assert issued.data['status'] == 'issued'
        assert D(str(issued.data['lines'][0]['qty_issued'])) == D('30')

        stocked.refresh_from_db()
        assert stocked.qty_on_hand == D('70')  # 100 - 30 issued
        assert_gl_balanced()

    def test_partial_approval(self, admin_client, stocked, store):
        res = admin_client.post('/api/inventory/requisitions/', {
            'warehouse': store.id, 'date': '2026-02-10',
            'lines': [{'item': stocked.id, 'qty_requested': '40'}],
        }, format='json')
        rid = res.data['id']
        line_id = res.data['lines'][0]['id']
        admin_client.post(f'/api/inventory/requisitions/{rid}/submit/')
        admin_client.post(f'/api/inventory/requisitions/{rid}/approve/',
                          {'approvals': {str(line_id): '25'}}, format='json')
        admin_client.post(f'/api/inventory/requisitions/{rid}/issue/')
        stocked.refresh_from_db()
        assert stocked.qty_on_hand == D('75')  # only 25 approved+issued

    def test_reject(self, admin_client, stocked, store):
        res = admin_client.post('/api/inventory/requisitions/', {
            'warehouse': store.id, 'date': '2026-02-10',
            'lines': [{'item': stocked.id, 'qty_requested': '40'}],
        }, format='json')
        rid = res.data['id']
        admin_client.post(f'/api/inventory/requisitions/{rid}/submit/')
        rej = admin_client.post(f'/api/inventory/requisitions/{rid}/reject/',
                                {'reason': 'Not budgeted'}, format='json')
        assert rej.data['status'] == 'rejected'
        assert rej.data['review_note'] == 'Not budgeted'
        stocked.refresh_from_db()
        assert stocked.qty_on_hand == D('100')  # untouched
