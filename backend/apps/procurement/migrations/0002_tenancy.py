import django.db.models.deletion
from django.db import migrations, models

SCHOOL_MODELS = ['supplier', 'purchaseorder', 'goodsreceivednote', 'vendorbill', 'supplierpayment']


def backfill(apps, schema_editor):
    School = apps.get_model('core', 'School')
    school = School.objects.filter(code='OCW').first() or School.objects.order_by('id').first()
    if school is None:
        return
    for model_name in SCHOOL_MODELS:
        model = apps.get_model('procurement', model_name)
        model.objects.filter(school__isnull=True).update(school=school)


def _fk(related_name, null=False):
    return models.ForeignKey(
        null=null, on_delete=django.db.models.deletion.PROTECT,
        related_name=related_name, to='core.school',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_tenancy'),
        ('inventory', '0003_tenancy'),
        ('procurement', '0001_initial'),
    ]

    operations = [
        # --- Phase 1: add nullable school FK ---
        migrations.AddField(model_name='supplier', name='school', field=_fk('suppliers', null=True)),
        migrations.AddField(model_name='purchaseorder', name='school', field=_fk('purchase_orders', null=True)),
        migrations.AddField(model_name='goodsreceivednote', name='school', field=_fk('grns', null=True)),
        migrations.AddField(model_name='vendorbill', name='school', field=_fk('vendor_bills', null=True)),
        migrations.AddField(model_name='supplierpayment', name='school', field=_fk('supplier_payments', null=True)),

        # --- Phase 2: drop legacy single-column uniques ---
        migrations.AlterField(model_name='supplier', name='code', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='purchaseorder', name='number', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='goodsreceivednote', name='number', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='vendorbill', name='number', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='supplierpayment', name='number', field=models.CharField(max_length=20)),

        # --- Phase 3: backfill existing rows to Oceanwaves ---
        migrations.RunPython(backfill, migrations.RunPython.noop),

        # --- Phase 4: make school non-null ---
        migrations.AlterField(model_name='supplier', name='school', field=_fk('suppliers')),
        migrations.AlterField(model_name='purchaseorder', name='school', field=_fk('purchase_orders')),
        migrations.AlterField(model_name='goodsreceivednote', name='school', field=_fk('grns')),
        migrations.AlterField(model_name='vendorbill', name='school', field=_fk('vendor_bills')),
        migrations.AlterField(model_name='supplierpayment', name='school', field=_fk('supplier_payments')),

        # --- Phase 5: install composite (school, …) uniques ---
        migrations.AlterUniqueTogether(name='supplier', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(name='purchaseorder', unique_together={('school', 'number')}),
        migrations.AlterUniqueTogether(name='goodsreceivednote', unique_together={('school', 'number')}),
        migrations.AlterUniqueTogether(name='vendorbill', unique_together={('school', 'number')}),
        migrations.AlterUniqueTogether(name='supplierpayment', unique_together={('school', 'number')}),
    ]
