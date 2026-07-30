from django.core.exceptions import ValidationError
from django.db import models


def _default_school():
    from apps.core.models import School

    return School.get_default()


class AcademicYear(models.Model):
    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='academic_years')
    name = models.CharField(max_length=20)  # e.g. "2026"
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        ordering = ['start_date']
        unique_together = [('school', 'name')]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school = _default_school()
        if self.is_current:
            AcademicYear.objects.filter(school_id=self.school_id).exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


class Term(models.Model):
    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='terms')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='terms')
    number = models.PositiveIntegerField()  # 1..3
    name = models.CharField(max_length=50)  # e.g. "Term 1"
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        unique_together = [('school', 'academic_year', 'number')]
        ordering = ['academic_year__start_date', 'number']

    def __str__(self):
        return f'{self.name} {self.academic_year.name}'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = self.academic_year.school_id if self.academic_year_id else _default_school().pk
        if self.is_current:
            Term.objects.filter(school_id=self.school_id).exclude(pk=self.pk).update(is_current=False)
        super().save(*args, **kwargs)


class Grade(models.Model):
    SECTIONS = [('ecd', 'ECD'), ('primary', 'Primary'), ('secondary', 'Secondary')]

    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='grades')
    name = models.CharField(max_length=50)  # ECD A ... Form 6
    level = models.PositiveIntegerField()  # promotion/sort order
    section = models.CharField(max_length=10, choices=SECTIONS)

    class Meta:
        ordering = ['level']
        unique_together = [('school', 'name'), ('school', 'level')]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school = _default_school()
        super().save(*args, **kwargs)


class ClassRoom(models.Model):
    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='classrooms')
    grade = models.ForeignKey(Grade, on_delete=models.PROTECT, related_name='classes')
    name = models.CharField(max_length=50)  # stream, e.g. "Form 1 Blue"
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='classes')
    teacher_name = models.CharField(max_length=100, blank=True)
    capacity = models.PositiveIntegerField(default=40)

    class Meta:
        unique_together = [('school', 'name', 'academic_year')]
        ordering = ['grade__level', 'name']

    def __str__(self):
        return f'{self.name} ({self.academic_year.name})'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school_id = self.academic_year.school_id if self.academic_year_id else _default_school().pk
        super().save(*args, **kwargs)


class Guardian(models.Model):
    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='guardians')
    code = models.CharField(max_length=20)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    national_id = models.CharField(max_length=30, blank=True)
    employer = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['last_name', 'first_name']
        unique_together = [('school', 'code')]

    def __str__(self):
        return self.full_name

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school = _default_school()
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'


class Student(models.Model):
    STATUS = [
        ('applicant', 'Applicant'),  # CRM/admissions hook
        ('enrolled', 'Enrolled'),
        ('suspended', 'Suspended'),
        ('graduated', 'Graduated'),
        ('withdrawn', 'Withdrawn'),
    ]
    ATTENDANCE = [('day', 'Day scholar'), ('boarder', 'Boarder')]
    GENDERS = [('male', 'Male'), ('female', 'Female')]

    school = models.ForeignKey('core.School', on_delete=models.PROTECT, related_name='students')
    code = models.CharField(max_length=20)  # admission number
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    dob = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=GENDERS, blank=True)
    national_id_or_birth_cert = models.CharField(max_length=50, blank=True)
    admission_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS, default='enrolled', db_index=True)
    attendance_type = models.CharField(max_length=10, choices=ATTENDANCE, default='day')
    photo = models.ImageField(upload_to='students/', null=True, blank=True)
    medical_notes = models.TextField(blank=True)
    guardians = models.ManyToManyField(Guardian, through='StudentGuardian', related_name='students')
    custom_fields = models.JSONField(default=dict, blank=True)  # Studio-style extension point
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['code']
        unique_together = [('school', 'code')]

    def __str__(self):
        return f'{self.code} · {self.full_name}'

    def save(self, *args, **kwargs):
        if self.school_id is None:
            self.school = _default_school()
        super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'

    @property
    def current_enrollment(self):
        return self.enrollments.filter(status='active').select_related('class_room__grade').first()


class StudentGuardian(models.Model):
    RELATIONSHIPS = [('father', 'Father'), ('mother', 'Mother'), ('guardian', 'Guardian'), ('sponsor', 'Sponsor')]

    student = models.ForeignKey(Student, on_delete=models.CASCADE)
    guardian = models.ForeignKey(Guardian, on_delete=models.CASCADE)
    relationship = models.CharField(max_length=10, choices=RELATIONSHIPS, default='guardian')
    is_primary_contact = models.BooleanField(default=False)
    is_billing_contact = models.BooleanField(default=False)  # statement addressee

    class Meta:
        unique_together = [('student', 'guardian')]

    def __str__(self):
        return f'{self.guardian} → {self.student} ({self.relationship})'


class Enrollment(models.Model):
    STATUS = [('active', 'Active'), ('transferred', 'Transferred'), ('completed', 'Completed'), ('withdrawn', 'Withdrawn')]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='enrollments')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='enrollments')
    class_room = models.ForeignKey(ClassRoom, on_delete=models.PROTECT, related_name='enrollments')
    enrolled_date = models.DateField(null=True, blank=True)
    attendance_type = models.CharField(max_length=10, choices=Student.ATTENDANCE, default='day')
    status = models.CharField(max_length=15, choices=STATUS, default='active')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('student', 'academic_year')]
        ordering = ['-academic_year__start_date']

    def __str__(self):
        return f'{self.student.code} in {self.class_room} ({self.status})'

    def clean(self):
        if self.class_room_id and self.academic_year_id and self.class_room.academic_year_id != self.academic_year_id:
            raise ValidationError({'class_room': 'Class belongs to a different academic year.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)
