import django.db.models.deletion
from django.db import migrations, models

SCHOOL_MODELS = [
    'feecategory', 'feestructure', 'bursaryaward', 'billingrun',
    'feeinvoice', 'creditnote', 'receipt',
]


def backfill(apps, schema_editor):
    School = apps.get_model('core', 'School')
    school = School.objects.filter(code='OCW').first() or School.objects.order_by('id').first()
    if school is None:
        return
    for model_name in SCHOOL_MODELS:
        model = apps.get_model('fees', model_name)
        model.objects.filter(school__isnull=True).update(school=school)


def _fk(related_name, null=False):
    return models.ForeignKey(
        null=null, on_delete=django.db.models.deletion.PROTECT,
        related_name=related_name, to='core.school',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_tenancy'),
        ('students', '0002_tenancy'),
        ('fees', '0001_initial'),
    ]

    operations = [
        # --- Phase 1: add nullable school FK ---
        migrations.AddField(model_name='feecategory', name='school', field=_fk('fee_categories', null=True)),
        migrations.AddField(model_name='feestructure', name='school', field=_fk('fee_structures', null=True)),
        migrations.AddField(model_name='bursaryaward', name='school', field=_fk('bursary_awards', null=True)),
        migrations.AddField(model_name='billingrun', name='school', field=_fk('billing_runs', null=True)),
        migrations.AddField(model_name='feeinvoice', name='school', field=_fk('fee_invoices', null=True)),
        migrations.AddField(model_name='creditnote', name='school', field=_fk('credit_notes', null=True)),
        migrations.AddField(model_name='receipt', name='school', field=_fk('receipts', null=True)),

        # --- Phase 2: drop legacy single-column / composite uniques ---
        migrations.AlterField(model_name='feecategory', name='code', field=models.CharField(max_length=10)),
        migrations.AlterField(model_name='billingrun', name='number', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='feeinvoice', name='number', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='creditnote', name='number', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='receipt', name='number', field=models.CharField(max_length=20)),
        migrations.AlterUniqueTogether(name='feestructure', unique_together=set()),

        # --- Phase 3: backfill existing rows to Oceanwaves ---
        migrations.RunPython(backfill, migrations.RunPython.noop),

        # --- Phase 4: make school non-null ---
        migrations.AlterField(model_name='feecategory', name='school', field=_fk('fee_categories')),
        migrations.AlterField(model_name='feestructure', name='school', field=_fk('fee_structures')),
        migrations.AlterField(model_name='bursaryaward', name='school', field=_fk('bursary_awards')),
        migrations.AlterField(model_name='billingrun', name='school', field=_fk('billing_runs')),
        migrations.AlterField(model_name='feeinvoice', name='school', field=_fk('fee_invoices')),
        migrations.AlterField(model_name='creditnote', name='school', field=_fk('credit_notes')),
        migrations.AlterField(model_name='receipt', name='school', field=_fk('receipts')),

        # --- Phase 5: install composite (school, …) uniques ---
        migrations.AlterUniqueTogether(name='feecategory', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(
            name='feestructure',
            unique_together={('school', 'term', 'grade', 'fee_category', 'currency', 'applies_to')},
        ),
        migrations.AlterUniqueTogether(name='billingrun', unique_together={('school', 'number')}),
        migrations.AlterUniqueTogether(name='feeinvoice', unique_together={('school', 'number')}),
        migrations.AlterUniqueTogether(name='creditnote', unique_together={('school', 'number')}),
        migrations.AlterUniqueTogether(name='receipt', unique_together={('school', 'number')}),
    ]
