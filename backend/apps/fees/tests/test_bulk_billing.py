"""Bulk billing scopes: whole_school / grades / classes / students resolve the
right target enrollments, stay idempotent, post a balanced GL, and stay
school-scoped."""
from datetime import date
from decimal import Decimal

import pytest

from apps.core.models import DocumentSequence, School
from apps.fees.models import BillingRun, FeeCategory, FeeInvoice, FeeStructure
from apps.fees.services import execute_billing_run, preview_billing_run
from apps.students.models import AcademicYear, ClassRoom, Enrollment, Grade, Student, Term
from conftest import assert_gl_balanced

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def billing_setup(seeded_db):
    """Oceanwaves with two Grade-1 classes and one Form-1 class, priced structures,
    and enrolled students in each."""
    school = School.get_default()
    year = AcademicYear.objects.get(school=school, name='2026')
    term = Term.objects.get(school=school, academic_year=year, number=1)
    grade1 = Grade.objects.get(school=school, name='Grade 1')
    form1 = Grade.objects.get(school=school, name='Form 1')
    tui = FeeCategory.objects.get(school=school, code='TUI')

    for grade, amount in [(grade1, D('250')), (form1, D('400'))]:
        FeeStructure.objects.create(
            school=school, academic_year=year, term=term, grade=grade,
            fee_category=tui, amount=amount, currency='USD',
        )

    class_a = ClassRoom.objects.create(school=school, name='G1 A', academic_year=year, grade=grade1)
    class_b = ClassRoom.objects.create(school=school, name='G1 B', academic_year=year, grade=grade1)
    class_c = ClassRoom.objects.create(school=school, name='F1 C', academic_year=year, grade=form1)

    def enrol(class_room, first):
        student = Student.objects.create(
            school=school, code=DocumentSequence.next_for('STU', school),
            first_name=first, last_name='X', admission_date=date(2026, 1, 13),
        )
        Enrollment.objects.create(
            student=student, academic_year=year, class_room=class_room,
            enrolled_date=date(2026, 1, 13),
        )
        return student

    students = {
        'a1': enrol(class_a, 'A1'), 'a2': enrol(class_a, 'A2'),
        'b1': enrol(class_b, 'B1'), 'c1': enrol(class_c, 'C1'),
    }
    return dict(school=school, term=term, class_a=class_a, class_b=class_b,
               class_c=class_c, students=students)


def _run(school, term, scope, **kwargs):
    run = BillingRun.objects.create(
        school=school, number=DocumentSequence.next_for('RUN', school), term=term,
        currency='USD', date=date(2026, 1, 15), due_date=date(2026, 2, 15), scope=scope,
    )
    if kwargs.get('grades'):
        run.grades.set(kwargs['grades'])
    if kwargs.get('classes'):
        run.classes.set(kwargs['classes'])
    if kwargs.get('students'):
        run.students.set(kwargs['students'])
    return run


def test_scope_whole_school_bills_all(billing_setup):
    s = billing_setup
    run = _run(s['school'], s['term'], 'whole_school')
    execute_billing_run(run.pk)
    run.refresh_from_db()
    assert run.status == 'completed'
    assert run.invoices_created == 4
    assert FeeInvoice.objects.filter(billing_run=run).count() == 4
    assert_gl_balanced(s['school'])


def test_scope_classes_bills_only_that_class(billing_setup):
    s = billing_setup
    run = _run(s['school'], s['term'], 'classes', classes=[s['class_a']])
    preview = preview_billing_run(run)
    assert preview['count'] == 2  # only class A's two students

    execute_billing_run(run.pk)
    run.refresh_from_db()
    assert run.invoices_created == 2
    billed_ids = set(FeeInvoice.objects.filter(billing_run=run).values_list('student_id', flat=True))
    assert billed_ids == {s['students']['a1'].id, s['students']['a2'].id}
    assert_gl_balanced(s['school'])


def test_scope_students_bills_only_selected(billing_setup):
    s = billing_setup
    target = s['students']['b1']
    run = _run(s['school'], s['term'], 'students', students=[target])
    execute_billing_run(run.pk)
    run.refresh_from_db()
    assert run.invoices_created == 1
    invoice = FeeInvoice.objects.get(billing_run=run)
    assert invoice.student_id == target.id
    assert invoice.total == D('250')


def test_scope_grades_bills_that_grade(billing_setup):
    s = billing_setup
    grade1 = s['class_a'].grade
    run = _run(s['school'], s['term'], 'grades', grades=[grade1])
    execute_billing_run(run.pk)
    run.refresh_from_db()
    # a1, a2, b1 are all Grade 1; c1 is Form 1 and excluded.
    assert run.invoices_created == 3


def test_billing_run_is_idempotent(billing_setup):
    s = billing_setup
    run = _run(s['school'], s['term'], 'classes', classes=[s['class_a']])
    execute_billing_run(run.pk)
    first = FeeInvoice.objects.filter(billing_run=run).count()
    # Re-executing a completed run creates no duplicates.
    execute_billing_run(run.pk)
    assert FeeInvoice.objects.filter(billing_run=run).count() == first == 2
