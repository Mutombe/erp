"""Create a new School (tenant) under the Golden Knot organization and
provision its chart of accounts, mappings, sequences, calendar and banks."""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify


class Command(BaseCommand):
    help = 'Create and provision a new school: create_school <CODE> <Name...>'

    def add_arguments(self, parser):
        parser.add_argument('code', help='Short unique school code, e.g. KNS')
        parser.add_argument('name', nargs='+', help='School name, e.g. Kingsknot Academy')

    @transaction.atomic
    def handle(self, *args, **options):
        from apps.core.models import Organization, School
        from apps.core.provisioning import provision_school

        code = options['code'].upper()
        name = ' '.join(options['name'])

        if School.objects.filter(code=code).exists():
            raise CommandError(f'A school with code {code} already exists.')

        org = Organization.get()
        slug = slugify(name) or slugify(code)
        base_slug, i = slug, 2
        while School.objects.filter(slug=slug).exists():
            slug = f'{base_slug}-{i}'
            i += 1

        school = School.objects.create(
            organization=org, code=code, slug=slug, name=name,
            base_currency='USD', secondary_currency='ZWG',
        )
        provision_school(school)
        self.stdout.write(self.style.SUCCESS(f'Created and provisioned school {code} — {name}.'))
