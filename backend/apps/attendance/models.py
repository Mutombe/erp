from django.db import models


def _default_school():
    from apps.core.models import School

    return School.get_default()


class AttendanceSession(models.Model):
    """A register: one class, one date, one session slot. Records hang off it."""

    SESSIONS = [('full_day', 'Full day'), ('morning', 'Morning'), ('afternoon', 'Afternoon')]

    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='attendance_sessions')
    class_room = models.ForeignKey(
        'students.ClassRoom', on_delete=models.CASCADE, related_name='attendance_sessions'
    )
    date = models.DateField()
    session = models.CharField(max_length=10, choices=SESSIONS, default='full_day')
    marked_by = models.ForeignKey(
        'core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', 'class_room']
        unique_together = [('class_room', 'date', 'session')]

    def __str__(self):
        return f'{self.class_room} · {self.date} · {self.get_session_display()}'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = self.class_room.school_id if self.class_room_id else _default_school().pk
        super().save(*args, **kwargs)


class AttendanceRecord(models.Model):
    STATUS = [
        ('present', 'Present'), ('absent', 'Absent'),
        ('late', 'Late'), ('excused', 'Excused'),
    ]

    session = models.ForeignKey(AttendanceSession, on_delete=models.CASCADE, related_name='records')
    student = models.ForeignKey('students.Student', on_delete=models.CASCADE, related_name='attendance_records')
    status = models.CharField(max_length=10, choices=STATUS, default='present', db_index=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['student__code']
        unique_together = [('session', 'student')]

    def __str__(self):
        return f'{self.student.code} · {self.status}'
