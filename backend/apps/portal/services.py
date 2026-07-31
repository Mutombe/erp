"""Read helpers for the guardian/student self-service portal.

Everything here is strictly scoped to the logged-in portal user: a guardian
sees only their linked children; a student sees only themselves. Nothing here
writes to the ledger — the only mutation the portal allows is declaring a
PaymentIntent, which a bursar must confirm before any receipt is posted.
"""
from decimal import Decimal

from apps.attendance.models import AttendanceRecord
from apps.fees.models import FeeInvoice, Receipt
from apps.students.models import Guardian, Student

ZERO = Decimal('0')

# Statuses that count as "attended" for the headline attendance rate.
_PRESENT = {'present', 'late'}


def portal_profile(user):
    """Resolve the logged-in user to their portal identity.

    Returns ('guardian', Guardian), ('student', Student), or (None, None) when
    no profile is linked to the account."""
    guardian = Guardian.objects.filter(user=user).select_related('school').first()
    if guardian is not None:
        return 'guardian', guardian
    student = Student.objects.filter(user=user).select_related('school').first()
    if student is not None:
        return 'student', student
    return None, None


def accessible_students(user):
    """Students this portal user may view (a guardian's children, or the
    student themselves). Empty queryset when no profile is linked."""
    kind, profile = portal_profile(user)
    if kind == 'guardian':
        return profile.students.all()
    if kind == 'student':
        return Student.objects.filter(pk=profile.pk)
    return Student.objects.none()


def can_view_student(user, student_id):
    return accessible_students(user).filter(pk=student_id).exists()


def student_balances(student):
    """Net amount owing per currency: open invoice balances less any
    unallocated prepayments sitting on posted receipts."""
    owing = {}
    for inv in FeeInvoice.objects.filter(student=student, status__in=['posted', 'partial']):
        owing[inv.currency] = owing.get(inv.currency, ZERO) + (inv.total - inv.amount_paid)
    for r in Receipt.objects.filter(student=student, status='posted'):
        if r.unallocated_amount:
            owing[r.currency] = owing.get(r.currency, ZERO) - r.unallocated_amount
    return [
        {'currency': ccy, 'amount': amount}
        for ccy, amount in sorted(owing.items())
        if amount != ZERO
    ]


def _enrollment_summary(student):
    enrollment = student.current_enrollment
    if enrollment is None:
        return {'class_name': None, 'grade': None}
    return {
        'class_name': enrollment.class_room.name,
        'grade': enrollment.class_room.grade.name,
    }


def student_card(student):
    """Compact card for the portal dashboard: identity, class, balances, rate."""
    summary = _enrollment_summary(student)
    return {
        'id': student.id,
        'code': student.code,
        'name': student.full_name,
        'status': student.status,
        'photo': student.photo.url if student.photo else None,
        'class_name': summary['class_name'],
        'grade': summary['grade'],
        'balances': student_balances(student),
        'attendance_rate': attendance_rate(student),
    }


def attendance_rate(student):
    """Overall attended fraction (present + late) as a percentage, or None when
    the student has no records yet."""
    records = AttendanceRecord.objects.filter(student=student)
    total = records.count()
    if total == 0:
        return None
    attended = records.filter(status__in=_PRESENT).count()
    return round(attended * 100 / total, 1)


def attendance_summary(student, start=None, end=None, limit=60):
    qs = AttendanceRecord.objects.filter(student=student).select_related('session', 'session__class_room')
    if start:
        qs = qs.filter(session__date__gte=start)
    if end:
        qs = qs.filter(session__date__lte=end)
    counts = {'present': 0, 'absent': 0, 'late': 0, 'excused': 0}
    for row in qs.values('status'):
        counts[row['status']] = counts.get(row['status'], 0) + 1
    total = sum(counts.values())
    attended = counts['present'] + counts['late']
    recent = [
        {
            'date': rec.session.date,
            'session': rec.session.get_session_display(),
            'class_name': rec.session.class_room.name,
            'status': rec.status,
            'note': rec.note,
        }
        for rec in qs.order_by('-session__date', '-id')[:limit]
    ]
    return {
        'counts': counts,
        'total': total,
        'rate': round(attended * 100 / total, 1) if total else None,
        'records': recent,
    }


def student_statement(student):
    """Invoices + receipts + net balances for a portal statement view."""
    invoices = [
        {
            'id': inv.id,
            'number': inv.number,
            'date': inv.date,
            'due_date': inv.due_date,
            'currency': inv.currency,
            'total': inv.total,
            'amount_paid': inv.amount_paid,
            'balance': inv.balance,
            'status': inv.status,
        }
        for inv in FeeInvoice.objects.filter(student=student)
        .exclude(status='cancelled')
        .order_by('-date', '-id')
    ]
    receipts = [
        {
            'id': r.id,
            'number': r.number,
            'date': r.date,
            'currency': r.currency,
            'amount': r.amount,
            'payment_method': r.payment_method,
            'reference': r.reference,
            'unallocated_amount': r.unallocated_amount,
            'status': r.status,
        }
        for r in Receipt.objects.filter(student=student).order_by('-date', '-id')
    ]
    return {
        'invoices': invoices,
        'receipts': receipts,
        'balances': student_balances(student),
    }
