from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.core.models import Roles, User
from apps.students.models import (
    AcademicYear,
    ClassRoom,
    Enrollment,
    Grade,
    Guardian,
    Student,
    StudentGuardian,
)
from conftest import assert_gl_balanced, make_invoice

pytestmark = pytest.mark.django_db

D = Decimal


def _make_student(school, code, first='Kid', last='One'):
    year = AcademicYear.objects.get(school=school, name='2026')
    grade = Grade.objects.get(school=school, name='Grade 1')
    class_room, _ = ClassRoom.objects.get_or_create(
        school=school, name='Grade 1 Portal', academic_year=year, grade=grade
    )
    student = Student.objects.create(
        school=school, code=code, first_name=first, last_name=last,
        admission_date=date(2026, 1, 13),
    )
    Enrollment.objects.create(
        student=student, academic_year=year, class_room=class_room, enrolled_date=date(2026, 1, 13)
    )
    return student


@pytest.fixture
def family(school):
    """A guardian with two children, plus an unrelated third student."""
    guardian = Guardian.objects.create(school=school, code='G-001', first_name='Mary', last_name='Moyo')
    guardian_user = User.objects.create_user(
        'mary@family.test', 'x', role=Roles.GUARDIAN_PORTAL, home_school=school
    )
    guardian.user = guardian_user
    guardian.save(update_fields=['user'])

    child_a = _make_student(school, 'S-A', 'Anesu', 'Moyo')
    child_b = _make_student(school, 'S-B', 'Bothwell', 'Moyo')
    other = _make_student(school, 'S-Z', 'Ziko', 'Ncube')
    StudentGuardian.objects.create(student=child_a, guardian=guardian, is_primary_contact=True)
    StudentGuardian.objects.create(student=child_b, guardian=guardian)

    student_user = User.objects.create_user(
        'anesu@family.test', 'x', role=Roles.STUDENT_PORTAL, home_school=school
    )
    child_a.user = student_user
    child_a.save(update_fields=['user'])

    return {
        'guardian': guardian, 'guardian_user': guardian_user,
        'child_a': child_a, 'child_b': child_b, 'other': other,
        'student_user': student_user,
    }


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class TestPortalContext:
    def test_guardian_sees_only_their_children(self, family):
        res = _client(family['guardian_user']).get('/api/portal/context/')
        assert res.status_code == 200
        assert res.data['kind'] == 'guardian'
        ids = {s['id'] for s in res.data['students']}
        assert ids == {family['child_a'].id, family['child_b'].id}
        assert family['other'].id not in ids

    def test_student_sees_only_self(self, family):
        res = _client(family['student_user']).get('/api/portal/context/')
        assert res.status_code == 200
        assert res.data['kind'] == 'student'
        ids = {s['id'] for s in res.data['students']}
        assert ids == {family['child_a'].id}

    def test_staff_user_is_blocked_from_portal(self, family, school):
        clerk = User.objects.create_user('clerk@ocean.test', 'x', role=Roles.ACCOUNTS_CLERK, home_school=school)
        res = _client(clerk).get('/api/portal/context/')
        assert res.status_code == 403

    def test_unlinked_portal_user_gets_clean_403(self, school):
        orphan = User.objects.create_user('nobody@family.test', 'x', role=Roles.GUARDIAN_PORTAL, home_school=school)
        res = _client(orphan).get('/api/portal/context/')
        assert res.status_code == 403
        assert 'profile' in res.data['detail'].lower()


class TestPortalStatement:
    def test_guardian_sees_child_statement_with_balance(self, family):
        make_invoice(family['child_a'], {'TUI': '500.00'}, currency='USD')
        res = _client(family['guardian_user']).get(
            f"/api/portal/students/{family['child_a'].id}/statement/"
        )
        assert res.status_code == 200
        assert len(res.data['invoices']) == 1
        bal = {b['currency']: D(str(b['amount'])) for b in res.data['balances']}
        assert bal['USD'] == D('500.00')

    def test_guardian_cannot_see_unrelated_student(self, family):
        res = _client(family['guardian_user']).get(
            f"/api/portal/students/{family['other'].id}/statement/"
        )
        assert res.status_code == 403

    def test_student_cannot_see_sibling(self, family):
        # child_a's student login must not reach child_b.
        res = _client(family['student_user']).get(
            f"/api/portal/students/{family['child_b'].id}/statement/"
        )
        assert res.status_code == 403


