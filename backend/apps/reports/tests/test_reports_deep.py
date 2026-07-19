from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounting.models import BankAccount
from apps.core.models import User
from apps.fees.services import create_receipt
from conftest import make_invoice

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def client(seeded_db):
    api = APIClient()
    api.force_authenticate(User.objects.create_user('bursar@test.local', 'x', role='bursar'))
    return api


class TestAgedAsOf:
    def test_backdated_aging_ignores_later_payments(self, client, student, usd_bank):
        """An invoice paid in March must still appear outstanding on a Feb-dated report."""
        invoice = make_invoice(student, {'TUI': '100'}, invoice_date=date(2026, 1, 20))
        create_receipt(student=student, bank_account=usd_bank, amount=D('100'), date=date(2026, 3, 10))
        invoice.refresh_from_db()
        assert invoice.status == 'paid'

        feb = client.get('/api/reports/aged-receivables/', {'as_of_date': '2026-02-28', 'fresh': '1'}).json()
        assert D(str(feb['grand_total'])) == D('100')

        apr = client.get('/api/reports/aged-receivables/', {'as_of_date': '2026-04-30', 'fresh': '1'}).json()
        assert D(str(apr['grand_total'])) == D('0')

    def test_bucket_boundaries(self, client, student):
        # Due 2026-01-31; as at 2026-03-02 → 30 days overdue → 0-30 bucket edge
        from apps.core.models import DocumentSequence
        from apps.fees.models import FeeCategory, FeeInvoice, FeeInvoiceLine

        invoice = FeeInvoice.objects.create(
            number=DocumentSequence.next_for('INV'), student=student,
            date=date(2026, 1, 15), due_date=date(2026, 1, 31), currency='USD',
        )
        FeeInvoiceLine.objects.create(
            invoice=invoice, fee_category=FeeCategory.objects.get(code='TUI'), amount=D('50')
        )
        invoice.post()
        data = client.get('/api/reports/aged-receivables/', {'as_of_date': '2026-03-02', 'fresh': '1'}).json()
        row = data['rows'][0]
        assert D(str(row['buckets'][0])) == D('50')  # day 30 → first bucket
        data = client.get('/api/reports/aged-receivables/', {'as_of_date': '2026-03-03', 'fresh': '1'}).json()
        assert D(str(data['rows'][0]['buckets'][1])) == D('50')  # day 31 → second bucket


class TestTrialBalanceMovements:
    def test_movement_columns_reconcile(self, client, student, usd_bank):
        make_invoice(student, {'TUI': '200'}, invoice_date=date(2026, 1, 20))
        create_receipt(student=student, bank_account=usd_bank, amount=D('80'), date=date(2026, 2, 10))
        data = client.get('/api/reports/trial-balance/', {
            'start': '2026-02-01', 'end': '2026-02-28', 'fresh': '1',
        }).json()
        assert data['mode'] == 'movements'
        ar = next(r for r in data['rows'] if r['code'] == '1100')
        assert D(str(ar['opening'])) == D('200')
        assert D(str(ar['credit'])) == D('80')
        assert D(str(ar['closing'])) == D('120')
        assert data['balanced'] is True


class TestComparatives:
    def test_income_statement_prior_period(self, client, student):
        make_invoice(student, {'TUI': '100'}, invoice_date=date(2026, 1, 15))
        make_invoice(student, {'TUI': '300'}, invoice_date=date(2026, 2, 15))
        data = client.get('/api/reports/income-statement/', {
            'start': '2026-02-01', 'end': '2026-02-28', 'compare': 'prior_period', 'fresh': '1',
        }).json()
        assert D(str(data['total_income'])) == D('300')
        assert D(str(data['prev_total_income'])) == D('100')

    def test_balance_sheet_comparative(self, client, student):
        make_invoice(student, {'TUI': '100'}, invoice_date=date(2026, 1, 15))
        make_invoice(student, {'TUI': '50'}, invoice_date=date(2026, 3, 15))
        data = client.get('/api/reports/balance-sheet/', {
            'as_of_date': '2026-03-31', 'compare_date': '2026-01-31', 'fresh': '1',
        }).json()
        assert D(str(data['total_assets'])) == D('150')
        assert D(str(data['prev_total_assets'])) == D('100')

    def test_income_statement_monthly(self, client, student):
        make_invoice(student, {'TUI': '100'}, invoice_date=date(2026, 1, 15))
        make_invoice(student, {'TUI': '300'}, invoice_date=date(2026, 2, 15))
        data = client.get('/api/reports/income-statement/', {
            'start': '2026-01-01', 'end': '2026-03-31', 'monthly': '1', 'fresh': '1',
        }).json()
        assert data['mode'] == 'monthly'
        tuition = next(r for r in data['income_rows'] if r['code'] == '4000')
        assert D(str(tuition['months']['2026-01'])) == D('100')
        assert D(str(tuition['months']['2026-02'])) == D('300')


class TestCashFlow:
    def test_direct_cash_flow_reconciles_to_bank(self, client, student, usd_bank):
        make_invoice(student, {'TUI': '500'}, invoice_date=date(2026, 1, 20))
        create_receipt(student=student, bank_account=usd_bank, amount=D('500'), date=date(2026, 2, 10))
        data = client.get('/api/reports/cash-flow/', {
            'start': '2026-01-01', 'end': '2026-12-31', 'fresh': '1',
        }).json()
        assert D(str(data['opening_cash'])) == D('0')
        receipts = next(r for r in data['rows'] if r['journal_type'] == 'receipts')
        assert D(str(receipts['inflow'])) == D('500')
        assert D(str(data['closing_cash'])) == D('500')
