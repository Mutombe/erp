import django.db.models.deletion
from django.db import migrations, models

SCHOOL_MODELS = [
    'chartofaccount', 'exchangerate', 'fiscalyear', 'fiscalperiod', 'journal',
    'generalledger', 'subaccount', 'subaccounttransaction', 'bankaccount',
    'accountmapping', 'openingbalance',
]


def backfill(apps, schema_editor):
    School = apps.get_model('core', 'School')
    school = School.objects.filter(code='OCW').first() or School.objects.order_by('id').first()
    if school is None:
        return
    for model_name in SCHOOL_MODELS:
        model = apps.get_model('accounting', model_name)
        model.objects.filter(school__isnull=True).update(school=school)


def _fk(related_name, null=False):
    return models.ForeignKey(
        null=null, on_delete=django.db.models.deletion.PROTECT,
        related_name=related_name, to='core.school',
    )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_tenancy'),
        ('accounting', '0002_initial'),
    ]

    operations = [
        # --- Phase 1: add nullable school FK to every scoped model ---
        migrations.AddField(model_name='chartofaccount', name='school', field=_fk('accounts', null=True)),
        migrations.AddField(model_name='exchangerate', name='school', field=_fk('exchange_rates', null=True)),
        migrations.AddField(model_name='fiscalyear', name='school', field=_fk('fiscal_years', null=True)),
        migrations.AddField(model_name='fiscalperiod', name='school', field=_fk('fiscal_periods', null=True)),
        migrations.AddField(model_name='journal', name='school', field=_fk('journals', null=True)),
        migrations.AddField(model_name='generalledger', name='school', field=_fk('gl_entries', null=True)),
        migrations.AddField(model_name='subaccount', name='school', field=_fk('sub_accounts', null=True)),
        migrations.AddField(model_name='subaccounttransaction', name='school',
                            field=_fk('sub_account_transactions', null=True)),
        migrations.AddField(model_name='bankaccount', name='school', field=_fk('bank_accounts', null=True)),
        migrations.AddField(model_name='accountmapping', name='school', field=_fk('account_mappings', null=True)),
        migrations.AddField(model_name='openingbalance', name='school', field=_fk('opening_balances', null=True)),

        # --- Phase 2: drop legacy single-column / composite uniques ---
        migrations.AlterField(model_name='chartofaccount', name='code', field=models.CharField(max_length=10)),
        migrations.AlterField(model_name='fiscalyear', name='name', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='journal', name='number', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='bankaccount', name='code', field=models.CharField(max_length=20)),
        migrations.AlterField(model_name='subaccount', name='code', field=models.CharField(max_length=40)),
        migrations.AlterField(model_name='openingbalance', name='number', field=models.CharField(max_length=20)),
        migrations.AlterUniqueTogether(name='exchangerate', unique_together=set()),
        migrations.AlterUniqueTogether(name='accountmapping', unique_together=set()),
        migrations.AlterUniqueTogether(name='subaccount', unique_together=set()),

        # --- Phase 3: backfill all existing rows to Oceanwaves ---
        migrations.RunPython(backfill, migrations.RunPython.noop),

        # --- Phase 4: make school non-null ---
        migrations.AlterField(model_name='chartofaccount', name='school', field=_fk('accounts')),
        migrations.AlterField(model_name='exchangerate', name='school', field=_fk('exchange_rates')),
        migrations.AlterField(model_name='fiscalyear', name='school', field=_fk('fiscal_years')),
        migrations.AlterField(model_name='fiscalperiod', name='school', field=_fk('fiscal_periods')),
        migrations.AlterField(model_name='journal', name='school', field=_fk('journals')),
        migrations.AlterField(model_name='generalledger', name='school', field=_fk('gl_entries')),
        migrations.AlterField(model_name='subaccount', name='school', field=_fk('sub_accounts')),
        migrations.AlterField(model_name='subaccounttransaction', name='school',
                              field=_fk('sub_account_transactions')),
        migrations.AlterField(model_name='bankaccount', name='school', field=_fk('bank_accounts')),
        migrations.AlterField(model_name='accountmapping', name='school', field=_fk('account_mappings')),
        migrations.AlterField(model_name='openingbalance', name='school', field=_fk('opening_balances')),

        # --- Phase 5: install composite (school, …) uniques ---
        migrations.AlterUniqueTogether(name='chartofaccount', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(
            name='exchangerate',
            unique_together={('school', 'from_currency', 'to_currency', 'effective_date', 'source')},
        ),
        migrations.AlterUniqueTogether(name='fiscalyear', unique_together={('school', 'name')}),
        migrations.AlterUniqueTogether(name='journal', unique_together={('school', 'number')}),
        migrations.AlterUniqueTogether(name='bankaccount', unique_together={('school', 'code')}),
        migrations.AlterUniqueTogether(
            name='subaccount',
            unique_together={('school', 'code'), ('student', 'category', 'currency'),
                            ('supplier', 'category', 'currency')},
        ),
        migrations.AlterUniqueTogether(name='openingbalance', unique_together={('school', 'number')}),
        migrations.AlterUniqueTogether(
            name='accountmapping', unique_together={('school', 'purpose', 'currency')}),

        # --- Phase 6: fast per-school GL report index ---
        migrations.AddIndex(
            model_name='generalledger',
            index=models.Index(fields=['school', 'date'], name='gl_school_date_idx'),
        ),
    ]
