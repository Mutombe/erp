import django.db.models.deletion
from django.db import migrations, models

SCHOOL_MODELS = ['itemcategory', 'department', 'item', 'warehouse', 'stockmove']


def backfill(apps, schema_editor):
    School = apps.get_model('core', 'School')
    school = School.objects.filter(code='OCW').first() or School.objects.order_by('id').first()
    if school is None:
        return
    for model_name in SCHOOL_MODELS:
        model = apps.get_model('inventory', model_name)
        model.objects.filter(school__isnull=True).update(school=school)


def _fk(related_name, null=False):
    return models.ForeignKey(
        null=null, on_delete=django.db.models.deletion.PROTECT,
        related_name=related_name, to='core.school',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_tenancy'),
        ('inventory', '0002_department'),
    ]

    operations = [
        # --- Phase 1: add nullable school FK ---
        migrations.AddField(model_name='itemcategory', name='school', field=_fk('item_categories', null=True)),
        migrations.AddField(model_name='department', name='school', field=_fk('departments', null=True)),
        migrations.AddField(model_name='item', name='school', field=_fk('items', null=True)),
        migrations.AddField(model_name='warehouse', name='school', field=_fk('warehouses', null=True)),
        migrations.AddField(model_name='stockmove', name='school', field=_fk('stock_moves', null=True)),

        # --- Phase 2: drop legacy single-column uniques ---
        migrations.AlterField(model_name='itemcategory', name='name', field=models.CharField(max_length=100)),
        migrations.AlterField(model_name='department', name='code', field=models.CharField(max_length=10)),
        migrations.AlterField(model_name='item', name='code', field=models.CharField(max_length=30)),
        migrations.AlterField(model_name='warehouse', name='code', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='stockmove', name='number', field=models.CharField(max_length=20)),

        # --- Phase 3: backfill existing rows to Oceanwaves ---
        migrations.RunPython(backfill, migrations.RunPython.noop),

        # --- Phase 4: make school non-null ---
        migrations.AlterField(model_name='itemcategory', name='school', field=_fk('item_categories')),
        migrations.AlterField(model_name='department', name='school', field=_fk('departments')),
        migrations.AlterField(model_name='item', name='school', field=_fk('items')),
        migrations.AlterField(model_name='warehouse', name='school', field=_fk('warehouses')),
        migrations.AlterField(model_name='stockmove', name='school', field=_fk('stock_moves')),

        # --- Phase 5: install composite (school, …) uniques ---
        migrations.AlterUniqueTogether(name='itemcategory', unique_together={('school', 'name')}),
        migrations.AlterUniqueTogether(name='department', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(name='item', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(name='warehouse', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(name='stockmove', unique_together={('school', 'number')}),
    ]
