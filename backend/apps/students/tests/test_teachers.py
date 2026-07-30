"""Teachers, subjects and teaching assignments: per-school scoping, auto TCH
codes, a teacher's students resolving via their classes, and rejection of a
cross-school teaching assignment."""
from datetime import date

import pytest
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.core.models import DocumentSequence, Organization, School, User
from apps.students.models import (
    AcademicYear,
    ClassRoom,
    Enrollment,
    Grade,
    Student,
    Subject,
    Teacher,
    TeachingAssignment,
)

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


def _class(school, grade_name='Grade 1', name=None):
    year = AcademicYear.objects.get(school=school, name='2026')
    grade = Grade.objects.get(school=school, name=grade_name)
    return ClassRoom.objects.create(
        school=school, name=name or f'{school.code} {grade_name}', academic_year=year, grade=grade
    )


def _student(school, class_room, first='Anesu', last='Test'):
    year = class_room.academic_year
    student = Student.objects.create(
        school=school, code=DocumentSequence.next_for('STU', school),
        first_name=first, last_name=last, admission_date=date(2026, 1, 13),
    )
    Enrollment.objects.create(
        student=student, academic_year=year, class_room=class_room, enrolled_date=date(2026, 1, 13)
    )
    return student


def test_teacher_code_auto_assigned_per_school(two_schools):
    ocw, kns = two_schools
    t1 = Teacher.objects.create(school=ocw, first_name='A', last_name='One')
    t2 = Teacher.objects.create(school=ocw, first_name='B', last_name='Two')
    k1 = Teacher.objects.create(school=kns, first_name='C', last_name='Three')
    assert t1.code == 'TCH00001'
    assert t2.code == 'TCH00002'
    # Each school's TCH sequence restarts.
    assert k1.code == 'TCH00001'
    assert k1.school_id == kns.id


def test_teacher_students_resolve_via_classes(two_schools):
    ocw, _ = two_schools
    room = _class(ocw)
    s1 = _student(ocw, room, first='One')
    s2 = _student(ocw, room, first='Two')
    other_room = _class(ocw, name='Other')
    _student(ocw, other_room, first='Elsewhere')

    teacher = Teacher.objects.create(school=ocw, first_name='Form', last_name='Teacher')
    room.class_teacher = teacher
    room.save(update_fields=['class_teacher'])

    student_ids = set(teacher.students.values_list('id', flat=True))
    assert student_ids == {s1.id, s2.id}
    assert teacher.classes.count() == 1

    # A teaching assignment into another class widens the teacher's students.
    subject = Subject.objects.create(school=ocw, code='MATH', name='Mathematics')
    TeachingAssignment.objects.create(teacher=teacher, class_room=other_room, subject=subject)
    assert teacher.classes.count() == 2
    assert teacher.students.count() == 3


def test_cross_school_teaching_assignment_rejected(two_schools):
    ocw, kns = two_schools
    ocw_room = _class(ocw)
    kns_teacher = Teacher.objects.create(school=kns, first_name='K', last_name='Teach')
    ocw_subject = Subject.objects.create(school=ocw, code='ENG', name='English')
    with pytest.raises(ValidationError):
        TeachingAssignment.objects.create(
            teacher=kns_teacher, class_room=ocw_room, subject=ocw_subject
        )


def test_subject_unique_per_school(two_schools):
    ocw, kns = two_schools
    Subject.objects.create(school=ocw, code='MATH', name='Mathematics')
    # Same code allowed in a different school.
    Subject.objects.create(school=kns, code='MATH', name='Mathematics')
    with pytest.raises(Exception):
        Subject.objects.create(school=ocw, code='MATH', name='Dup')


class TestTeacherApi:
    @pytest.fixture
    def client(self, two_schools):
        ocw, _ = two_schools
        api = APIClient()
        api.force_authenticate(
            User.objects.create_user('head@t.local', 'x', role='head', home_school=ocw)
        )
        return api

    def test_create_teacher_gets_tch_code(self, client, two_schools):
        resp = client.post('/api/students/teachers/', {
            'first_name': 'New', 'last_name': 'Teacher', 'status': 'active',
        }, format='json')
        assert resp.status_code == 201, resp.content
        assert resp.json()['code'].startswith('TCH')

    def test_teacher_students_action(self, client, two_schools):
        ocw, _ = two_schools
        room = _class(ocw)
        _student(ocw, room, first='Reg')
        teacher = Teacher.objects.create(school=ocw, first_name='Form', last_name='Teacher')
        room.class_teacher = teacher
        room.save(update_fields=['class_teacher'])
        resp = client.get(f'/api/students/teachers/{teacher.id}/students/')
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_list_scoped_to_home_school(self, client, two_schools):
        ocw, kns = two_schools
        Teacher.objects.create(school=ocw, first_name='Ours', last_name='One')
        Teacher.objects.create(school=kns, first_name='Theirs', last_name='Two')
        codes = [t['last_name'] for t in client.get('/api/students/teachers/').json()['results']]
        assert 'One' in codes
        assert 'Two' not in codes
