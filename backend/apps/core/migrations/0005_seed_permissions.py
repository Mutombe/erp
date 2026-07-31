"""Backfill the per-school permission matrix for every existing school, seeding
rows that reproduce the pre-matrix role gating EXACTLY. Frozen here (not calling
provisioning) so the historical behaviour never drifts with later code edits."""
from django.db import migrations

# Frozen snapshot of the seed vocabulary at this migration.
MODULES = [
    'accounting', 'fees', 'students', 'attendance', 'inventory', 'procurement',
    'assets', 'ingestion', 'reports', 'settings', 'users',
]
ACTIONS = ['view', 'create', 'edit', 'delete', 'post', 'approve', 'export']
READ_ACTIONS = {'view', 'export'}
WRITE_ACTIONS = {'create', 'edit', 'delete', 'post', 'approve'}
NON_PORTAL_ROLES = [
    'admin', 'bursar', 'accounts_clerk', 'head', 'storekeeper', 'teacher', 'auditor_readonly',
]
# module -> roles that may write today (mirrors the historical WRITE_ROLES).
WRITE_ROLES = {
    'accounting': {'admin', 'bursar', 'accounts_clerk'},
    'fees': {'admin', 'bursar', 'accounts_clerk'},
    'students': {'admin', 'bursar', 'head'},
    'attendance': {'admin', 'bursar', 'head', 'teacher'},
    'inventory': {'admin', 'bursar', 'storekeeper'},
    'procurement': {'admin', 'bursar', 'storekeeper'},
    'ingestion': {'admin', 'bursar', 'storekeeper'},
    'assets': {'admin', 'bursar'},
    'reports': {'admin'},
    'settings': {'admin'},
    'users': {'admin'},
}


def seed(apps, schema_editor):
    School = apps.get_model('core', 'School')
    RolePermission = apps.get_model('core', 'RolePermission')

    for school in School.objects.all():
        existing = set(
            RolePermission.objects.filter(school=school).values_list('role', 'module', 'action')
        )
        to_create = []
        for role in NON_PORTAL_ROLES:
            for module in MODULES:
                for action in ACTIONS:
                    if (role, module, action) in existing:
                        continue
                    if role == 'admin':
                        allowed = True
                    elif module == 'users':
                        allowed = False
                    elif action in READ_ACTIONS:
                        allowed = True
                    elif action in WRITE_ACTIONS:
                        allowed = role in WRITE_ROLES.get(module, set())
                    else:
                        allowed = False
                    to_create.append(RolePermission(
                        school=school, role=role, module=module, action=action, allowed=allowed,
                    ))
        RolePermission.objects.bulk_create(to_create)


def unseed(apps, schema_editor):
    # Non-destructive reverse: leave rows in place (they may have been edited).
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0004_rolepermission_userpermissionoverride'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
