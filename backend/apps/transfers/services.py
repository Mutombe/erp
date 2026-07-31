"""Inter-school transfer engine — mirror-posting to the inter-unit accounts.

Every transfer produces TWO balanced journals, one in each school. The sending
school books a "Due from Related Schools" receivable (or "Due to" payable); the
receiving school books the mirror. Each school's books stay internally balanced
and the two inter-unit accounts net to zero when the group consolidates (HQ).
"""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounting.models import SubAccount
from apps.accounting.services import LineSpec, build_and_post_journal
from apps.core.models import DocumentSequence

from .models import InterSchoolTransfer

ZERO = Decimal('0')
GENERAL_POCKET = 'GENERAL'


def _due_lines(school_owes_counterparty, amount):
    """Return the single inter-unit LineSpec that balances a settlement journal.

    `amount` is the (positive) value settled. When this school ends up OWING the
    counterparty it credits 'Due to'; when it is OWED it debits 'Due from'."""
    if school_owes_counterparty:
        return LineSpec(mapping_purpose='interschool_due_to', credit=amount,
                        description='Inter-school settlement (due to related school)')
    return LineSpec(mapping_purpose='interschool_due_from', debit=amount,
                    description='Inter-school settlement (due from related school)')


# --------------------------------------------------------------- fund transfers

def execute_fund_transfer(*, from_bank, to_bank, amount, date, note='', user=None):
    """Move cash between two schools' bank accounts, settled inter-unit."""
    amount = Decimal(amount).quantize(Decimal('0.01'))
    if amount <= 0:
        raise ValidationError('Transfer amount must be positive.')
    from_school, to_school = from_bank.school, to_bank.school
    if from_school.id == to_school.id:
        raise ValidationError('Choose two different schools.')
    if from_bank.currency != to_bank.currency:
        raise ValidationError('Both bank accounts must hold the same currency.')
    currency = from_bank.currency

    with transaction.atomic():
        transfer = InterSchoolTransfer.objects.create(
            number=DocumentSequence.next_for('TRF', from_school),
            kind='funds', from_school=from_school, to_school=to_school,
            date=date, currency=currency, amount=amount, note=note,
            from_bank=from_bank, to_bank=to_bank, created_by=user,
        )
        # Sender: cash out, becomes owed by the other school.
        transfer.from_journal = build_and_post_journal(
            journal_type='transfer', date=date, currency=currency,
            description=f'{transfer.number} — funds to {to_school.name}',
            lines=[
                _due_lines(school_owes_counterparty=False, amount=amount),
                LineSpec(account=from_bank.gl_account, credit=amount, bank_account=from_bank,
                         description=f'{transfer.number} funds out'),
            ],
            reference=transfer.number, user=user, school=from_school,
            source=('transfers.InterSchoolTransfer', transfer.pk, transfer.number),
        )
        # Receiver: cash in, now owes the sender.
        transfer.to_journal = build_and_post_journal(
            journal_type='transfer', date=date, currency=currency,
            description=f'{transfer.number} — funds from {from_school.name}',
            lines=[
                LineSpec(account=to_bank.gl_account, debit=amount, bank_account=to_bank,
                         description=f'{transfer.number} funds in'),
                _due_lines(school_owes_counterparty=True, amount=amount),
            ],
            reference=transfer.number, user=user, school=to_school,
            source=('transfers.InterSchoolTransfer', transfer.pk, transfer.number),
        )
        transfer.status = 'completed'
        transfer.save(update_fields=['from_journal', 'to_journal', 'status'])
    return transfer


# ------------------------------------------------------------ student transfers

def _student_balance_by_currency(student):
    """Net signed pocket balance per currency (positive = the student owes)."""
    by_ccy = {}
    for pocket in SubAccount.objects.filter(student=student, party_type='student'):
        if pocket.current_balance:
            by_ccy[pocket.currency] = by_ccy.get(pocket.currency, ZERO) + pocket.current_balance
    return {c: b for c, b in by_ccy.items() if b != ZERO}


def _clear_source_pockets(student, currency, school):
    """LineSpecs that zero every one of the student's pockets in `currency`.
    Returns (lines, net) where net>0 means the student owed the school."""
    lines, net = [], ZERO
    for pocket in SubAccount.objects.filter(student=student, party_type='student', currency=currency):
        bal = pocket.current_balance
        if bal == ZERO:
            continue
        net += bal
        if bal > 0:  # debit-normal pocket in credit → zero it
            lines.append(LineSpec(mapping_purpose='ar_control', sub_account=pocket, credit=bal,
                                  description=f'Transfer out — clear {pocket.category}'))
        else:
            lines.append(LineSpec(mapping_purpose='ar_control', sub_account=pocket, debit=-bal,
                                  description=f'Transfer out — clear {pocket.category}'))
    return lines, net


