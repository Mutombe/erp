import django.db.models.deletion
from django.db import migrations, models


def forwards(apps, schema_editor):
    Organization = apps.get_model('core', 'Organization')
    School = apps.get_model('core', 'School')
    DocumentSequence = apps.get_model('core', 'DocumentSequence')
    AuditTrail = apps.get_model('core', 'AuditTrail')
    User = apps.get_model('core', 'User')
    SchoolSettings = apps.get_model('core', 'SchoolSettings')

    org, _ = Organization.objects.get_or_create(
        slug='golden-knot', defaults={'name': 'Golden Knot', 'base_currency': 'USD'}
    )

    defaults = {
        'organization': org, 'slug': 'oceanwaves', 'name': 'Oceanwaves Schools',
        'address': '', 'phone': '', 'email': '',
        'base_currency': 'USD', 'secondary_currency': 'ZWG',
        'revenue_recognition': 'immediate', 'default_due_days': 30,
        'statement_footer': '', 'is_active': True,
    }
    settings_row = SchoolSettings.objects.first()
    if settings_row is not None:
        defaults.update({
            'name': settings_row.school_name or 'Oceanwaves Schools',
            'address': settings_row.address or '',
            'phone': settings_row.phone or '',
            'email': settings_row.email or '',
            'logo': settings_row.logo,
            'base_currency': settings_row.base_currency or 'USD',
            'secondary_currency': settings_row.secondary_currency or 'ZWG',
            'revenue_recognition': settings_row.revenue_recognition or 'immediate',
            'default_due_days': settings_row.default_due_days or 30,
            'statement_footer': settings_row.statement_footer or '',
            'current_academic_year_id': settings_row.current_academic_year_id,
        })

    school, _ = School.objects.get_or_create(code='OCW', defaults=defaults)

    # Backfill every existing single-school row to Oceanwaves.
    DocumentSequence.objects.filter(school__isnull=True).update(school=school)
    AuditTrail.objects.filter(school__isnull=True).update(school=school)
    # Existing admins/superusers become HQ users who can see all schools.
    User.objects.filter(is_superuser=True).update(is_hq=True, home_school=school)


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0001_initial'),
        ('core', '0002_alter_schoolsettings_school_name'),
    ]

    operations = [
        migrations.CreateModel(
            name='Organization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(default='Golden Knot', max_length=200)),
                ('slug', models.SlugField(default='golden-knot', max_length=60, unique=True)),
                ('logo', models.ImageField(blank=True, null=True, upload_to='org_logo/')),
                ('base_currency', models.CharField(default='USD', max_length=3)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='School',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=10, unique=True)),
                ('slug', models.SlugField(max_length=60, unique=True)),
                ('name', models.CharField(max_length=200)),
                ('address', models.TextField(blank=True)),
                ('phone', models.CharField(blank=True, max_length=50)),
                ('email', models.EmailField(blank=True, max_length=254)),
                ('logo', models.ImageField(blank=True, null=True, upload_to='logo/')),
                ('base_currency', models.CharField(default='USD', max_length=3)),
                ('secondary_currency', models.CharField(default='ZWG', max_length=3)),
                ('revenue_recognition', models.CharField(
                    choices=[('immediate', 'Recognize at invoice'), ('deferred', 'Defer until term recognition')],
                    default='immediate', max_length=10)),
                ('default_due_days', models.PositiveIntegerField(default=30)),
                ('statement_footer', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('current_academic_year', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+', to='students.academicyear')),
                ('organization', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT, related_name='schools', to='core.organization')),
            ],
            options={'ordering': ['code']},
        ),
        migrations.AddField(
            model_name='user',
            name='home_school',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='home_users', to='core.school'),
        ),
        migrations.AddField(
            model_name='user',
            name='is_hq',
            field=models.BooleanField(default=False, help_text='Golden Knot HQ user — sees all schools.'),
        ),
        migrations.AddField(
            model_name='user',
            name='extra_schools',
            field=models.ManyToManyField(blank=True, related_name='extra_users', to='core.school'),
        ),
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(
                choices=[
                    ('admin', 'Administrator'), ('bursar', 'Bursar'), ('accounts_clerk', 'Accounts Clerk'),
                    ('head', 'Head of School'), ('storekeeper', 'Storekeeper'), ('teacher', 'Teacher'),
                    ('auditor_readonly', 'Auditor (read-only)'), ('guardian_portal', 'Guardian (portal)'),
                    ('student_portal', 'Student (portal)'),
                ],
                default='accounts_clerk', max_length=30),
        ),
        migrations.AddField(
            model_name='documentsequence',
            name='school',
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.CASCADE,
                related_name='sequences', to='core.school'),
        ),
        migrations.AddField(
            model_name='audittrail',
            name='school',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='audit_entries', to='core.school'),
        ),
        migrations.AlterField(
            model_name='documentsequence',
            name='doc_type',
            field=models.CharField(max_length=10),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='documentsequence',
            name='school',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='sequences', to='core.school'),
        ),
        migrations.AlterModelOptions(
            name='documentsequence',
            options={'ordering': ['school', 'doc_type']},
        ),
        migrations.AlterUniqueTogether(
            name='documentsequence',
            unique_together={('school', 'doc_type')},
        ),
        migrations.DeleteModel(name='SchoolSettings'),
    ]
