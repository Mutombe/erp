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
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=30, choices=Roles.choices, default=Roles.ACCOUNTS_CLERK)
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
        return cls.objects.create(
            action=action,
            model_name=instance.__class__.__name__,
            record_id=str(instance.pk),
            changes=changes or {},
            user=user if (user and user.is_authenticated) else None,
            user_email=getattr(user, 'email', '') or '',
            ip_address=(meta or {}).get('ip_address'),
            user_agent=(meta or {}).get('user_agent', '')[:500],
        )


class SchoolSettings(models.Model):
    """Singleton (pk=1) holding school-wide configuration."""

    REVENUE_MODES = [('immediate', 'Recognize at invoice'), ('deferred', 'Defer until term recognition')]

    school_name = models.CharField(max_length=200, default='My School')
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

    class Meta:
        verbose_name_plural = 'School settings'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return self.school_name


class DocumentSequence(models.Model):
    """Race-safe document numbering: SELECT ... FOR UPDATE on the counter row."""

    doc_type = models.CharField(max_length=10, unique=True)
    prefix = models.CharField(max_length=10)
    padding = models.PositiveIntegerField(default=5)
    next_number = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f'{self.doc_type} → {self.prefix}{str(self.next_number).zfill(self.padding)}'

    @classmethod
    def next_for(cls, doc_type):
        with transaction.atomic():
            seq = cls.objects.select_for_update().get(doc_type=doc_type)
            number = f'{seq.prefix}{str(seq.next_number).zfill(seq.padding)}'
            seq.next_number += 1
            seq.save(update_fields=['next_number'])
            return number
