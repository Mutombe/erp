"""Idempotent seed: ensure the Golden Knot organization and a default
Oceanwaves school exist, then provision that school (COA, mappings, calendar,
sequences, banks). --demo adds sample students and a billed term."""
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Seed Golden Knot + the default Oceanwaves school (COA, mappings, calendar, sequences).'

    def add_arguments(self, parser):
        parser.add_argument('--demo', action='store_true', help='Also create demo students and transactions.')

    @transaction.atomic
    def handle(self, *args, **options):
        from apps.core.models import Organization, School
        from apps.core.provisioning import provision_school

        org = Organization.get()
        school, _ = School.objects.get_or_create(
            code='OCW',
            defaults={
                'organization': org,
                'slug': 'oceanwaves',
                'name': 'Oceanwaves Schools',
                'base_currency': 'USD',
                'secondary_currency': 'ZWG',
            },
        )
        year = provision_school(school)

        self.stdout.write(self.style.SUCCESS(f'Seed complete for {school.code} — {school.name}.'))

        if options['demo']:
            self._seed_demo(school, year)

    def _seed_demo(self, school, year):
        from apps.accounting.models import BankAccount
        from apps.core.models import DocumentSequence
        from apps.fees.models import BillingRun, FeeCategory, FeeStructure
        from apps.fees.services import create_receipt, execute_billing_run
        from apps.students.models import ClassRoom, Enrollment, Grade, Guardian, Student, StudentGuardian, Term

        term = Term.objects.get(academic_year=year, number=1)
        grade1 = Grade.objects.get(name='Grade 1')
        form1 = Grade.objects.get(name='Form 1')

        class_g1, _ = ClassRoom.objects.get_or_create(
            name='Grade 1 Red', academic_year=year, defaults={'grade': grade1, 'teacher_name': 'Mrs Moyo'}
        )
        class_f1, _ = ClassRoom.objects.get_or_create(
            name='Form 1 Blue', academic_year=year, defaults={'grade': form1, 'teacher_name': 'Mr Ncube'}
        )

        tui = FeeCategory.objects.get(code='TUI')
        lvy = FeeCategory.objects.get(code='LVY')
        for grade, tuition in [(grade1, Decimal('250')), (form1, Decimal('400'))]:
            FeeStructure.objects.get_or_create(
                term=term, grade=grade, fee_category=tui, currency='USD', applies_to='all',
                defaults={'academic_year': year, 'amount': tuition},
            )
            FeeStructure.objects.get_or_create(
                term=term, grade=grade, fee_category=lvy, currency='USD', applies_to='all',
                defaults={'academic_year': year, 'amount': Decimal('50')},
            )

        demo_students = [
            ('Tinashe', 'Chirwa', class_g1, 'Grace', 'Chirwa'),
            ('Rudo', 'Moyo', class_g1, 'Blessing', 'Moyo'),
            ('Tatenda', 'Ncube', class_f1, 'Peter', 'Ncube'),
            ('Chipo', 'Dube', class_f1, 'Mary', 'Dube'),
        ]
        for first, last, class_room, g_first, g_last in demo_students:
            student, created = Student.objects.get_or_create(
                first_name=first, last_name=last,
                defaults={
                    'code': DocumentSequence.next_for('STU', school),
                    'admission_date': date(2026, 1, 13),
                    'status': 'enrolled',
                },
            )
            if created:
                guardian = Guardian.objects.create(
                    code=f'G-{student.code}', first_name=g_first, last_name=g_last,
                    phone='+263771234567',
                )
                StudentGuardian.objects.create(
                    student=student, guardian=guardian, relationship='guardian',
                    is_primary_contact=True, is_billing_contact=True,
                )
                Enrollment.objects.create(
                    student=student, academic_year=year, class_room=class_room,
                    enrolled_date=date(2026, 1, 13),
                )

        run = BillingRun.objects.filter(term=term, currency='USD').first()
        if run is None:
            run = BillingRun.objects.create(
                number=DocumentSequence.next_for('RUN', school),
                term=term, currency='USD',
                date=date(2026, 1, 15), due_date=date(2026, 2, 15),
            )
        if run.status != 'completed':
            execute_billing_run(run.pk)

        student = Student.objects.filter(fee_invoices__isnull=False).first()
        if student and not student.receipts.exists():
            bank = BankAccount.objects.get(school=school, code='BANK-USD')
            create_receipt(
                student=student, bank_account=bank, amount=Decimal('200'),
                date=date(2026, 2, 1), payment_method='bank_transfer', reference='DEMO-001',
            )

        self.stdout.write(self.style.SUCCESS('Demo data created.'))
