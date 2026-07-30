from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models, transaction
from django.utils import timezone


class Roles(models.TextChoices):
    ADMIN = 'admin', 'Administrator'
    BURSAR = 'bursar', 'Bursar'
    ACCOUNTS_CLERK = 'accounts_clerk', 'Accounts Clerk'
    HEAD = 'head', 'Head of School'
    STOREKEEPER = 'storekeeper', 'Storekeeper'
    TEACHER = 'teacher', 'Teacher'
    AUDITOR = 'auditor_readonly', 'Auditor (read-only)'
    GUARDIAN_PORTAL = 'guardian_portal', 'Guardian (portal)'
    STUDENT_PORTAL = 'student_portal', 'Student (portal)'


class Organization(models.Model):
    """The top-of-tree owner (Golden Knot) that owns many schools/tenants."""

    name = models.CharField(max_length=200, default='Golden Knot')
    slug = models.SlugField(max_length=60, unique=True, default='golden-knot')
    logo = models.ImageField(upload_to='org_logo/', null=True, blank=True)
    base_currency = models.CharField(max_length=3, default='USD')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    @classmethod
    def get(cls):
        """Return (creating if needed) the singleton Golden Knot organization."""
        obj, _ = cls.objects.get_or_create(
            slug='golden-knot', defaults={'name': 'Golden Knot'}
        )
        return obj


class School(models.Model):
    """THE TENANT. Every scoped row carries a `school` FK pointing here.

    Holds the school-wide configuration that used to live on the SchoolSettings
    singleton (letterhead, currencies, revenue recognition, footer, etc.)."""

    REVENUE_MODES = [('immediate', 'Recognize at invoice'), ('deferred', 'Defer until term recognition')]

    organization = models.ForeignKey(Organization, on_delete=models.PROTECT, related_name='schools')
    code = models.CharField(max_length=10, unique=True)
    slug = models.SlugField(max_length=60, unique=True)
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    logo = models.ImageField(upload_to='logo/', null=True, blank=True)
    base_currency = models.CharField(max_length=3, default='USD')
    secondary_currency = models.CharField(max_length=3, default='ZWG')
    revenue_recognition = models.CharField(max_length=10, choices=REVENUE_MODES, default='immediate')
    current_academic_year = models.ForeignKey(
        'students.AcademicYear', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    default_due_days = models.PositiveIntegerField(default=30)
    statement_footer = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.code} · {self.name}'

    # Backward-compat alias: the old SchoolSettings singleton (and PDF templates)
    # referenced `school_name`; School stores it as `name`.
    @property
    def school_name(self):
        return self.name

    @classmethod
    def get_default(cls):
        """The first active school. Used wherever a single school is implied
        during the multi-tenant transition (Wave 1)."""
        return cls.objects.filter(is_active=True).order_by('id').first()


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', Roles.ADMIN)
        extra_fields.setdefault('is_hq', True)
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=30, choices=Roles.choices, default=Roles.ACCOUNTS_CLERK)
    # Tenancy: a user has one home school; HQ users see all schools.
    home_school = models.ForeignKey(
        'core.School', null=True, blank=True, on_delete=models.SET_NULL, related_name='home_users'
    )
    is_hq = models.BooleanField(default=False, help_text='Golden Knot HQ user — sees all schools.')
    extra_schools = models.ManyToManyField('core.School', blank=True, related_name='extra_users')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ['email']

    def __str__(self):
        return self.email

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip() or self.email

    @property
    def accessible_schools(self):
        """The set of schools this user may see: all active schools if HQ,
        else their home school plus any extra schools granted."""
        if self.is_hq:
            return School.objects.filter(is_active=True)
        ids = set()
        if self.home_school_id:
            ids.add(self.home_school_id)
        if self.pk:
            ids.update(self.extra_schools.values_list('id', flat=True))
        return School.objects.filter(id__in=ids)


class AuditTrail(models.Model):
    """Immutable audit log. Rows can be created, never updated or deleted."""

    ACTIONS = [
        ('create', 'Create'), ('update', 'Update'), ('delete', 'Delete'),
        ('post', 'Post'), ('reverse', 'Reverse'), ('login', 'Login'), ('logout', 'Logout'),
    ]

    action = models.CharField(max_length=20, choices=ACTIONS)
    model_name = models.CharField(max_length=100)
    record_id = models.CharField(max_length=50)
    changes = models.JSONField(default=dict, blank=True)
    school = models.ForeignKey(
        'core.School', null=True, blank=True, on_delete=models.SET_NULL, related_name='audit_entries'
    )
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='audit_entries')
    user_email = models.CharField(max_length=254, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [models.Index(fields=['model_name', 'record_id'])]

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValueError('AuditTrail entries are immutable')
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValueError('AuditTrail entries cannot be deleted')

    @classmethod
    def log(cls, action, instance, user=None, changes=None, request_meta=None):
        from .middleware import get_current_request_meta, get_current_user
        user = user or get_current_user()
        meta = request_meta or get_current_request_meta()
        # Best-effort school tag: from the instance if it carries one.
        school = getattr(instance, 'school', None)
        school_id = getattr(instance, 'school_id', None) if school is None else school.pk
        return cls.objects.create(
            action=action,
            model_name=instance.__class__.__name__,
            record_id=str(instance.pk),
            changes=changes or {},
            school_id=school_id,
            user=user if (user and user.is_authenticated) else None,
            user_email=getattr(user, 'email', '') or '',
            ip_address=(meta or {}).get('ip_address'),
            user_agent=(meta or {}).get('user_agent', '')[:500],
        )


class SchoolSettings:
    """Backward-compatibility shim.

    The old singleton model has been removed; its fields now live on `School`.
    Legacy call sites (`SchoolSettings.get().revenue_recognition`, PDF letterhead)
    keep working by resolving to the default/active School during the Wave-1
    single-school transition. A later wave threads the real school explicitly.
    """

    @classmethod
    def get(cls):
        return School.get_default()


class DocumentSequence(models.Model):
    """Race-safe, per-school document numbering: SELECT ... FOR UPDATE on the
    (school, doc_type) counter row."""

    school = models.ForeignKey('core.School', on_delete=models.CASCADE, related_name='sequences')
    doc_type = models.CharField(max_length=10)
    prefix = models.CharField(max_length=10)
    padding = models.PositiveIntegerField(default=5)
    next_number = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = [('school', 'doc_type')]
        ordering = ['school', 'doc_type']

    def __str__(self):
        return f'{self.doc_type} → {self.prefix}{str(self.next_number).zfill(self.padding)}'

    @classmethod
    def next_for(cls, doc_type, school=None):
        # TODO(multi-tenant wave 2): callers in fees/students/inventory/procurement/
        # assets/ingestion still omit `school`; they transitionally default to the
        # Oceanwaves/default school here.
        if school is None:
            school = School.get_default()
        with transaction.atomic():
            seq = cls.objects.select_for_update().get(school=school, doc_type=doc_type)
            number = f'{seq.prefix}{str(seq.next_number).zfill(seq.padding)}'
            seq.next_number += 1
            seq.save(update_fields=['next_number'])
            return number
