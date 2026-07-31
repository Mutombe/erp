from django.db import migrations

# Document sequences every school needs. Newer ones (TRF, REQ) were added after
# some schools were provisioned, so backfill any that are missing.
SEQUENCES = [
    ('JRN', 'JRN'), ('INV', 'INV'), ('RCT', 'RCT'), ('CRN', 'CRN'),
    ('PO', 'PO'), ('GRN', 'GRN'), ('BIL', 'BIL'), ('PAY', 'PAY'),
    ('AST', 'AST'), ('STU', 'STU'), ('SUP', 'SUP'), ('OPB', 'OPB'),
    ('ADJ', 'ADJ'), ('RUN', 'RUN'), ('TCH', 'TCH'), ('TRF', 'TRF'), ('REQ', 'REQ'),
]


def backfill(apps, schema_editor):
    DocumentSequence = apps.get_model('core', 'DocumentSequence')
    School = apps.get_model('core', 'School')
    for school in School.objects.all():
        for doc_type, prefix in SEQUENCES:
            DocumentSequence.objects.get_or_create(
                school=school, doc_type=doc_type,
                defaults={'prefix': prefix, 'padding': 5, 'next_number': 1},
            )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [('core', '0005_seed_permissions')]
    operations = [migrations.RunPython(backfill, noop)]
