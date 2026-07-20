from datetime import date
from decimal import Decimal

import pytest
from django.db.models import ProtectedError

from apps.accounting.models import ChartOfAccount
from apps.inventory.models import (
    Department,
    Item,
    ItemCategory,
    StockMove,
    Warehouse,
    issue_stock,
    receive_stock,
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
def admin_client(seeded_db):
    from rest_framework.test import APIClient

    from apps.core.models import User

    client = APIClient()
    client.force_authenticate(User.objects.create_superuser('deptadmin@test.local', 'x'))
    return client


@pytest.fixture
def store(seeded_db):
    return Warehouse.objects.create(code='MAIN', name='Main Store')


@pytest.fixture
def stocked_item(category, store):
    item = Item.objects.create(code='PEN-01', name='Blue Pens (box)', category=category)
    receive_stock(
        item=item, warehouse=store, quantity=D('100'), unit_cost_base=D('5.00'),
        date=date(2026, 2, 1),
    )
    item.refresh_from_db()
    return item


def issue(item, store, qty, department=None, day=20):
    return issue_stock(
        item=item, warehouse=store, quantity=D(qty), date=date(2026, 2, day),
        department=department,
    )


class TestDepartmentSeed:
    def test_seed_creates_departments_with_accounts(self, seeded_db):
        assert Department.objects.count() >= 11
        assert Department.objects.get(code='AGRI').expense_account.code == '5230'
        assert Department.objects.get(code='SPRT').expense_account.code == '5220'
        assert Department.objects.get(code='LIB').expense_account is None

    def test_seed_is_idempotent(self, seeded_db):
        from django.core.management import call_command

        before = Department.objects.count()
        call_command('seed_school')
        assert Department.objects.count() == before


class TestIssuePosting:
    def test_department_expense_account_overrides_category(self, stocked_item, store):
        """AGRI carries 5230, so the issue must debit 5230 — not the category's 5210."""
        agri = Department.objects.get(code='AGRI')
        move = issue(stocked_item, store, '4', department=agri)

        assert move.department == agri
        assert move.total_cost_base == D('20.00')
        assert ChartOfAccount.objects.get(code='5230').current_balance == D('20.00')
        assert ChartOfAccount.objects.get(code='5210').current_balance == 0
        assert_gl_balanced()

    def test_department_without_account_falls_back_to_category(self, stocked_item, store):
        library = Department.objects.get(code='LIB')
        assert library.expense_account is None
        move = issue(stocked_item, store, '4', department=library)

        assert move.department == library
        assert ChartOfAccount.objects.get(code='5210').current_balance == D('20.00')
        assert_gl_balanced()

    def test_issue_without_department_uses_category_account(self, stocked_item, store):
        move = issue(stocked_item, store, '4')

        assert move.department_id is None
        assert ChartOfAccount.objects.get(code='5210').current_balance == D('20.00')
        assert_gl_balanced()

    def test_explicit_expense_account_wins_over_department(self, stocked_item, store):
        agri = Department.objects.get(code='AGRI')
        override = ChartOfAccount.objects.get(code='5400')
        issue_stock(
            item=stocked_item, warehouse=store, quantity=D('2'), date=date(2026, 2, 20),
            department=agri, expense_account=override,
        )
        assert ChartOfAccount.objects.get(code='5400').current_balance == D('10.00')
        assert ChartOfAccount.objects.get(code='5230').current_balance == 0
        assert_gl_balanced()

    def test_journal_description_names_the_department(self, stocked_item, store):
        kitchen = Department.objects.get(code='KITC')
        move = issue(stocked_item, store, '3', department=kitchen)
        assert 'Kitchen & Catering' in move.journal.description

    def test_mixed_issues_keep_gl_balanced(self, stocked_item, store):
        issue(stocked_item, store, '5', department=Department.objects.get(code='AGRI'))
        issue(stocked_item, store, '5', department=Department.objects.get(code='LIB'))
        issue(stocked_item, store, '5')
        stocked_item.refresh_from_db()
        assert stocked_item.qty_on_hand == D('85')
        assert_gl_balanced()


class TestDepartmentProtection:
    def test_delete_department_in_use_is_rejected(self, stocked_item, store):
        agri = Department.objects.get(code='AGRI')
        issue(stocked_item, store, '1', department=agri)
        with pytest.raises(ProtectedError):
            agri.delete()
        assert Department.objects.filter(code='AGRI').exists()

    def test_unused_department_can_be_deleted(self, seeded_db):
        spare = Department.objects.create(code='SPARE', name='Spare Unit')
        spare.delete()
        assert not Department.objects.filter(code='SPARE').exists()


class TestDepartmentApi:
    def test_list_departments(self, admin_client):
        response = admin_client.get('/api/inventory/departments/')
        assert response.status_code == 200
        # pagination_class = None → a plain list
        codes = {row['code'] for row in response.data}
        assert {'AGRI', 'KITC', 'ACAD'} <= codes
        agri = next(r for r in response.data if r['code'] == 'AGRI')
        assert agri['expense_account_code'] == '5230'
        assert agri['expense_account_name'] == 'Agriculture & Farm Expenses'
        assert agri['stock_move_count'] == 0

    def test_stock_move_count_reflects_issues(self, admin_client, stocked_item, store):
        issue(stocked_item, store, '2', department=Department.objects.get(code='AGRI'))
        response = admin_client.get('/api/inventory/departments/')
        agri = next(r for r in response.data if r['code'] == 'AGRI')
        assert agri['stock_move_count'] == 1

    def test_create_department(self, admin_client):
        response = admin_client.post('/api/inventory/departments/', {
            'code': 'LAB', 'name': 'Science Laboratory',
            'expense_account': ChartOfAccount.objects.get(code='5210').pk,
        }, format='json')
        assert response.status_code == 201
        assert Department.objects.get(code='LAB').expense_account.code == '5210'

    def test_delete_in_use_department_is_not_a_500(self, admin_client, stocked_item, store):
        agri = Department.objects.get(code='AGRI')
        issue(stocked_item, store, '1', department=agri)
        response = admin_client.delete(f'/api/inventory/departments/{agri.pk}/')
        assert response.status_code in (400, 409), response.status_code
        assert Department.objects.filter(pk=agri.pk).exists()

    def test_issue_endpoint_accepts_department_pk(self, admin_client, stocked_item, store):
        agri = Department.objects.get(code='AGRI')
        response = admin_client.post('/api/inventory/stock-ops/issue/', {
            'item': stocked_item.pk, 'warehouse': store.pk, 'quantity': '3',
            'date': '2026-02-20', 'department': agri.pk,
        }, format='json')
        assert response.status_code == 201, response.data
        assert response.data['department'] == agri.pk
        assert response.data['department_code'] == 'AGRI'
        assert response.data['department_name'] == 'Agriculture'
        assert ChartOfAccount.objects.get(code='5230').current_balance == D('15.00')
        assert_gl_balanced()

    def test_issue_endpoint_without_department(self, admin_client, stocked_item, store):
        response = admin_client.post('/api/inventory/stock-ops/issue/', {
            'item': stocked_item.pk, 'warehouse': store.pk, 'quantity': '3',
            'date': '2026-02-20',
        }, format='json')
        assert response.status_code == 201, response.data
        assert response.data['department'] is None
        assert ChartOfAccount.objects.get(code='5210').current_balance == D('15.00')

    def test_stock_moves_filter_by_department(self, admin_client, stocked_item, store):
        agri = Department.objects.get(code='AGRI')
        issue(stocked_item, store, '2', department=agri)
        issue(stocked_item, store, '2')
        response = admin_client.get(f'/api/inventory/stock-moves/?department={agri.pk}')
        assert response.status_code == 200
        results = response.data['results'] if 'results' in response.data else response.data
        assert len(results) == 1
        assert results[0]['department_code'] == 'AGRI'


class TestDepartmentConsumptionReport:
    URL = '/api/reports/department-consumption/'

    @pytest.fixture(autouse=True)
    def _client(self, admin_client):
        self.client = admin_client

    def _build(self, department=None, start='2026-01-01', end='2026-12-31'):
        params = {'start': start, 'end': end, 'fresh': '1'}
        if department:
            params['department'] = str(department)
        response = self.client.get(self.URL, params)
        assert response.status_code == 200, response.data
        return response.json()

    def test_totals_match_sum_of_issue_costs(self, stocked_item, store):
        agri = Department.objects.get(code='AGRI')
        kitchen = Department.objects.get(code='KITC')
        issue(stocked_item, store, '4', department=agri)
        issue(stocked_item, store, '6', department=agri)
        issue(stocked_item, store, '2', department=kitchen)
        issue(stocked_item, store, '1')  # unassigned

        data = self._build()
        expected = sum(
            (m.total_cost_base for m in StockMove.objects.filter(move_type='issue')), D('0')
        )
        assert D(str(data['total_cost'])) == expected == D('65.00')

        by_code = {r['department_code']: r for r in data['rows']}
        assert D(str(by_code['AGRI']['total_cost'])) == D('50.00')
        assert by_code['AGRI']['issue_count'] == 2
        assert D(str(by_code['KITC']['total_cost'])) == D('10.00')
        unassigned = next(r for r in data['rows'] if r['department_id'] is None)
        assert unassigned['department_name'] == 'Unassigned'
        assert D(str(unassigned['total_cost'])) == D('5.00')

    def test_filter_by_department(self, stocked_item, store):
        agri = Department.objects.get(code='AGRI')
        issue(stocked_item, store, '4', department=agri)
        issue(stocked_item, store, '2', department=Department.objects.get(code='KITC'))
        data = self._build(department=agri.pk)
        assert len(data['rows']) == 1
        assert D(str(data['total_cost'])) == D('20.00')

    def test_period_excludes_out_of_range_issues(self, stocked_item, store):
        issue(stocked_item, store, '4', department=Department.objects.get(code='AGRI'), day=20)
        data = self._build(start='2026-03-01', end='2026-03-31')
        assert data['rows'] == []
        assert D(str(data['total_cost'])) == 0

    def test_by_item_breakdown(self, stocked_item, store):
        agri = Department.objects.get(code='AGRI')
        issue(stocked_item, store, '4', department=agri)
        row = self._build()['by_item'][0]
        assert row['item_code'] == 'PEN-01'
        assert row['department_name'] == 'Agriculture'
        assert D(str(row['quantity'])) == D('4')
        assert D(str(row['total_cost'])) == D('20.00')

    def test_pdf_export_renders(self, stocked_item, store):
        issue(stocked_item, store, '4', department=Department.objects.get(code='AGRI'))
        response = self.client.get('/api/reports/pdf/department-consumption/')
        assert response.status_code == 200
        assert response['Content-Type'] == 'application/pdf'
