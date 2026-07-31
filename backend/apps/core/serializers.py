from rest_framework import serializers

from .models import AuditTrail, DocumentSequence, Organization, School, User


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ['id', 'name', 'slug', 'logo', 'base_currency', 'created_at']
        read_only_fields = ['created_at']


class SchoolSerializer(serializers.ModelSerializer):
    class Meta:
        model = School
        fields = [
            'id', 'organization', 'code', 'slug', 'name', 'address', 'phone', 'email', 'logo',
            'base_currency', 'secondary_currency', 'revenue_recognition', 'current_academic_year',
            'default_due_days', 'statement_footer', 'is_active', 'created_at',
        ]
        read_only_fields = ['created_at']


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, style={'input_type': 'password'})
    # Onboarding: create-or-link a students.Teacher for teacher-role users.
    # Accepts {'id': <existing teacher>} to link, or profile fields to create.
    teacher_profile = serializers.DictField(write_only=True, required=False)
    teacher = serializers.SerializerMethodField(read_only=True)
    # Portal onboarding: link an existing Guardian/Student to this login account,
    # e.g. {'id': <guardian id>} on a guardian_portal user.
    link_guardian = serializers.DictField(write_only=True, required=False)
    link_student = serializers.DictField(write_only=True, required=False)
    portal_profile = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name', 'phone', 'role', 'is_active',
            'home_school', 'is_hq', 'extra_schools', 'password', 'teacher_profile', 'teacher',
            'link_guardian', 'link_student', 'portal_profile',
        ]
        read_only_fields = ['full_name']

    def get_teacher(self, obj):
        teacher = obj.teacher_profiles.first()
        if teacher is None:
            return None
        return {'id': teacher.id, 'code': teacher.code, 'name': teacher.full_name, 'school': teacher.school_id}

    def get_portal_profile(self, obj):
        guardian = obj.guardian_profiles.first()
        if guardian is not None:
            return {'kind': 'guardian', 'id': guardian.id, 'name': guardian.full_name, 'school': guardian.school_id}
        student = obj.student_profiles.first()
        if student is not None:
            return {'kind': 'student', 'id': student.id, 'name': student.full_name, 'school': student.school_id}
        return None

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        extra_schools = validated_data.pop('extra_schools', [])
        teacher_profile = validated_data.pop('teacher_profile', None)
        link_guardian = validated_data.pop('link_guardian', None)
        link_student = validated_data.pop('link_student', None)
        user = User.objects.create_user(email=validated_data.pop('email'), password=password, **validated_data)
        if extra_schools:
            user.extra_schools.set(extra_schools)
        self._sync_teacher(user, teacher_profile)
        self._sync_portal(user, link_guardian, link_student)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        teacher_profile = validated_data.pop('teacher_profile', None)
        link_guardian = validated_data.pop('link_guardian', None)
        link_student = validated_data.pop('link_student', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password'])
        self._sync_teacher(user, teacher_profile)
        self._sync_portal(user, link_guardian, link_student)
        return user

    def _sync_portal(self, user, link_guardian, link_student):
        from apps.students.models import Guardian, Student

        if link_guardian and link_guardian.get('id'):
            guardian = Guardian.objects.filter(id=link_guardian['id']).first()
            if guardian is not None:
                guardian.user = user
                guardian.save(update_fields=['user'])
        if link_student and link_student.get('id'):
            student = Student.objects.filter(id=link_student['id']).first()
            if student is not None:
                student.user = user
                student.save(update_fields=['user'])

    def _sync_teacher(self, user, teacher_profile):
        if not teacher_profile:
            return
        from apps.students.models import Teacher

        teacher_id = teacher_profile.get('id')
        if teacher_id:
            teacher = Teacher.objects.filter(id=teacher_id).first()
            if teacher is not None:
                teacher.user = user
                teacher.save(update_fields=['user'])
            return
        school = user.home_school or School.get_default()
        Teacher.objects.create(
            school=school,
            first_name=teacher_profile.get('first_name') or user.first_name,
            last_name=teacher_profile.get('last_name') or user.last_name,
            email=teacher_profile.get('email') or user.email,
            phone=teacher_profile.get('phone', ''),
            user=user,
        )


class SchoolSummarySerializer(serializers.ModelSerializer):
    """Lightweight school card used by the public school picker, the login
    response and the header switcher. `logo` is an absolute URL (or null)."""

    logo = serializers.SerializerMethodField()

    class Meta:
        model = School
        fields = ['id', 'code', 'name', 'slug', 'logo']

    def get_logo(self, obj):
        if not obj.logo:
            return None
        url = obj.logo.url
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url


class LoginSerializer(serializers.Serializer):
    # `school` may be a School id or code; optional for pure-HQ users who omit
    # it to mean "all schools".
    school = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    email = serializers.EmailField()
    password = serializers.CharField(style={'input_type': 'password'})


class SchoolSettingsSerializer(SchoolSerializer):
    """Backward-compatible name for the settings endpoint; operates on School."""

    pass


class DocumentSequenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentSequence
        fields = '__all__'


class AuditTrailSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditTrail
        fields = '__all__'
