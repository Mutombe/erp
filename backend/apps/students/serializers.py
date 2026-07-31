from django.db.models import Sum
from rest_framework import serializers

from apps.core.models import DocumentSequence

from .models import (
    AcademicYear,
    ClassRoom,
    Enrollment,
    Grade,
    Guardian,
    Student,
    StudentGuardian,
    Subject,
    Teacher,
    TeachingAssignment,
    Term,
)


class TermSerializer(serializers.ModelSerializer):
    class Meta:
        model = Term
        fields = ['id', 'academic_year', 'number', 'name', 'start_date', 'end_date', 'is_current']


class AcademicYearSerializer(serializers.ModelSerializer):
    terms = TermSerializer(many=True, read_only=True)

    class Meta:
        model = AcademicYear
        fields = ['id', 'name', 'start_date', 'end_date', 'is_current', 'terms']


class GradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Grade
        fields = ['id', 'name', 'level', 'section']


class ClassRoomSerializer(serializers.ModelSerializer):
    grade_name = serializers.CharField(source='grade.name', read_only=True)
    student_count = serializers.IntegerField(read_only=True)
    class_teacher_name = serializers.CharField(source='class_teacher.full_name', read_only=True)

    class Meta:
        model = ClassRoom
        fields = [
            'id', 'school', 'grade', 'grade_name', 'name', 'academic_year', 'teacher_name',
            'class_teacher', 'class_teacher_name', 'capacity', 'student_count',
        ]
        read_only_fields = ['school']


class StudentBriefSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Student
        fields = ['id', 'code', 'first_name', 'last_name', 'full_name', 'status']


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    current_class = serializers.SerializerMethodField()
    balances = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id', 'school', 'code', 'first_name', 'last_name', 'full_name', 'dob', 'gender',
            'national_id_or_birth_cert', 'admission_date', 'status', 'attendance_type',
            'photo', 'medical_notes', 'custom_fields', 'current_class', 'balances',
            'created_at', 'updated_at',
        ]
        extra_kwargs = {'code': {'required': False}}
        read_only_fields = ['school']

    def get_current_class(self, obj):
        enrollment = obj.current_enrollment
        return str(enrollment.class_room) if enrollment else None

    def get_balances(self, obj):
        from apps.accounting.models import SubAccount

        rows = (
            SubAccount.objects.filter(student=obj)
            .values('currency')
            .annotate(balance=Sum('current_balance'))
            .order_by('currency')
        )
        return [{'currency': row['currency'], 'balance': row['balance']} for row in rows]

    def create(self, validated_data):
        if not validated_data.get('code'):
            validated_data['code'] = DocumentSequence.next_for('STU')
        return super().create(validated_data)


class GuardianSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    students = StudentBriefSerializer(many=True, read_only=True)

    class Meta:
        model = Guardian
        fields = [
            'id', 'code', 'first_name', 'last_name', 'full_name', 'phone', 'email',
            'address', 'national_id', 'employer', 'students', 'created_at',
        ]
        extra_kwargs = {'code': {'required': False}}

    def create(self, validated_data):
        if not validated_data.get('code'):
            DocumentSequence.objects.get_or_create(doc_type='GRD', defaults={'prefix': 'GRD'})
            validated_data['code'] = DocumentSequence.next_for('GRD')
        return super().create(validated_data)


class StudentGuardianSerializer(serializers.ModelSerializer):
    student_code = serializers.CharField(source='student.code', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    guardian_name = serializers.CharField(source='guardian.full_name', read_only=True)

    class Meta:
        model = StudentGuardian
        fields = [
            'id', 'student', 'student_code', 'student_name', 'guardian', 'guardian_name',
            'relationship', 'is_primary_contact', 'is_billing_contact',
        ]


class EnrollmentSerializer(serializers.ModelSerializer):
    student_code = serializers.CharField(source='student.code', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    class_room_name = serializers.CharField(source='class_room.name', read_only=True)
    grade_name = serializers.CharField(source='class_room.grade.name', read_only=True)

    class Meta:
        model = Enrollment
        fields = [
            'id', 'student', 'student_code', 'student_name', 'academic_year', 'class_room',
            'class_room_name', 'grade_name', 'enrolled_date', 'attendance_type', 'status',
            'created_at',
        ]


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ['id', 'code', 'name', 'is_active']


class ClassBriefSerializer(serializers.ModelSerializer):
    grade_name = serializers.CharField(source='grade.name', read_only=True)

    class Meta:
        model = ClassRoom
        fields = ['id', 'name', 'grade', 'grade_name', 'academic_year']


class TeacherSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    class_count = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()
    classes = serializers.SerializerMethodField()
    subjects = serializers.SerializerMethodField()

    class Meta:
        model = Teacher
        fields = [
            'id', 'code', 'first_name', 'last_name', 'full_name', 'email', 'phone',
            'national_id', 'gender', 'dob', 'hire_date', 'qualification', 'status',
            'photo', 'user', 'custom_fields', 'class_count', 'student_count',
            'classes', 'subjects', 'created_at', 'updated_at',
        ]
        extra_kwargs = {'code': {'required': False}}

    def get_class_count(self, obj):
        return obj.classes.count()

    def get_student_count(self, obj):
        return obj.students.count()

    def get_classes(self, obj):
        return ClassBriefSerializer(obj.classes, many=True).data

    def get_subjects(self, obj):
        subjects = Subject.objects.filter(teaching_assignments__teacher=obj).distinct()
        return SubjectSerializer(subjects, many=True).data


class TeachingAssignmentSerializer(serializers.ModelSerializer):
    teacher_code = serializers.CharField(source='teacher.code', read_only=True)
    teacher_name = serializers.CharField(source='teacher.full_name', read_only=True)
    class_room_name = serializers.CharField(source='class_room.name', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    subject_name = serializers.CharField(source='subject.name', read_only=True)

    class Meta:
        model = TeachingAssignment
        fields = [
            'id', 'teacher', 'teacher_code', 'teacher_name', 'class_room',
            'class_room_name', 'subject', 'subject_code', 'subject_name',
        ]

    def validate(self, attrs):
        # Surface the model-level tenancy guard as a DRF validation error.
        instance = TeachingAssignment(
            teacher=attrs.get('teacher', getattr(self.instance, 'teacher', None)),
            class_room=attrs.get('class_room', getattr(self.instance, 'class_room', None)),
            subject=attrs.get('subject', getattr(self.instance, 'subject', None)),
        )
        instance.school_id = instance.class_room.school_id if instance.class_room_id else None
        instance.clean()
        return attrs
