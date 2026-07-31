from django.db import migrations

# (code, name, type, subtype, report_group, purpose)
INTERUNIT = [
    ('1180', 'Due from Related Schools', 'asset', 'accounts_receivable',
     'current_assets', 'interschool_due_from'),
    ('2180', 'Due to Related Schools', 'liability', 'accrual',
     'current_liabilities', 'interschool_due_to'),
]


def add_interunit_accounts(apps, schema_editor):
    ChartOfAccount = apps.get_model('accounting', 'ChartOfAccount')
    AccountMapping = apps.get_model('accounting', 'AccountMapping')
    School = apps.get_model('core', 'School')

    for school in School.objects.all():
        for code, name, acc_type, subtype, group, purpose in INTERUNIT:
            account, _ = ChartOfAccount.objects.get_or_create(
                school=school, code=code,
                defaults={
                    'name': name, 'account_type': acc_type, 'account_subtype': subtype,
                    'report_group': group, 'currency': '', 'is_system': True,
                    'allow_manual_journal': False,
                },
            )
            AccountMapping.objects.get_or_create(
                school=school, purpose=purpose, currency='',
                defaults={'account': account},
            )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('accounting', '0004_alter_accountmapping_purpose_and_more'),
        ('core', '0003_tenancy'),
    ]

    operations = [migrations.RunPython(add_interunit_accounts, noop)]
