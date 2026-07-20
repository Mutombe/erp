"""Departments as first-class records.

Three-step, data-preserving conversion of StockMove.department:
  1. create the Department table and add a nullable ``department_fk`` column;
  2. RunPython: for each distinct non-empty legacy department string, create a
     Department and repoint the rows that carry that string;
  3. drop the legacy CharField and rename ``department_fk`` → ``department``.
"""
import django.db.models.deletion
from django.db import migrations, models
from django.utils.text import slugify


def _code_for(name):
    """Short unique-ish code from a free-text department name: AGRI-style."""
    code = slugify(name).replace('-', '').upper()[:10]
    return code or 'DEPT'


def link_departments(apps, schema_editor):
    Department = apps.get_model('inventory', 'Department')
    StockMove = apps.get_model('inventory', 'StockMove')

    names = (
        StockMove.objects.exclude(department='')
        .values_list('department', flat=True)
        .distinct()
    )
    for name in names:
        if not (name or '').strip():
            continue
        name = name.strip()
        code = _code_for(name)
        department = Department.objects.filter(code=code).first()
        if department is None:
            # Codes are unique; disambiguate collisions from truncation.
            if Department.objects.filter(name=name).exists():
                department = Department.objects.get(name=name)
            else:
                suffix = 1
                unique = code
                while Department.objects.filter(code=unique).exists():
                    suffix += 1
                    unique = f'{code[:9]}{suffix}'
                department = Department.objects.create(
                    code=unique, name=name,
                    description='Imported from legacy free-text stock move department.',
                )
        StockMove.objects.filter(department=name).update(department_fk=department)


def unlink_departments(apps, schema_editor):
    """Reverse: write the department name back into the legacy text column."""
    StockMove = apps.get_model('inventory', 'StockMove')
    Department = apps.get_model('inventory', 'Department')
    for department in Department.objects.all():
        StockMove.objects.filter(department_fk=department).update(department=department.name[:100])


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0002_initial'),
        ('inventory', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Department',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=10, unique=True)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True)),
                ('head_name', models.CharField(blank=True, max_length=150)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expense_account', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                    related_name='+', to='accounting.chartofaccount',
                )),
            ],
            options={'ordering': ['name']},
        ),
        migrations.AddField(
            model_name='stockmove',
            name='department_fk',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='stock_moves', to='inventory.department',
            ),
        ),
        migrations.RunPython(link_departments, unlink_departments),
        migrations.RemoveField(model_name='stockmove', name='department'),
        migrations.RenameField(
            model_name='stockmove', old_name='department_fk', new_name='department'
        ),
    ]
