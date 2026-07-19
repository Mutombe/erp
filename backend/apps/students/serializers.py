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

    class Meta:
        model = ClassRoom
        fields = [
            'id', 'grade', 'grade_name', 'name', 'academic_year', 'teacher_name',
            'capacity', 'student_count',
        ]


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
            'id', 'code', 'first_name', 'last_name', 'full_name', 'dob', 'gender',
            'national_id_or_birth_cert', 'admission_date', 'status', 'attendance_type',
            'photo', 'medical_notes', 'custom_fields', 'current_class', 'balances',
            'created_at', 'updated_at',
        ]
        extra_kwargs = {'code': {'required': False}}

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
