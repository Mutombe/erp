"""Attendance register services: seed a session's records for a class's active
students, and bulk-mark the register."""
from django.db import transaction

from .models import AttendanceRecord, AttendanceSession


def get_or_create_session(class_room, date, session='full_day', marked_by=None, notes=''):
    """Fetch (or create) the register for a class/date/session and ensure a
    record (default present) exists for every ACTIVE enrolled student in that
    class for the class's academic year. Idempotent — re-seeding only adds
    records for students that don't yet have one, never overwriting statuses."""
    from apps.students.models import Enrollment

    with transaction.atomic():
        obj, _ = AttendanceSession.objects.get_or_create(
            class_room=class_room,
            date=date,
            session=session,
            defaults={
                'school_id': class_room.school_id,
                'marked_by': marked_by,
                'notes': notes,
            },
        )
        enrolled = Enrollment.objects.filter(
            class_room=class_room,
            academic_year_id=class_room.academic_year_id,
            status='active',
        ).values_list('student_id', flat=True)
        existing = set(obj.records.values_list('student_id', flat=True))
        AttendanceRecord.objects.bulk_create(
            AttendanceRecord(session=obj, student_id=sid, status='present')
            for sid in enrolled
            if sid not in existing
        )
    return obj


def mark_session(session, entries):
    """Upsert records from ``entries`` = [{'student', 'status', 'note'}].

    ``student`` may be a Student instance or a pk. Unknown/omitted fields keep
    their current value. Returns the updated records."""
    updated = []
    with transaction.atomic():
        for entry in entries:
            student = entry['student']
            student_id = getattr(student, 'pk', student)
            record, _ = AttendanceRecord.objects.get_or_create(
                session=session, student_id=student_id
            )
            fields = []
            if 'status' in entry and entry['status'] is not None:
                record.status = entry['status']
                fields.append('status')
            if 'note' in entry and entry['note'] is not None:
                record.note = entry['note']
                fields.append('note')
            if fields:
                record.save(update_fields=fields)
            updated.append(record)
    return updated
