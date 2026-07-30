"""Attendance registers: seeding present records for a class's active students,
bulk marking, per-school isolation, and the attendance-summary report."""
from datetime import date

import pytest
from rest_framework.test import APIClient

from apps.attendance.models import AttendanceRecord, AttendanceSession
from apps.attendance.services import get_or_create_session, mark_session
from apps.core.models import DocumentSequence, Organization, School, User
from apps.students.models import AcademicYear, ClassRoom, Enrollment, Grade, Student

pytestmark = pytest.mark.django_db


@pytest.fixture
def two_schools(seeded_db):
    from apps.core.provisioning import provision_school

    ocw = School.get_default()
    kns = School.objects.create(
        organization=Organization.get(), code='KNS', slug='kingsknot',
        name='Kingsknot Academy', base_currency='USD', secondary_currency='ZWG',
    )
    provision_school(kns)
    return ocw, kns


def _class(school, name=None):
    year = AcademicYear.objects.get(school=school, name='2026')
    grade = Grade.objects.get(school=school, name='Grade 1')
    return ClassRoom.objects.create(
        school=school, name=name or f'{school.code} G1', academic_year=year, grade=grade
    )


def _student(school, class_room, first='S'):
    student = Student.objects.create(
        school=school, code=DocumentSequence.next_for('STU', school),
        first_name=first, last_name='Test', admission_date=date(2026, 1, 13),
    )
    Enrollment.objects.create(
        student=student, academic_year=class_room.academic_year, class_room=class_room,
        enrolled_date=date(2026, 1, 13),
    )
    return student


def test_session_seeds_present_records_for_active_students(two_schools):
    ocw, _ = two_schools
    room = _class(ocw)
    a = _student(ocw, room, 'A')
    b = _student(ocw, room, 'B')
    # An inactive/withdrawn enrollment is excluded.
    c = _student(ocw, room, 'C')
    c.enrollments.update(status='withdrawn')

    session = get_or_create_session(room, date(2026, 2, 3))
    assert session.school_id == ocw.id
    records = {r.student_id: r.status for r in session.records.all()}
    assert set(records) == {a.id, b.id}
    assert all(status == 'present' for status in records.values())


def test_get_or_create_is_idempotent(two_schools):
    ocw, _ = two_schools
    room = _class(ocw)
    _student(ocw, room, 'A')
    s1 = get_or_create_session(room, date(2026, 2, 3))
    s2 = get_or_create_session(room, date(2026, 2, 3))
    assert s1.pk == s2.pk
    assert AttendanceSession.objects.filter(class_room=room, date=date(2026, 2, 3)).count() == 1
    assert s1.records.count() == 1


def test_mark_session_updates_statuses(two_schools):
    ocw, _ = two_schools
    room = _class(ocw)
    a = _student(ocw, room, 'A')
    b = _student(ocw, room, 'B')
    session = get_or_create_session(room, date(2026, 2, 3))
    mark_session(session, [
        {'student': a.id, 'status': 'absent', 'note': 'sick'},
        {'student': b.id, 'status': 'late'},
    ])
    records = {r.student_id: r for r in session.records.all()}
    assert records[a.id].status == 'absent'
    assert records[a.id].note == 'sick'
    assert records[b.id].status == 'late'


def test_records_isolated_per_school(two_schools):
    ocw, kns = two_schools
    ocw_room = _class(ocw)
    _student(ocw, ocw_room, 'A')
    get_or_create_session(ocw_room, date(2026, 2, 3))

    kns_room = _class(kns)
    _student(kns, kns_room, 'K')
    get_or_create_session(kns_room, date(2026, 2, 3))

    assert AttendanceRecord.objects.filter(session__school=ocw).count() == 1
    assert AttendanceRecord.objects.filter(session__school=kns).count() == 1


class TestAttendanceApi:
    @pytest.fixture
    def client(self, two_schools):
        ocw, _ = two_schools
        api = APIClient()
        api.force_authenticate(
            User.objects.create_user('teach@t.local', 'x', role='teacher', home_school=ocw)
        )
        return api

    def test_create_session_seeds_records(self, client, two_schools):
        ocw, _ = two_schools
        room = _class(ocw)
        _student(ocw, room, 'A')
        _student(ocw, room, 'B')
        resp = client.post('/api/attendance/sessions/', {
            'class_room': room.id, 'date': '2026-02-03', 'session': 'full_day',
        }, format='json')
        assert resp.status_code == 201, resp.content
        assert resp.json()['record_count'] == 2
        assert resp.json()['present_count'] == 2

    def test_mark_action_and_summary(self, client, two_schools):
        ocw, _ = two_schools
        room = _class(ocw)
        a = _student(ocw, room, 'A')
        b = _student(ocw, room, 'B')
        session = get_or_create_session(room, date(2026, 2, 3))
        get_or_create_session(room, date(2026, 2, 4))  # both present
        # Mark A absent on day 1.
        resp = client.post(f'/api/attendance/sessions/{session.id}/mark/', [
            {'student': a.id, 'status': 'absent'},
        ], format='json')
        assert resp.status_code == 200

        summary = client.get('/api/reports/attendance-summary/', {
            'start': '2026-02-01', 'end': '2026-02-28', 'fresh': '1',
        }).json()
        rows = {r['student_id']: r for r in summary['rows']}
        # A: 1 present of 2 → 50%. B: 2 present of 2 → 100%.
        assert rows[a.id]['present'] == 1
        assert rows[a.id]['absent'] == 1
        assert rows[a.id]['present_rate'] == 50.0
        assert rows[b.id]['present_rate'] == 100.0

    def test_register_grid(self, client, two_schools):
        ocw, _ = two_schools
        room = _class(ocw)
        _student(ocw, room, 'A')
        get_or_create_session(room, date(2026, 2, 3))
        data = client.get('/api/reports/attendance-register/', {
            'class_room': room.id, 'date': '2026-02-03', 'fresh': '1',
        }).json()
        assert len(data['columns']) == 1
        assert data['rows'][0]['marks'] == ['P']
