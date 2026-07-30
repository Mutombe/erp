"""Multi-tenant isolation for the fees domain: two schools bill, receipt and
carry sub-ledger balances entirely independently, and cross-school document
assembly is refused."""
from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.accounting.models import BankAccount, GeneralLedger, SubAccount
from apps.core.models import DocumentSequence, Organization, School
from apps.fees.models import FeeInvoice, Receipt
from apps.fees.services import create_receipt
from conftest import make_invoice

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def two_schools(seeded_db):
    """Oceanwaves (from seed) plus a second provisioned school, Kingsknot."""
    from apps.core.provisioning import provision_school

    ocw = School.get_default()
    kns = School.objects.create(
        organization=Organization.get(), code='KNS', slug='kingsknot',
        name='Kingsknot Academy', base_currency='USD', secondary_currency='ZWG',
    )
    provision_school(kns)
    return ocw, kns


def _make_student(school, code_suffix='0001'):
    from apps.students.models import AcademicYear, ClassRoom, Enrollment, Grade, Student

    year = AcademicYear.objects.get(school=school, name='2026')
    grade = Grade.objects.get(school=school, name='Grade 1')
    room = ClassRoom.objects.create(
        school=school, name=f'{school.code} Grade 1', academic_year=year, grade=grade
    )
    student = Student.objects.create(
        school=school, code=DocumentSequence.next_for('STU', school),
        first_name='Tapiwa', last_name=school.code, admission_date=date(2026, 1, 13),
    )
    Enrollment.objects.create(
        student=student, academic_year=year, class_room=room, enrolled_date=date(2026, 1, 13)
    )
    return student


def test_invoice_numbering_restarts_per_school(two_schools):
    ocw, kns = two_schools
    ocw_student = _make_student(ocw)
    kns_student = _make_student(kns)

    ocw_inv = make_invoice(ocw_student, {'TUI': '250'}, school=ocw)
    kns_inv = make_invoice(kns_student, {'TUI': '300'}, school=kns)

    # Each school's INV sequence starts fresh at 00001.
    assert ocw_inv.number == 'INV00001'
    assert kns_inv.number == 'INV00001'
    assert ocw_inv.school_id == ocw.id
    assert kns_inv.school_id == kns.id
    # Same number, different tenants — no collision.
    assert FeeInvoice.objects.filter(school=ocw, number='INV00001').count() == 1
    assert FeeInvoice.objects.filter(school=kns, number='INV00001').count() == 1


def test_receipts_and_pockets_isolated(two_schools):
    ocw, kns = two_schools
    kns_student = _make_student(kns)
    make_invoice(kns_student, {'TUI': '300'}, school=kns)

    kns_bank = BankAccount.objects.get(school=kns, code='BANK-USD')
    receipt = create_receipt(student=kns_student, bank_account=kns_bank, amount=D('300'),
                             date=date(2026, 3, 1))
    assert receipt.number == 'RCT00001'
    assert receipt.school_id == kns.id

    # Oceanwaves has no receipts and no KNS student pockets.
    assert Receipt.objects.filter(school=ocw).count() == 0
    assert SubAccount.objects.filter(school=ocw, student=kns_student).count() == 0
    # KNS GL is self-contained: no row references a non-KNS account.
    assert GeneralLedger.objects.filter(school=kns).exclude(account__school=kns).count() == 0


def test_cross_school_receipt_is_rejected(two_schools):
    ocw, kns = two_schools
    kns_student = _make_student(kns)
    make_invoice(kns_student, {'TUI': '300'}, school=kns)
    # Paying a KNS student into an Oceanwaves bank must refuse.
    ocw_bank = BankAccount.objects.get(school=ocw, code='BANK-USD')
    with pytest.raises(ValidationError):
        create_receipt(student=kns_student, bank_account=ocw_bank, amount=D('100'),
                       date=date(2026, 3, 1))


def test_cross_school_invoice_posting_is_rejected(two_schools):
    ocw, kns = two_schools
    kns_student = _make_student(kns)
    # An invoice stamped for Oceanwaves but pointing at a KNS student must refuse.
    invoice = FeeInvoice.objects.create(
        school=ocw, number=DocumentSequence.next_for('INV', ocw),
        student=kns_student, date=date(2026, 2, 1), due_date=date(2026, 2, 1), currency='USD',
    )
    from apps.fees.models import FeeCategory, FeeInvoiceLine
    FeeInvoiceLine.objects.create(
        invoice=invoice, fee_category=FeeCategory.objects.get(school=ocw, code='TUI'), amount=D('100'),
    )
    with pytest.raises(ValidationError):
        invoice.post()


def test_billing_run_isolated_per_school(two_schools):
    ocw, kns = two_schools
    kns_student = _make_student(kns)

    from apps.fees.models import BillingRun, FeeCategory, FeeStructure
    from apps.fees.services import execute_billing_run
    from apps.students.models import Term

    term = Term.objects.get(school=kns, academic_year__name='2026', number=1)
    FeeStructure.objects.create(
        school=kns, academic_year=term.academic_year, term=term,
        grade=kns_student.current_enrollment.class_room.grade,
        fee_category=FeeCategory.objects.get(school=kns, code='TUI'),
        amount=D('300'), currency='USD',
    )
    run = BillingRun.objects.create(
        school=kns, number=DocumentSequence.next_for('RUN', kns), term=term,
        currency='USD', date=date(2026, 1, 15), due_date=date(2026, 2, 15),
    )
    execute_billing_run(run.pk)
    run.refresh_from_db()
    assert run.status == 'completed'
    assert run.invoices_created == 1
    # Every invoice the run produced belongs to KNS; Oceanwaves saw nothing.
    assert FeeInvoice.objects.filter(billing_run=run).count() == 1
    assert FeeInvoice.objects.filter(billing_run=run).first().school_id == kns.id
    assert FeeInvoice.objects.filter(school=ocw).count() == 0
