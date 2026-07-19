"""Fee billing services: receipt creation with FIFO allocation, billing runs."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.accounting.models import ExchangeRate, SubAccount
from apps.accounting.services import LineSpec, base_currency, build_and_post_journal
from apps.core.models import DocumentSequence

from .models import (
    BillingRun,
    BursaryAward,
    FeeInvoice,
    FeeInvoiceLine,
    FeeStructure,
    Receipt,
    ReceiptAllocation,
)

TWO = Decimal('0.01')
ZERO = Decimal('0')

GENERAL_POCKET = 'GENERAL'  # prepayment/on-account pocket


# ---------------------------------------------------------------- receipts

def create_receipt(
    *,
    student,
    bank_account,
    amount,
    date,
    payment_method='cash',
    payer_guardian=None,
    reference='',
    notes='',
    explicit_allocations=None,  # [(invoice_id, amount)] or None for auto-FIFO
    user=None,
):
    """Create, allocate and post a receipt in one atomic action.

    Dr Bank / Cr AR control. Pocket credits go to the invoice lines' fee
    categories (in pocket order); any residue is credited to the student's
    GENERAL pocket as prepayment. Realized FX differences on cross-rate
    settlement post to the FX gain/loss mappings (base-currency-only lines).
    """
    amount = Decimal(amount).quantize(TWO)
    if amount <= 0:
        raise ValidationError('Receipt amount must be positive.')
    currency = bank_account.currency
    receipt_rate = ExchangeRate.get_rate(currency, base_currency(), date)

    with transaction.atomic():
        receipt = Receipt.objects.create(
            number=DocumentSequence.next_for('RCT'),
            student=student,
            payer_guardian=payer_guardian,
            date=date,
            bank_account=bank_account,
            currency=currency,
            exchange_rate=receipt_rate,
            amount=amount,
            payment_method=payment_method,
            reference=reference,
            notes=notes,
            created_by=user,
        )

        # --- decide invoice allocations ---
        open_invoices = (
            FeeInvoice.objects.select_for_update()
            .filter(student=student, currency=currency, status__in=['posted', 'partial'])
            .order_by('due_date', 'date', 'id')
        )
        remaining = amount
        planned = []  # (invoice, alloc_amount)
        if explicit_allocations:
            by_id = {inv.pk: inv for inv in open_invoices}
            for invoice_id, alloc_amount in explicit_allocations:
                invoice = by_id.get(int(invoice_id))
                if invoice is None:
                    raise ValidationError(f'Invoice {invoice_id} is not open for this student in {currency}.')
                alloc_amount = Decimal(alloc_amount).quantize(TWO)
                if alloc_amount <= 0:
                    continue
                if alloc_amount > invoice.balance:
                    raise ValidationError(f'Allocation to {invoice.number} exceeds its balance.')
                if alloc_amount > remaining:
                    raise ValidationError('Allocations exceed the receipt amount.')
                planned.append((invoice, alloc_amount))
                remaining -= alloc_amount
        else:
            for invoice in open_invoices:
                if remaining <= 0:
                    break
                alloc_amount = min(invoice.balance, remaining)
                if alloc_amount > 0:
                    planned.append((invoice, alloc_amount))
                    remaining -= alloc_amount

        # --- build journal lines ---
        specs = [LineSpec(
            account=bank_account.gl_account,
            debit=amount,
            bank_account=bank_account,
            description=f'Receipt {receipt.number} — {student.full_name}',
        )]

        total_fx_base = ZERO
        for invoice, alloc_amount in planned:
            # Pocket-level distribution: invoice lines in fee-category pocket order.
            line_remaining = alloc_amount
            for line in invoice.lines.select_related('fee_category').order_by(
                'fee_category__pocket_order', 'id'
            ):
                if line_remaining <= 0:
                    break
                line_net = line.amount - line.discount_amount
                line_open = line_net - line.allocated_amount
                if line_open <= 0:
                    continue
                portion = min(line_open, line_remaining)
                pocket = SubAccount.for_student(student, line.fee_category.code, currency)
                specs.append(LineSpec(
                    mapping_purpose='ar_control',
                    credit=portion,
                    sub_account=pocket,
                    description=f'{receipt.number} → {invoice.number} {line.fee_category.code}',
                    source=('fees.FeeInvoice', invoice.pk),
                ))
                line.allocated_amount += portion
                line.save(update_fields=['allocated_amount'])
                line_remaining -= portion

            # Realized FX: AR was booked at the invoice rate, settled at the receipt rate.
            fx_base = (alloc_amount * (invoice.exchange_rate - receipt_rate)).quantize(TWO)
            total_fx_base += fx_base

            ReceiptAllocation.objects.create(
                receipt=receipt, invoice=invoice, amount=alloc_amount, fx_difference_base=fx_base
            )
            invoice.amount_paid += alloc_amount
            invoice.status = 'paid' if invoice.amount_paid >= invoice.total else 'partial'
            invoice.save(update_fields=['amount_paid', 'status'])

        if remaining > 0:
            pocket = SubAccount.for_student(student, GENERAL_POCKET, currency)
            specs.append(LineSpec(
                mapping_purpose='ar_control',
                credit=remaining,
                sub_account=pocket,
                description=f'{receipt.number} unallocated (prepayment)',
            ))
            receipt.unallocated_amount = remaining

        if total_fx_base > 0:
            # AR carries more base value than settled: write it off as a loss.
            specs.append(LineSpec(mapping_purpose='ar_control', credit=ZERO, credit_base=total_fx_base,
                                  description=f'{receipt.number} FX settlement'))
            specs.append(LineSpec(mapping_purpose='fx_loss_realized', debit=ZERO, debit_base=total_fx_base,
                                  description=f'{receipt.number} realized FX loss'))
        elif total_fx_base < 0:
            specs.append(LineSpec(mapping_purpose='ar_control', debit=ZERO, debit_base=-total_fx_base,
                                  description=f'{receipt.number} FX settlement'))
            specs.append(LineSpec(mapping_purpose='fx_gain_realized', credit=ZERO, credit_base=-total_fx_base,
                                  description=f'{receipt.number} realized FX gain'))

        journal = build_and_post_journal(
            journal_type='receipts',
            date=date,
            currency=currency,
            description=f'Receipt {receipt.number} — {student.full_name}',
            lines=specs,
            reference=receipt.number,
            exchange_rate=receipt_rate,
            user=user,
            source=('fees.Receipt', receipt.pk, receipt.number),
        )
        receipt.journal = journal
        receipt.save(update_fields=['journal', 'unallocated_amount'])
        return receipt


def reverse_receipt(receipt, reason='', user=None):
    """Reverse the journal (GL, pockets, bank) and roll back allocation state."""
    with transaction.atomic():
        receipt = Receipt.objects.select_for_update().get(pk=receipt.pk)
        if receipt.status != 'posted':
            raise ValidationError(f'Receipt {receipt.number} is already {receipt.status}.')
        reversal = receipt.journal.reverse(reason=reason or f'Reverse receipt {receipt.number}', user=user)
        for alloc in receipt.allocations.select_related('invoice'):
            invoice = FeeInvoice.objects.select_for_update().get(pk=alloc.invoice_id)
            invoice.amount_paid -= alloc.amount
            invoice.status = 'posted' if invoice.amount_paid <= 0 else 'partial'
            invoice.save(update_fields=['amount_paid', 'status'])
            # Unwind per-line allocation in reverse pocket order.
            unwind = alloc.amount
            for line in invoice.lines.select_related('fee_category').order_by(
                '-fee_category__pocket_order', '-id'
            ):
                if unwind <= 0:
                    break
                portion = min(line.allocated_amount, unwind)
                if portion > 0:
                    line.allocated_amount -= portion
                    line.save(update_fields=['allocated_amount'])
                    unwind -= portion
        receipt.status = 'reversed'
        receipt.save(update_fields=['status'])
        return reversal


# ---------------------------------------------------------------- billing runs

def _structures_for(run):
    qs = FeeStructure.objects.filter(term=run.term, currency=run.currency).select_related('fee_category', 'grade')
    grade_ids = list(run.grades.values_list('id', flat=True))
    if grade_ids:
        qs = qs.filter(grade_id__in=grade_ids)
    return qs


def preview_billing_run(run):
    """Return would-be invoices without writing anything."""
    from apps.students.models import Enrollment

    structures = list(_structures_for(run))
    by_grade = {}
    for structure in structures:
        by_grade.setdefault(structure.grade_id, []).append(structure)

    enrollments = (
        Enrollment.objects.filter(academic_year=run.term.academic_year, status='active')
        .filter(class_room__grade_id__in=by_grade.keys())
        .select_related('student', 'class_room__grade')
    )
    already_billed = set(
        FeeInvoice.objects.filter(term=run.term, currency=run.currency)
        .exclude(status='cancelled')
        .values_list('student_id', flat=True)
    )

    rows, total = [], ZERO
    for enrollment in enrollments:
        student = enrollment.student
        applicable = [
            s for s in by_grade.get(enrollment.class_room.grade_id, [])
            if s.applies_to in ('all', enrollment.attendance_type)
        ]
        if not applicable:
            continue
        awards = list(BursaryAward.objects.filter(
            student=student, academic_year=run.term.academic_year, is_active=True
        ).filter(models.Q(term__isnull=True) | models.Q(term=run.term)))
        lines = []
        invoice_total = ZERO
        for structure in applicable:
            discount = ZERO
            for award in awards:
                discount += award.discount_for(structure.fee_category, structure.amount)
            discount = min(discount, structure.amount)
            lines.append({
                'fee_category': structure.fee_category.code,
                'amount': structure.amount,
                'discount': discount,
            })
            invoice_total += structure.amount - discount
        rows.append({
            'student_id': student.pk,
            'student_code': student.code,
            'student_name': student.full_name,
            'grade': enrollment.class_room.grade.name,
            'already_billed': student.pk in already_billed,
            'lines': lines,
            'total': invoice_total,
        })
        if student.pk not in already_billed:
            total += invoice_total
    return {'rows': rows, 'total_to_bill': total, 'count': sum(1 for r in rows if not r['already_billed'])}


def execute_billing_run(run_id, user_id=None):
    """Generate and post invoices for a billing run. Idempotent: students already
    billed for the term+currency are skipped; re-execution creates no duplicates."""
    from apps.core.models import User
    from apps.students.models import Enrollment

    user = User.objects.filter(pk=user_id).first() if user_id else None
    run = BillingRun.objects.get(pk=run_id)
    if run.status == 'completed':
        return run
    run.status = 'running'
    run.save(update_fields=['status'])

    try:
        preview = preview_billing_run(run)
        created, total = 0, ZERO
        for row in preview['rows']:
            if row['already_billed'] or row['total'] <= 0:
                continue
            with transaction.atomic():
                enrollment = Enrollment.objects.select_related('student').get(
                    student_id=row['student_id'], academic_year=run.term.academic_year
                )
                invoice = FeeInvoice.objects.create(
                    number=DocumentSequence.next_for('INV'),
                    student=enrollment.student,
                    enrollment=enrollment,
                    term=run.term,
                    billing_run=run,
                    date=run.date,
                    due_date=run.due_date or run.date,
                    currency=run.currency,
                    created_by=user,
                )
                from .models import FeeCategory

                for line in row['lines']:
                    FeeInvoiceLine.objects.create(
                        invoice=invoice,
                        fee_category=FeeCategory.objects.get(code=line['fee_category']),
                        description=f'{line["fee_category"]} — {run.term}',
                        amount=line['amount'],
                        discount_amount=line['discount'],
                    )
                invoice.post(user=user)
                created += 1
                total += invoice.total
        run.status = 'completed'
        run.invoices_created = created
        run.total_billed = total
        run.error_message = ''
        run.save(update_fields=['status', 'invoices_created', 'total_billed', 'error_message'])
    except Exception as exc:  # surface the failure on the run record
        run.status = 'failed'
        run.error_message = str(exc)
        run.save(update_fields=['status', 'error_message'])
        raise
    return run
