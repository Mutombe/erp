from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.accounting.models import ChartOfAccount, ExchangeRate, SubAccount
from apps.fees.models import FeeInvoice
from apps.fees.services import create_receipt, reverse_receipt
from conftest import assert_gl_balanced, assert_pockets_match_control, make_invoice

pytestmark = pytest.mark.django_db

D = Decimal


class TestInvoicePosting:
    def test_invoice_posts_ar_and_income(self, student):
        invoice = make_invoice(student, {'TUI': '250', 'LVY': '50'})
        assert invoice.status == 'posted'
        assert invoice.total == D('300.00')
        assert ChartOfAccount.objects.get(code='1100').current_balance == D('300.00')  # AR
        assert ChartOfAccount.objects.get(code='4000').current_balance == D('250.00')  # Tuition
        assert ChartOfAccount.objects.get(code='4020').current_balance == D('50.00')  # Levy
        tui_pocket = SubAccount.objects.get(student=student, category='TUI', currency='USD')
        assert tui_pocket.current_balance == D('250.00')
        assert_gl_balanced()
        assert_pockets_match_control()

    def test_invoice_post_is_idempotent(self, student):
        invoice = make_invoice(student, {'TUI': '100'})
        journal = invoice.journal
        assert invoice.post() == journal  # second call returns same journal

    def test_bursary_discount_posts_gross_income_with_contra(self, student):
        from apps.core.models import DocumentSequence
        from apps.fees.models import FeeCategory, FeeInvoice, FeeInvoiceLine

        invoice = FeeInvoice.objects.create(
            number=DocumentSequence.next_for('INV'),
            student=student, date=date(2026, 2, 1), due_date=date(2026, 2, 28), currency='USD',
        )
        FeeInvoiceLine.objects.create(
            invoice=invoice, fee_category=FeeCategory.objects.get(code='TUI'),
            amount=D('200'), discount_amount=D('50'),
        )
        invoice.post()
        invoice.refresh_from_db()
        assert invoice.total == D('150.00')
        assert ChartOfAccount.objects.get(code='1100').current_balance == D('150.00')  # net AR
        assert ChartOfAccount.objects.get(code='4000').current_balance == D('200.00')  # gross income
        assert ChartOfAccount.objects.get(code='4950').current_balance == D('-50.00')  # contra income
        assert_gl_balanced()


class TestReceiptsAndAllocation:
    def test_fifo_allocation_oldest_due_first(self, student, usd_bank):
        older = make_invoice(student, {'TUI': '100'}, invoice_date=date(2026, 1, 20))
        newer = make_invoice(student, {'TUI': '200'}, invoice_date=date(2026, 2, 20))
        receipt = create_receipt(
            student=student, bank_account=usd_bank, amount=D('150'), date=date(2026, 3, 1)
        )
        older.refresh_from_db()
        newer.refresh_from_db()
        assert older.status == 'paid'
        assert older.balance == 0
        assert newer.status == 'partial'
        assert newer.balance == D('150.00')
        assert receipt.unallocated_amount == 0
        assert usd_bank.gl_account.__class__.objects.get(pk=usd_bank.gl_account_id).current_balance == D('150.00')
        assert_gl_balanced()
        assert_pockets_match_control()

    def test_overpayment_becomes_prepayment_credit(self, student, usd_bank):
        invoice = make_invoice(student, {'TUI': '100'})
        receipt = create_receipt(
            student=student, bank_account=usd_bank, amount=D('130'), date=date(2026, 3, 1)
        )
        invoice.refresh_from_db()
        assert invoice.status == 'paid'
        assert receipt.unallocated_amount == D('30.00')
        general = SubAccount.objects.get(student=student, category='GENERAL', currency='USD')
        assert general.current_balance == D('-30.00')  # credit balance = school owes student
        # AR control nets to -30 (prepayment)
        assert ChartOfAccount.objects.get(code='1100').current_balance == D('-30.00')
        assert_gl_balanced()

    def test_explicit_allocation_validates_balance(self, student, usd_bank):
        invoice = make_invoice(student, {'TUI': '100'})
        with pytest.raises(ValidationError):
            create_receipt(
                student=student, bank_account=usd_bank, amount=D('500'), date=date(2026, 3, 1),
                explicit_allocations=[(invoice.pk, D('200'))],  # exceeds invoice balance
            )

    def test_receipt_reversal_restores_everything(self, student, usd_bank):
        invoice = make_invoice(student, {'TUI': '100', 'LVY': '20'})
        receipt = create_receipt(
            student=student, bank_account=usd_bank, amount=D('120'), date=date(2026, 3, 1)
        )
        invoice.refresh_from_db()
        assert invoice.status == 'paid'
        reverse_receipt(receipt)
        invoice.refresh_from_db()
        receipt.refresh_from_db()
        assert receipt.status == 'reversed'
        assert invoice.status == 'posted'
        assert invoice.amount_paid == 0
        assert invoice.lines.filter(allocated_amount__gt=0).count() == 0
        assert ChartOfAccount.objects.get(code='1100').current_balance == D('120.00')  # AR restored
        assert_gl_balanced()
        assert_pockets_match_control()

    def test_cross_rate_settlement_posts_realized_fx(self, student, zwg_bank):
        # Invoice in ZWG at seed rate, then devalue before payment.
        invoice = make_invoice(student, {'TUI': '1000'}, invoice_date=date(2026, 2, 1), currency='ZWG')
        ExchangeRate.objects.create(
            from_currency='ZWG', to_currency='USD', rate=D('0.030000'), effective_date=date(2026, 3, 1)
        )
        create_receipt(student=student, bank_account=zwg_bank, amount=D('1000'), date=date(2026, 3, 5))
        invoice.refresh_from_db()
        assert invoice.status == 'paid'
        # Booked at 0.037175 => 37.18 base; settled at 0.03 => 30.00 base; loss 7.18
        fx_loss = ChartOfAccount.objects.get(code='5900')
        assert fx_loss.current_balance == D('7.18')
        # AR control base balance must return to zero for this student
        assert ChartOfAccount.objects.get(code='1110').current_balance == D('0.00')
        assert_gl_balanced()


class TestBillingRun:
    def test_billing_run_is_idempotent(self, student):
        from apps.core.models import DocumentSequence
        from apps.fees.models import BillingRun, FeeCategory, FeeStructure
        from apps.fees.services import execute_billing_run
        from apps.students.models import Term

        term = Term.objects.get(academic_year__name='2026', number=1)
        grade = student.current_enrollment.class_room.grade
        FeeStructure.objects.create(
            academic_year=term.academic_year, term=term, grade=grade,
            fee_category=FeeCategory.objects.get(code='TUI'),
            amount=D('300'), currency='USD',
        )
        run = BillingRun.objects.create(
            number=DocumentSequence.next_for('RUN'), term=term, currency='USD',
            date=date(2026, 1, 15), due_date=date(2026, 2, 15),
        )
        execute_billing_run(run.pk)
        run.refresh_from_db()
        assert run.status == 'completed'
        assert run.invoices_created == 1
        count_after_first = FeeInvoice.objects.count()

        # Re-execute: no duplicates
        run.status = 'draft'
        run.save()
        execute_billing_run(run.pk)
        assert FeeInvoice.objects.count() == count_after_first
        assert_gl_balanced()
        assert_pockets_match_control()
