from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.accounting.models import (
    ChartOfAccount,
    FiscalPeriod,
    GeneralLedger,
    Journal,
    JournalLine,
)
from apps.accounting.services import LineSpec, build_and_post_journal
from apps.core.models import AuditTrail
from conftest import assert_gl_balanced

pytestmark = pytest.mark.django_db

D = Decimal


def simple_journal(debit_code='5100', credit_code='1010', amount='100.00', when=date(2026, 3, 10)):
    return build_and_post_journal(
        journal_type='general',
        date=when,
        currency='USD',
        description='test journal',
        lines=[
            LineSpec(account=ChartOfAccount.objects.get(code=debit_code), debit=D(amount)),
            LineSpec(account=ChartOfAccount.objects.get(code=credit_code), credit=D(amount)),
        ],
    )


class TestPosting:
    def test_posted_journal_balances_and_updates_running_balances(self, seeded_db):
        journal = simple_journal()
        assert journal.status == 'posted'
        assert_gl_balanced()
        assert ChartOfAccount.objects.get(code='5100').current_balance == D('100.00')
        assert ChartOfAccount.objects.get(code='1010').current_balance == D('-100.00')

    def test_unbalanced_journal_refuses_to_post_and_leaves_no_gl(self, seeded_db):
        with pytest.raises(ValidationError):
            build_and_post_journal(
                journal_type='general',
                date=date(2026, 3, 10),
                currency='USD',
                description='unbalanced',
                lines=[
                    LineSpec(account=ChartOfAccount.objects.get(code='5100'), debit=D('100')),
                    LineSpec(account=ChartOfAccount.objects.get(code='1010'), credit=D('90')),
                ],
            )
        assert GeneralLedger.objects.count() == 0
        assert ChartOfAccount.objects.get(code='5100').current_balance == 0

    def test_double_post_is_refused(self, seeded_db):
        journal = simple_journal()
        with pytest.raises(ValidationError):
            journal.post()

    def test_period_lock_blocks_posting(self, seeded_db):
        period = FiscalPeriod.objects.get(fiscal_year__name='FY2026', period_no=3)
        period.is_locked = True
        period.save()
        with pytest.raises(ValidationError):
            simple_journal(when=date(2026, 3, 15))

    def test_no_fiscal_period_blocks_posting(self, seeded_db):
        with pytest.raises(ValidationError):
            simple_journal(when=date(2031, 1, 15))

    def test_multicurrency_journal_stores_base_amounts(self, seeded_db):
        journal = build_and_post_journal(
            journal_type='general',
            date=date(2026, 3, 10),
            currency='ZWG',
            description='zwg journal',
            lines=[
                LineSpec(account=ChartOfAccount.objects.get(code='5100'), debit=D('1000')),
                LineSpec(account=ChartOfAccount.objects.get(code='1020'), credit=D('1000')),
            ],
        )
        line = journal.lines.get(debit_amount=D('1000'))
        assert line.debit_base == (D('1000') * D('0.037175')).quantize(D('0.01'))
        assert_gl_balanced()


class TestReversal:
    def test_reversal_restores_balances_and_adds_gl_rows(self, seeded_db):
        journal = simple_journal()
        rows_before = GeneralLedger.objects.count()
        reversal = journal.reverse(reason='mistake')
        journal.refresh_from_db()
        assert journal.status == 'reversed'
        assert journal.reversed_by == reversal
        assert reversal.journal_type == 'reversal'
        assert ChartOfAccount.objects.get(code='5100').current_balance == 0
        assert ChartOfAccount.objects.get(code='1010').current_balance == 0
        assert GeneralLedger.objects.count() == rows_before * 2  # rows added, never removed
        assert_gl_balanced()

    def test_only_posted_journals_reverse(self, seeded_db):
        journal = simple_journal()
        journal.reverse(reason='x')
        journal.refresh_from_db()
        with pytest.raises(ValidationError):
            journal.reverse(reason='again')


class TestImmutability:
    def test_gl_rows_cannot_be_updated_or_deleted(self, seeded_db):
        simple_journal()
        entry = GeneralLedger.objects.first()
        entry.debit_amount = D('999')
        with pytest.raises(ValidationError):
            entry.save()
        with pytest.raises(ValidationError):
            entry.delete()

    def test_audit_trail_is_immutable(self, seeded_db):
        journal = simple_journal()
        entry = AuditTrail.objects.filter(model_name='Journal', record_id=str(journal.pk)).first()
        assert entry is not None
        entry.action = 'update'
        with pytest.raises(ValueError):
            entry.save()
        with pytest.raises(ValueError):
            entry.delete()

    def test_lines_cannot_be_added_to_posted_journal(self, seeded_db):
        journal = simple_journal()
        with pytest.raises(ValidationError):
            JournalLine.objects.create(
                journal=journal,
                account=ChartOfAccount.objects.get(code='5100'),
                debit_amount=D('5'),
            )


class TestChartOfAccounts:
    def test_code_ranges_enforced(self, seeded_db):
        with pytest.raises(ValidationError):
            ChartOfAccount.objects.create(code='4100', name='Bad', account_type='expense',
                                          report_group='operating_expenses')

    def test_type_derived_from_code(self, seeded_db):
        account = ChartOfAccount.objects.create(code='5150', name='Gardening', report_group='operating_expenses')
        assert account.account_type == 'expense'
        assert account.normal_balance == 'debit'

    def test_system_accounts_cannot_be_deleted(self, seeded_db):
        with pytest.raises(ValidationError):
            ChartOfAccount.objects.get(code='3900').delete()
