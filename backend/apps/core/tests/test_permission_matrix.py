"""Tests for the data-driven, per-school permission matrix (the "Lego" system):
the seed reproduces the old gating, editing rows changes access, user overrides
layer on top, superusers bypass, schools are isolated, and onboarding is scoped.
"""
from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.core.models import (
    RolePermission,
    School,
    User,
    UserPermissionOverride,
)
from apps.core.permissions import can

pytestmark = pytest.mark.django_db


def make_user(role, **extra):
    return User.objects.create_user(f'{role}@matrix.local', 'pass12345', role=role, **extra)


def client_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


def unposted_invoice(student, school):
    from apps.core.models import DocumentSequence
    from apps.fees.models import FeeCategory, FeeInvoice, FeeInvoiceLine

    invoice = FeeInvoice.objects.create(
        school=school,
        number=DocumentSequence.next_for('INV', school),
        student=student,
        date=date(2026, 2, 1),
        due_date=date(2026, 2, 1),
        currency='USD',
    )
    FeeInvoiceLine.objects.create(
        invoice=invoice, fee_category=FeeCategory.objects.get(school=school, code='TUI'),
        amount=Decimal('100'),
    )
    return invoice


class TestSeedReproducesCurrentBehaviour:
    def test_resolver_mirrors_write_roles(self, seeded_db, school):
        cases = {
            'bursar': {('accounting', 'post'): True, ('students', 'create'): True,
                       ('inventory', 'create'): True, ('users', 'view'): False},
            'accounts_clerk': {('accounting', 'post'): True, ('students', 'create'): False},
            'head': {('students', 'create'): True, ('accounting', 'post'): False},
            'storekeeper': {('inventory', 'create'): True, ('accounting', 'post'): False},
            'teacher': {('attendance', 'edit'): True, ('students', 'create'): False},
            'auditor_readonly': {('accounting', 'view'): True, ('accounting', 'post'): False,
                                 ('fees', 'export'): True},
            'admin': {('accounting', 'post'): True, ('users', 'create'): True},
        }
        for role, checks in cases.items():
            user = make_user(role, home_school=school)
            for (module, action), expected in checks.items():
                assert can(user, school, module, action) is expected, f'{role} {module}.{action}'

    def test_bursar_can_post_journal_api(self, seeded_db, school):
        from apps.accounting.models import ChartOfAccount, Journal, JournalLine

        journal = Journal.objects.create(
            school=school, number='JRN-T1', date=date(2026, 3, 1), description='t', currency='USD',
        )
        cash = ChartOfAccount.objects.get(school=school, code='1000')
        income = ChartOfAccount.objects.get(school=school, code='4500')
        JournalLine.objects.create(
            journal=journal, account=cash, debit_amount=Decimal('10'), debit_base=Decimal('10'),
        )
        JournalLine.objects.create(
            journal=journal, account=income, credit_amount=Decimal('10'), credit_base=Decimal('10'),
        )

        client = client_for(make_user('bursar', home_school=school))
        resp = client.post(f'/api/accounting/journals/{journal.pk}/post/')
        assert resp.status_code == 200

    def test_clerk_cannot_write_students(self, seeded_db, school):
        client = client_for(make_user('accounts_clerk', home_school=school))
        resp = client.post('/api/students/students/', {'first_name': 'A', 'last_name': 'B'})
        assert resp.status_code == 403

    def test_teacher_can_mark_but_not_create_students(self, seeded_db, school):
        teacher = make_user('teacher', home_school=school)
        assert can(teacher, school, 'attendance', 'edit') is True
        client = client_for(teacher)
        resp = client.post('/api/students/students/', {'first_name': 'A', 'last_name': 'B'})
        assert resp.status_code == 403


class TestEditingMatrixChangesAccess:
    def test_revoke_and_regrant_fees_post(self, seeded_db, school, student):
        bursar = make_user('bursar', home_school=school)
        client = client_for(bursar)

        invoice = unposted_invoice(student, school)
        resp = client.post(f'/api/fees/invoices/{invoice.pk}/post/')
        assert resp.status_code == 200  # baseline: bursar may post

        # Revoke bursar 'post' on fees for this school.
        RolePermission.objects.filter(
            school=school, role='bursar', module='fees', action='post'
        ).update(allowed=False)

        invoice2 = unposted_invoice(student, school)
        resp = client.post(f'/api/fees/invoices/{invoice2.pk}/post/')
        assert resp.status_code == 403
        assert resp.json()['detail'] == "You don't have permission to post fee records."

        # Re-grant.
        RolePermission.objects.filter(
            school=school, role='bursar', module='fees', action='post'
        ).update(allowed=True)
        resp = client.post(f'/api/fees/invoices/{invoice2.pk}/post/')
        assert resp.status_code == 200