def _copy_guardians(from_student, to_student, to_school):
    from apps.students.models import Guardian, StudentGuardian

    for sg in StudentGuardian.objects.filter(student=from_student).select_related('guardian'):
        src = sg.guardian
        guardian, _ = Guardian.objects.get_or_create(
            school=to_school, code=src.code,
            defaults={
                'first_name': src.first_name, 'last_name': src.last_name,
                'phone': src.phone, 'email': src.email, 'address': src.address,
                'national_id': src.national_id, 'employer': src.employer,
            },
        )
        StudentGuardian.objects.get_or_create(
            student=to_student, guardian=guardian,
            defaults={
                'relationship': sg.relationship,
                'is_primary_contact': sg.is_primary_contact,
                'is_billing_contact': sg.is_billing_contact,
            },
        )


def execute_student_transfer(*, from_student, to_class, date, note='', user=None):
    """Transfer a pupil to another school: open a fresh Student in the
    destination, carry the net fee balance across via inter-unit settlement, and
    retire the source record. Historical invoices/receipts stay in the source
    school (its books are immutable)."""
    from apps.students.models import Enrollment, Student

    from_school = from_student.school
    to_school = to_class.school
    if from_school.id == to_school.id:
        raise ValidationError('The destination must be a different school.')
    if from_student.status in ('transferred', 'withdrawn', 'graduated'):
        raise ValidationError(f'{from_student.full_name} is {from_student.status} and cannot be transferred.')

    balances = _student_balance_by_currency(from_student)

    with transaction.atomic():
        # 1. Open the destination student record.
        to_student = Student.objects.create(
            school=to_school,
            code=DocumentSequence.next_for('STU', to_school),
            first_name=from_student.first_name, last_name=from_student.last_name,
            dob=from_student.dob, gender=from_student.gender,
            national_id_or_birth_cert=from_student.national_id_or_birth_cert,
            admission_date=date, status='enrolled',
            attendance_type=from_student.attendance_type,
            medical_notes=from_student.medical_notes,
        )
        Enrollment.objects.create(
            student=to_student, academic_year=to_class.academic_year,
            class_room=to_class, enrolled_date=date, attendance_type=to_student.attendance_type,
        )
        _copy_guardians(from_student, to_student, to_school)

        transfer = InterSchoolTransfer.objects.create(
            number=DocumentSequence.next_for('TRF', from_school),
            kind='student', from_school=from_school, to_school=to_school,
            date=date, currency=(next(iter(balances)) if len(balances) == 1 else ''),
            amount=(next(iter(balances.values())) if len(balances) == 1 else ZERO),
            note=note, from_student=from_student, to_student=to_student, created_by=user,
        )

        # 2. Settle each currency the pupil carries a balance in.
        first_from_j = first_to_j = None
        for currency, _net in balances.items():
            clear_lines, net = _clear_source_pockets(from_student, currency, from_school)
            if net == ZERO:
                continue
            owes = net > 0  # student owed the source school
            amount = abs(net)

            # Source school: clear pockets, book the inter-unit leg.
            from_j = build_and_post_journal(
                journal_type='transfer', date=date, currency=currency,
                description=f'{transfer.number} — {from_student.full_name} balance to {to_school.name}',
                lines=clear_lines + [_due_lines(school_owes_counterparty=not owes, amount=amount)],
                reference=transfer.number, user=user, school=from_school,
                source=('transfers.InterSchoolTransfer', transfer.pk, transfer.number),
            )

            # Destination school: open the balance on a GENERAL pocket, mirror leg.
            new_pocket = SubAccount.for_student(to_student, GENERAL_POCKET, currency, school=to_school)
            if owes:
                pocket_line = LineSpec(mapping_purpose='ar_control', sub_account=new_pocket, debit=amount,
                                       description=f'{transfer.number} opening balance carried in')
            else:
                pocket_line = LineSpec(mapping_purpose='ar_control', sub_account=new_pocket, credit=amount,
                                       description=f'{transfer.number} prepayment carried in')
            to_j = build_and_post_journal(
                journal_type='transfer', date=date, currency=currency,
                description=f'{transfer.number} — {to_student.full_name} balance from {from_school.name}',
                lines=[pocket_line, _due_lines(school_owes_counterparty=owes, amount=amount)],
                reference=transfer.number, user=user, school=to_school,
                source=('transfers.InterSchoolTransfer', transfer.pk, transfer.number),
            )
            first_from_j = first_from_j or from_j
            first_to_j = first_to_j or to_j

        # 3. Retire the source record.
        from_student.status = 'transferred'
        from_student.save(update_fields=['status'])
        Enrollment.objects.filter(student=from_student, status='active').update(status='transferred')

        transfer.from_journal = first_from_j
        transfer.to_journal = first_to_j
        transfer.status = 'completed'
        transfer.save(update_fields=['from_journal', 'to_journal', 'status'])
    return transfer
