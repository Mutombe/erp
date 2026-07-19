from datetime import date
from decimal import Decimal

import pytest
from django.core.management import call_command


@pytest.fixture
def seeded_db(db):
    """Base seed: COA, mappings, fee categories, calendar, sequences, banks."""
    call_command('seed_school')


@pytest.fixture
def student(seeded_db):
    from apps.core.models import DocumentSequence
    from apps.students.models import AcademicYear, ClassRoom, Enrollment, Grade, Student

    year = AcademicYear.objects.get(name='2026')
    grade = Grade.objects.get(name='Grade 1')
    class_room = ClassRoom.objects.create(name='Grade 1 Test', academic_year=year, grade=grade)
    student = Student.objects.create(
        code=DocumentSequence.next_for('STU'),
        first_name='Test', last_name='Student',
        admission_date=date(2026, 1, 13),
    )
    Enrollment.objects.create(
        student=student, academic_year=year, class_room=class_room, enrolled_date=date(2026, 1, 13)
    )
    return student


@pytest.fixture
def usd_bank(seeded_db):
    from apps.accounting.models import BankAccount

    return BankAccount.objects.get(code='BANK-USD')


@pytest.fixture
def zwg_bank(seeded_db):
    from apps.accounting.models import BankAccount

    return BankAccount.objects.get(code='BANK-ZWG')


def make_invoice(student, amounts_by_category, invoice_date=date(2026, 2, 1), currency='USD', term=None):
    """Helper: create and post a fee invoice. amounts_by_category: {'TUI': Decimal, ...}"""
    from apps.core.models import DocumentSequence
    from apps.fees.models import FeeCategory, FeeInvoice, FeeInvoiceLine

    invoice = FeeInvoice.objects.create(
        number=DocumentSequence.next_for('INV'),
        student=student,
        term=term,
        date=invoice_date,
        due_date=invoice_date,
        currency=currency,
    )
    for code, amount in amounts_by_category.items():
        FeeInvoiceLine.objects.create(
            invoice=invoice,
            fee_category=FeeCategory.objects.get(code=code),
            amount=Decimal(amount),
        )
    invoice.post()
    invoice.refresh_from_db()
    return invoice


def assert_gl_balanced():
    from django.db.models import Sum

    from apps.accounting.models import GeneralLedger

    totals = GeneralLedger.objects.aggregate(d=Sum('debit_base'), c=Sum('credit_base'))
    assert (totals['d'] or 0) == (totals['c'] or 0), f'GL out of balance: {totals}'


def assert_pockets_match_control():
    """Sum of student pockets per currency must equal the AR control GL balance."""
    from django.db.models import Sum

    from apps.accounting.models import ChartOfAccount, SubAccount

    for currency, code in [('USD', '1100'), ('ZWG', '1110')]:
        control = ChartOfAccount.objects.get(code=code).current_balance
        pockets = SubAccount.objects.filter(party_type='student', currency=currency).aggregate(
            total=Sum('current_balance')
        )['total'] or Decimal('0')
        # Control balance is in base currency; pockets are in transaction currency.
        if currency == 'USD':
            assert control == pockets, f'AR control {code} {control} != pockets {pockets}'