class TestUserOverrides:
    def test_override_grants_beyond_role(self, seeded_db, school):
        clerk = make_user('accounts_clerk', home_school=school)
        assert can(clerk, school, 'students', 'create') is False
        UserPermissionOverride.objects.create(
            user=clerk, module='students', action='create', allowed=True
        )
        assert can(clerk, school, 'students', 'create') is True

    def test_override_denies_within_role(self, seeded_db, school):
        bursar = make_user('bursar', home_school=school)
        assert can(bursar, school, 'fees', 'post') is True
        UserPermissionOverride.objects.create(
            user=bursar, module='fees', action='post', allowed=False
        )
        assert can(bursar, school, 'fees', 'post') is False


class TestSuperuserAndIsolation:
    def test_superuser_bypasses_revocation(self, seeded_db, school):
        su = User.objects.create_superuser('root@matrix.local', 'pass12345')
        RolePermission.objects.filter(school=school, module='fees', action='post').update(allowed=False)
        assert can(su, school, 'fees', 'post') is True

    def test_matrix_isolated_per_school(self, seeded_db, school):
        from apps.core.models import Organization
        from apps.core.provisioning import provision_school

        other = School.objects.create(
            organization=Organization.get(), code='ZZZ', slug='zzz-school', name='Other School',
        )
        provision_school(other)

        bursar = make_user('bursar', home_school=school)
        RolePermission.objects.filter(
            school=school, role='bursar', module='fees', action='post'
        ).update(allowed=False)

        assert can(bursar, school, 'fees', 'post') is False
        assert can(bursar, other, 'fees', 'post') is True


class TestMeIncludesPermissions:
    def test_me_payload_has_permissions(self, seeded_db, school):
        client = client_for(make_user('bursar', home_school=school))
        resp = client.get('/api/core/auth/me/')
        assert resp.status_code == 200
        perms = resp.json()['permissions']
        assert perms['accounting']['view'] is True
        assert perms['accounting']['post'] is True
        assert perms['users']['view'] is False


class TestOnboardingAndAdminEndpoints:
    def test_admin_creates_scoped_teacher_user(self, seeded_db, school):
        admin = make_user('admin', home_school=school)
        client = client_for(admin)
        resp = client.post('/api/core/users/', {
            'email': 'newteacher@matrix.local', 'role': 'teacher', 'home_school': school.id,
            'password': 'pass12345', 'first_name': 'New', 'last_name': 'Teacher',
            'teacher_profile': {'first_name': 'New', 'last_name': 'Teacher'},
        }, format='json')
        assert resp.status_code == 201, resp.content
        from apps.students.models import Teacher

        created = User.objects.get(email='newteacher@matrix.local')
        teacher = Teacher.objects.get(user=created)
        assert teacher.school_id == school.id

    def test_scoped_admin_cannot_manage_other_school(self, seeded_db, school):
        from apps.core.models import Organization
        from apps.core.provisioning import provision_school

        other = School.objects.create(
            organization=Organization.get(), code='YYY', slug='yyy-school', name='Yonder School',
        )
        provision_school(other)

        # A scoped admin whose home + active school is `school`.
        admin = make_user('admin', home_school=school)
        client = APIClient()
        client.force_authenticate(admin)
        session = client.session
        session['active_school_id'] = school.id
        session.save()

        resp = client.post('/api/core/users/', {
            'email': 'intruder@matrix.local', 'role': 'bursar', 'home_school': other.id,
            'password': 'pass12345',
        }, format='json')
        assert resp.status_code == 403

    def test_non_admin_cannot_list_users(self, seeded_db, school):
        client = client_for(make_user('bursar', home_school=school))
        assert client.get('/api/core/users/').status_code == 403

    def test_role_permission_matrix_endpoint(self, seeded_db, school):
        admin = make_user('admin', home_school=school)
        client = client_for(admin)
        resp = client.get(f'/api/core/role-permissions/?school={school.id}&role=bursar')
        assert resp.status_code == 200
        assert resp.json()['permissions']['fees']['post'] is True

        resp = client.put('/api/core/role-permissions/', {
            'school': school.id, 'role': 'bursar',
            'permissions': {'fees': {'post': False}},
        }, format='json')
        assert resp.status_code == 200
        assert resp.json()['permissions']['fees']['post'] is False
        assert RolePermission.objects.get(
            school=school, role='bursar', module='fees', action='post'
        ).allowed is False

    def test_permission_schema_endpoint(self, seeded_db, school):
        client = client_for(make_user('bursar', home_school=school))
        resp = client.get('/api/core/permission-schema/')
        assert resp.status_code == 200
        body = resp.json()
        module_values = {m['value'] for m in body['modules']}
        assert {'accounting', 'users', 'settings'} <= module_values
        assert {'view', 'post', 'export'} <= {a['value'] for a in body['actions']}
