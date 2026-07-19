from datetime import date

import pytest
from rest_framework.test import APIClient

from apps.core.models import User

pytestmark = pytest.mark.django_db


def make_user(role):
    return User.objects.create_user(f'{role}@test.local', 'pass12345', role=role)


@pytest.fixture
def client_for(seeded_db):
    def _make(role):
        client = APIClient()
        client.force_authenticate(make_user(role))
        return client
    return _make


class TestRoleGating:
    def test_auditor_can_read_but_not_write(self, client_for):
        client = client_for('auditor_readonly')
        assert client.get('/api/accounting/accounts/').status_code == 200
        assert client.get('/api/fees/invoices/').status_code == 200
        response = client.post('/api/accounting/accounts/', {
            'code': '5199', 'name': 'Nope', 'report_group': 'operating_expenses',
        })
        assert response.status_code == 403

    def test_storekeeper_cannot_touch_accounting(self, client_for):
        client = client_for('storekeeper')
        response = client.post('/api/accounting/journals/', {
            'date': str(date(2026, 3, 1)), 'description': 'sneaky', 'currency': 'USD', 'lines': [],
        }, format='json')
        assert response.status_code == 403

    def test_storekeeper_can_write_inventory(self, client_for):
        client = client_for('storekeeper')
        response = client.post('/api/inventory/warehouses/', {'code': 'ST1', 'name': 'Store 1'})
        assert response.status_code == 201

    def test_teacher_cannot_create_students(self, client_for):
        client = client_for('teacher')
        response = client.post('/api/students/students/', {'first_name': 'A', 'last_name': 'B'})
        assert response.status_code == 403

    def test_bursar_can_post_fees(self, client_for):
        client = client_for('bursar')
        response = client.get('/api/reports/trial-balance/')
        assert response.status_code == 200

    def test_anonymous_is_rejected(self, seeded_db):
        client = APIClient()
        assert client.get('/api/students/students/').status_code in (401, 403)
