import django.db.models.deletion
from django.db import migrations, models


def backfill(apps, schema_editor):
    School = apps.get_model('core', 'School')
    school = School.objects.filter(code='OCW').first() or School.objects.order_by('id').first()
    if school is None:
        return
    model = apps.get_model('ingestion', 'ingestionitem')
    model.objects.filter(school__isnull=True).update(school=school)


def _fk(null=False):
    return models.ForeignKey(
        null=null, on_delete=django.db.models.deletion.PROTECT,
        related_name='ingestion_items', to='core.school',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_tenancy'),
        ('ingestion', '0001_initial'),
    ]

    operations = [
        migrations.AddField(model_name='ingestionitem', name='school', field=_fk(null=True)),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(model_name='ingestionitem', name='school', field=_fk()),
    ]