class TestPortalAttendance:
    def test_attendance_summary_scoped(self, family):
        from apps.attendance.models import AttendanceRecord, AttendanceSession

        child = family['child_a']
        session = AttendanceSession.objects.create(
            school=child.school, class_room=child.current_enrollment.class_room, date=date(2026, 2, 3)
        )
        AttendanceRecord.objects.create(session=session, student=child, status='present')
        res = _client(family['guardian_user']).get(
            f"/api/portal/students/{child.id}/attendance/"
        )
        assert res.status_code == 200
        assert res.data['total'] == 1
        assert res.data['counts']['present'] == 1


class TestPortalPaymentIntent:
    def test_guardian_declares_payment(self, family):
        res = _client(family['guardian_user']).post('/api/portal/payment-intents/', {
            'student': family['child_a'].id, 'amount': '120.00', 'currency': 'USD',
            'payment_method': 'bank_transfer', 'reference': 'DEP123',
        }, format='json')
        assert res.status_code == 201, res.data
        assert res.data['status'] == 'submitted'
        assert res.data['guardian'] == family['guardian'].id

    def test_cannot_declare_for_unrelated_student(self, family):
        res = _client(family['guardian_user']).post('/api/portal/payment-intents/', {
            'student': family['other'].id, 'amount': '10.00', 'currency': 'USD',
        }, format='json')
        assert res.status_code == 403

    def test_guardian_lists_own_intents_only(self, family):
        from apps.fees.models import PaymentIntent

        PaymentIntent.objects.create(
            school=family['child_a'].school, student=family['child_a'], guardian=family['guardian'],
            date=date(2026, 2, 1), currency='USD', amount=D('50'),
        )
        PaymentIntent.objects.create(
            school=family['other'].school, student=family['other'],
            date=date(2026, 2, 1), currency='USD', amount=D('99'),
        )
        res = _client(family['guardian_user']).get('/api/portal/payment-intents/')
        assert res.status_code == 200
        student_ids = {row['student'] for row in res.data}
        assert student_ids == {family['child_a'].id}


class TestPaymentIntentConfirmation:
    def test_bursar_confirm_posts_receipt_and_reduces_balance(self, family, usd_bank):
        from apps.fees.models import PaymentIntent

        child = family['child_a']
        invoice = make_invoice(child, {'TUI': '500.00'}, currency='USD')
        intent = PaymentIntent.objects.create(
            school=child.school, student=child, guardian=family['guardian'],
            date=date(2026, 2, 5), currency='USD', amount=D('200.00'),
        )
        bursar = User.objects.create_user(
            'bursar@ocean.test', 'x', role=Roles.BURSAR, home_school=child.school
        )
        client = _client(bursar)
        # Set active school in session so TenantScopedViewSet resolves scope.
        session = client.session
        session['active_school_id'] = child.school_id
        session.save()

        res = client.post(f'/api/fees/payment-intents/{intent.id}/confirm/', {
            'bank_account': usd_bank.id,
        }, format='json')
        assert res.status_code == 200, res.data
        assert res.data['status'] == 'confirmed'
        assert res.data['receipt'] is not None

        invoice.refresh_from_db()
        assert invoice.amount_paid == D('200.00')
        assert invoice.status == 'partial'
        assert_gl_balanced(school=child.school)

    def test_reject_leaves_no_receipt(self, family):
        from apps.fees.models import PaymentIntent

        child = family['child_a']
        intent = PaymentIntent.objects.create(
            school=child.school, student=child, guardian=family['guardian'],
            date=date(2026, 2, 5), currency='USD', amount=D('200.00'),
        )
        bursar = User.objects.create_user(
            'bursar2@ocean.test', 'x', role=Roles.BURSAR, home_school=child.school
        )
        client = _client(bursar)
        session = client.session
        session['active_school_id'] = child.school_id
        session.save()

        res = client.post(f'/api/fees/payment-intents/{intent.id}/reject/', {
            'reason': 'No matching deposit found',
        }, format='json')
        assert res.status_code == 200, res.data
        assert res.data['status'] == 'rejected'
        assert res.data['receipt'] is None
        intent.refresh_from_db()
        assert intent.receipt_id is None
