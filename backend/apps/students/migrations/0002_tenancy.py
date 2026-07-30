import django.db.models.deletion
from django.db import migrations, models

SCHOOL_MODELS = ['academicyear', 'term', 'grade', 'classroom', 'guardian', 'student']


def backfill(apps, schema_editor):
    School = apps.get_model('core', 'School')
    school = School.objects.filter(code='OCW').first() or School.objects.order_by('id').first()
    if school is None:
        return
    for model_name in SCHOOL_MODELS:
        model = apps.get_model('students', model_name)
        model.objects.filter(school__isnull=True).update(school=school)


def _fk(related_name, null=False):
    return models.ForeignKey(
        null=null, on_delete=django.db.models.deletion.PROTECT,
        related_name=related_name, to='core.school',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_tenancy'),
        ('students', '0001_initial'),
    ]

    operations = [
        # --- Phase 1: add nullable school FK ---
        migrations.AddField(model_name='academicyear', name='school', field=_fk('academic_years', null=True)),
        migrations.AddField(model_name='term', name='school', field=_fk('terms', null=True)),
        migrations.AddField(model_name='grade', name='school', field=_fk('grades', null=True)),
        migrations.AddField(model_name='classroom', name='school', field=_fk('classrooms', null=True)),
        migrations.AddField(model_name='guardian', name='school', field=_fk('guardians', null=True)),
        migrations.AddField(model_name='student', name='school', field=_fk('students', null=True)),

        # --- Phase 2: drop legacy single-column / composite uniques ---
        migrations.AlterField(model_name='academicyear', name='name', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='grade', name='name', field=models.CharField(max_length=50)),
        migrations.AlterField(model_name='grade', name='level', field=models.PositiveIntegerField()),
        migrations.AlterField(model_name='guardian', name='code', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='student', name='code', field=models.CharField(max_length=20)),
        migrations.AlterUniqueTogether(name='term', unique_together=set()),
        migrations.AlterUniqueTogether(name='classroom', unique_together=set()),

        # --- Phase 3: backfill existing rows to Oceanwaves ---
        migrations.RunPython(backfill, migrations.RunPython.noop),

        # --- Phase 4: make school non-null ---
        migrations.AlterField(model_name='academicyear', name='school', field=_fk('academic_years')),
        migrations.AlterField(model_name='term', name='school', field=_fk('terms')),
        migrations.AlterField(model_name='grade', name='school', field=_fk('grades')),
        migrations.AlterField(model_name='classroom', name='school', field=_fk('classrooms')),
        migrations.AlterField(model_name='guardian', name='school', field=_fk('guardians')),
        migrations.AlterField(model_name='student', name='school', field=_fk('students')),

        # --- Phase 5: install composite (school, …) uniques ---
        migrations.AlterUniqueTogether(name='academicyear', unique_together={('school', 'name')}),
        migrations.AlterUniqueTogether(name='term', unique_together={('school', 'academic_year', 'number')}),
        migrations.AlterUniqueTogether(name='grade', unique_together={('school', 'name'), ('school', 'level')}),
        migrations.AlterUniqueTogether(name='classroom', unique_together={('school', 'name', 'academic_year')}),
        migrations.AlterUniqueTogether(name='guardian', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(name='student', unique_together={('school', 'code')}),
    ]
