import django.db.models.deletion
from django.db import migrations, models

SCHOOL_MODELS = ['assetcategory', 'asset', 'depreciationrun']


def backfill(apps, schema_editor):
    School = apps.get_model('core', 'School')
    school = School.objects.filter(code='OCW').first() or School.objects.order_by('id').first()
    if school is None:
        return
    for model_name in SCHOOL_MODELS:
        model = apps.get_model('assets', model_name)
        model.objects.filter(school__isnull=True).update(school=school)


def _fk(related_name, null=False):
    return models.ForeignKey(
        null=null, on_delete=django.db.models.deletion.PROTECT,
        related_name=related_name, to='core.school',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_tenancy'),
        ('assets', '0002_initial'),
    ]

    operations = [
        # --- Phase 1: add nullable school FK ---
        migrations.AddField(model_name='assetcategory', name='school', field=_fk('asset_categories', null=True)),
        migrations.AddField(model_name='asset', name='school', field=_fk('assets', null=True)),
        migrations.AddField(model_name='depreciationrun', name='school', field=_fk('depreciation_runs', null=True)),

        # --- Phase 2: drop legacy single-column uniques ---
        migrations.AlterField(model_name='assetcategory', name='code', field=models.CharField(max_length=10)),
        migrations.AlterField(model_name='asset', name='code', field=models.CharField(max_length=20)),

        # --- Phase 3: backfill existing rows to Oceanwaves ---
        migrations.RunPython(backfill, migrations.RunPython.noop),

        # --- Phase 4: make school non-null ---
        migrations.AlterField(model_name='assetcategory', name='school', field=_fk('asset_categories')),
        migrations.AlterField(model_name='asset', name='school', field=_fk('assets')),
        migrations.AlterField(model_name='depreciationrun', name='school', field=_fk('depreciation_runs')),

        # --- Phase 5: install composite (school, …) uniques ---
        migrations.AlterUniqueTogether(name='assetcategory', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(name='asset', unique_together={('school', 'code')}),
    ]
