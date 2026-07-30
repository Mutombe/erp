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

    class Meta:
        model = User
        fields = [
            'id', 'email', 'first_name', 'last_name', 'full_name', 'phone', 'role', 'is_active',
            'home_school', 'is_hq', 'extra_schools', 'password',
        ]
        read_only_fields = ['full_name']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        extra_schools = validated_data.pop('extra_schools', [])
        user = User.objects.create_user(email=validated_data.pop('email'), password=password, **validated_data)
        if extra_schools:
            user.extra_schools.set(extra_schools)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        user = super().update(instance, validated_data)
        if password:
            user.set_password(password)
            user.save(update_fields=['password'])
        return user


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
