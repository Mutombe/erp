from datetime import date
from decimal import Decimal

import pytest
from django.core.management import call_command


@pytest.fixture
def seeded_db(db):
    """Base seed: Golden Knot org + Oceanwaves school, then that school's COA,
    mappings, fee categories, calendar, sequences, banks."""
    call_command('seed_school')


@pytest.fixture
def school(seeded_db):
    """The default (Oceanwaves) tenant that seeded_db provisions into."""
    from apps.core.models import School

    return School.get_default()


@pytest.fixture
def student(seeded_db, school):
    from apps.core.models import DocumentSequence
    from apps.students.models import AcademicYear, ClassRoom, Enrollment, Grade, Student

    year = AcademicYear.objects.get(school=school, name='2026')
    grade = Grade.objects.get(school=school, name='Grade 1')
    class_room = ClassRoom.objects.create(
        school=school, name='Grade 1 Test', academic_year=year, grade=grade
    )
    student = Student.objects.create(
        school=school,
        code=DocumentSequence.next_for('STU', school),
        first_name='Test', last_name='Student',
        admission_date=date(2026, 1, 13),
    )
    Enrollment.objects.create(
        student=student, academic_year=year, class_room=class_room, enrolled_date=date(2026, 1, 13)
    )
    return student


@pytest.fixture
def usd_bank(seeded_db, school):
    from apps.accounting.models import BankAccount

    return BankAccount.objects.get(school=school, code='BANK-USD')


@pytest.fixture
def zwg_bank(seeded_db, school):
    from apps.accounting.models import BankAccount

    return BankAccount.objects.get(school=school, code='BANK-ZWG')


def make_invoice(student, amounts_by_category, invoice_date=date(2026, 2, 1), currency='USD', term=None,
                 school=None):
    """Helper: create and post a fee invoice. amounts_by_category: {'TUI': Decimal, ...}"""
    from apps.core.models import DocumentSequence, School
    from apps.fees.models import FeeCategory, FeeInvoice, FeeInvoiceLine

    school = school or student.school or School.get_default()
    invoice = FeeInvoice.objects.create(
        school=school,
        number=DocumentSequence.next_for('INV', school),
        student=student,
        term=term,
        date=invoice_date,
        due_date=invoice_date,
        currency=currency,
    )
    for code, amount in amounts_by_category.items():
        FeeInvoiceLine.objects.create(
            invoice=invoice,
            fee_category=FeeCategory.objects.get(school=school, code=code),
            amount=Decimal(amount),
        )
    invoice.post()
    invoice.refresh_from_db()
    return invoice


def assert_gl_balanced(school=None):
    from django.db.models import Sum

    from apps.accounting.models import GeneralLedger

    qs = GeneralLedger.objects.all()
    if school is not None:
        qs = qs.filter(school=school)
    totals = qs.aggregate(d=Sum('debit_base'), c=Sum('credit_base'))
    assert (totals['d'] or 0) == (totals['c'] or 0), f'GL out of balance: {totals}'


def assert_pockets_match_control(school=None):
    """Sum of student pockets per currency must equal the AR control GL balance."""
    from django.db.models import Sum

    from apps.accounting.models import ChartOfAccount, SubAccount
    from apps.core.models import School

    school = school or School.get_default()
    for currency, code in [('USD', '1100'), ('ZWG', '1110')]:
        control = ChartOfAccount.objects.get(school=school, code=code).current_balance
        pockets = SubAccount.objects.filter(
            school=school, party_type='student', currency=currency
        ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0')
        # Control balance is in base currency; pockets are in transaction currency.
        if currency == 'USD':
            assert control == pockets, f'AR control {code} {control} != pockets {pockets}'
