import pytest
from rest_framework.test import APIClient

from apps.accounting.models import AccountMapping, BankAccount, ChartOfAccount
from apps.core.models import Roles, School, User

pytestmark = pytest.mark.django_db


def _client(user):
    c = APIClient()
    c.force_authenticate(user)
    return c


class TestSchoolOnboarding:
    def test_hq_creates_and_provisions_a_school(self, seeded_db):
        hq = User.objects.create_superuser('hq@golden.test', 'x')
        res = _client(hq).post('/api/core/schools/', {
            'code': 'RVR', 'name': 'Riverside College',
        }, format='json')
        assert res.status_code == 201, res.data

        school = School.objects.get(code='RVR')
        # Fully provisioned: COA (incl. the inter-unit accounts), mappings, banks.
        assert ChartOfAccount.objects.filter(school=school, code='1100').exists()
        assert ChartOfAccount.objects.filter(school=school, code='1180').exists()
        assert AccountMapping.resolve('interschool_due_from', school=school).code == '1180'
        assert BankAccount.objects.filter(school=school).exists()
        assert res.data['slug'] == 'riverside-college'

    def test_scoped_admin_cannot_create_school(self, seeded_db):
        school = School.get_default()
        admin = User.objects.create_user('a@ocw.test', 'x', role=Roles.ADMIN, home_school=school)
        res = _client(admin).post('/api/core/schools/', {'code': 'NOPE', 'name': 'Nope'}, format='json')
        assert res.status_code == 403
        assert not School.objects.filter(code='NOPE').exists()
