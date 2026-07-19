"""Idempotent seed: default COA, account mappings, fee categories, grades,
academic + fiscal calendar, document sequences, bank accounts. --demo adds
sample students and a billed term for frontend development."""
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

# (code, name, report_group, currency, is_system)
COA = [
    # Cash & bank
    ('1000', 'Cash on Hand (USD)', 'current_assets', 'USD', True),
    ('1005', 'Cash on Hand (ZWG)', 'current_assets', 'ZWG', True),
    ('1010', 'Bank Account (USD)', 'current_assets', 'USD', True),
    ('1020', 'Bank Account (ZWG)', 'current_assets', 'ZWG', True),
    ('1030', 'Mobile Money (ZWG)', 'current_assets', 'ZWG', False),
    # Receivables
    ('1100', 'Accounts Receivable (USD)', 'current_assets', 'USD', True),
    ('1110', 'Accounts Receivable (ZWG)', 'current_assets', 'ZWG', True),
    # Inventory & prepayments
    ('1200', 'Inventory — Consumables', 'current_assets', '', True),
    ('1210', 'Inventory — Uniforms & Resale', 'current_assets', '', False),
    ('1300', 'Prepayments', 'current_assets', '', False),
    # Fixed assets
    ('1500', 'Land & Buildings', 'non_current_assets', '', False),
    ('1510', 'Motor Vehicles', 'non_current_assets', '', False),
    ('1520', 'Furniture & Fittings', 'non_current_assets', '', False),
    ('1530', 'Computers & ICT Equipment', 'non_current_assets', '', False),
    ('1540', 'Kitchen & Catering Equipment', 'non_current_assets', '', False),
    ('1550', 'Sports Equipment', 'non_current_assets', '', False),
    ('1600', 'Accum. Depreciation — Buildings', 'non_current_assets', '', False),
    ('1610', 'Accum. Depreciation — Motor Vehicles', 'non_current_assets', '', False),
    ('1620', 'Accum. Depreciation — Furniture', 'non_current_assets', '', False),
    ('1630', 'Accum. Depreciation — Computers', 'non_current_assets', '', False),
    ('1640', 'Accum. Depreciation — Kitchen', 'non_current_assets', '', False),
    ('1650', 'Accum. Depreciation — Sports', 'non_current_assets', '', False),
    # Payables & accruals
    ('2000', 'Accounts Payable (USD)', 'current_liabilities', 'USD', True),
    ('2010', 'Accounts Payable (ZWG)', 'current_liabilities', 'ZWG', True),
    ('2100', 'Goods Received Not Invoiced', 'current_liabilities', '', True),
    ('2110', 'Accrued Expenses', 'current_liabilities', '', False),
    ('2200', 'Deferred Fee Income (USD)', 'current_liabilities', 'USD', True),
    ('2210', 'Deferred Fee Income (ZWG)', 'current_liabilities', 'ZWG', True),
    ('2300', 'VAT Payable', 'current_liabilities', '', True),
    ('2310', 'PAYE Payable', 'current_liabilities', '', False),
    ('2320', 'NSSA Payable', 'current_liabilities', '', False),
    ('2500', 'Loans Payable', 'non_current_liabilities', '', False),
    # Equity
    ('3000', 'Accumulated Fund', 'equity', '', True),
    ('3900', 'Opening Balances', 'equity', '', True),
    # Income
    ('4000', 'Tuition Fees', 'fee_income', '', True),
    ('4010', 'Boarding Fees', 'fee_income', '', True),
    ('4020', 'Levy Income', 'fee_income', '', True),
    ('4030', 'Transport Fees', 'fee_income', '', True),
    ('4040', 'Examination Fees', 'fee_income', '', True),
    ('4050', 'Uniform Sales', 'fee_income', '', True),
    ('4060', 'Development Levy', 'fee_income', '', True),
    ('4500', 'Other Income', 'other_income', '', False),
    ('4510', 'Gain on Asset Disposal', 'other_income', '', True),
    ('4900', 'Foreign Exchange Gains', 'other_income', '', True),
    ('4950', 'Bursaries & Scholarships (contra)', 'fee_income', '', True),
    # Expenses
    ('5000', 'Salaries & Wages', 'operating_expenses', '', False),
    ('5100', 'Utilities (Water & Electricity)', 'operating_expenses', '', False),
    ('5110', 'Repairs & Maintenance', 'operating_expenses', '', False),
    ('5200', 'Food & Catering', 'operating_expenses', '', False),
    ('5210', 'Stationery & Teaching Materials', 'operating_expenses', '', False),
    ('5220', 'Sports & Activities', 'operating_expenses', '', False),
    ('5300', 'Transport & Fuel', 'operating_expenses', '', False),
    ('5400', 'Administration Expenses', 'administrative_expenses', '', False),
    ('5410', 'Communication & Internet', 'administrative_expenses', '', False),
    ('5500', 'Insurance', 'administrative_expenses', '', False),
    ('5600', 'Bank Charges', 'finance_costs', '', False),
    ('5700', 'Inventory Adjustments', 'operating_expenses', '', True),
    ('5720', 'Loss on Asset Disposal', 'operating_expenses', '', True),
    ('5800', 'Depreciation Expense', 'operating_expenses', '', True),
    ('5900', 'Foreign Exchange Losses', 'finance_costs', '', True),
]

MAPPINGS = [
    ('ar_control', 'USD', '1100'), ('ar_control', 'ZWG', '1110'),
    ('ap_control', 'USD', '2000'), ('ap_control', 'ZWG', '2010'),
    ('deferred_fee_income', 'USD', '2200'), ('deferred_fee_income', 'ZWG', '2210'),
    ('grni', '', '2100'),
    ('inventory_adjustment', '', '5700'),
    ('bursary_contra', '', '4950'),
    ('fx_gain_realized', '', '4900'), ('fx_loss_realized', '', '5900'),
    ('fx_gain_unrealized', '', '4900'), ('fx_loss_unrealized', '', '5900'),
    ('gain_on_disposal', '', '4510'), ('loss_on_disposal', '', '5720'),
    ('opening_balances', '', '3900'),
    ('accumulated_fund', '', '3000'),
    ('vat_payable', '', '2300'),
    ('rounding', '', '5700'),
]

FEE_CATEGORIES = [
    # (code, name, income, pocket_order)
    ('TUI', 'Tuition Fees', '4000', 1),
    ('BRD', 'Boarding Fees', '4010', 2),
    ('LVY', 'General Levy', '4020', 3),
    ('TRN', 'Transport', '4030', 4),
    ('EXM', 'Examination Fees', '4040', 5),
    ('UNI', 'Uniforms', '4050', 6),
    ('DEV', 'Development Levy', '4060', 7),
]

SEQUENCES = [
    ('JRN', 'JRN'), ('INV', 'INV'), ('RCT', 'RCT'), ('CRN', 'CRN'),
    ('PO', 'PO'), ('GRN', 'GRN'), ('BIL', 'BIL'), ('PAY', 'PAY'),
    ('AST', 'AST'), ('STU', 'STU'), ('SUP', 'SUP'), ('OPB', 'OPB'), ('ADJ', 'ADJ'), ('RUN', 'RUN'),
]

GRADES = (
    [('ECD A', 1, 'ecd'), ('ECD B', 2, 'ecd')]
    + [(f'Grade {i}', i + 2, 'primary') for i in range(1, 8)]
    + [(f'Form {i}', i + 9, 'secondary') for i in range(1, 7)]
)

BANKS = [
    ('CASH-USD', 'Cash Box (USD)', 'cash', '1000', 'USD', True),
    ('CASH-ZWG', 'Cash Box (ZWG)', 'cash', '1005', 'ZWG', False),
    ('BANK-USD', 'Main Bank (USD)', 'bank', '1010', 'USD', False),
    ('BANK-ZWG', 'Main Bank (ZWG)', 'bank', '1020', 'ZWG', True),
]


class Command(BaseCommand):
    help = 'Seed default chart of accounts, mappings, calendar and sequences.'

    def add_arguments(self, parser):
        parser.add_argument('--demo', action='store_true', help='Also create demo students and transactions.')

    @transaction.atomic
    def handle(self, *args, **options):
        from apps.accounting.models import (
            AccountMapping, BankAccount, ChartOfAccount, ExchangeRate, FiscalPeriod, FiscalYear,
        )
        from apps.core.models import DocumentSequence, SchoolSettings
        from apps.fees.models import FeeCategory
        from apps.students.models import AcademicYear, Grade, Term

        for doc_type, prefix in SEQUENCES:
            DocumentSequence.objects.get_or_create(doc_type=doc_type, defaults={'prefix': prefix})

        accounts = {}
        for code, name, group, currency, is_system in COA:
            account, _ = ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name, 'report_group': group, 'currency': currency,
                    'is_system': is_system,
                    'allow_manual_journal': code not in ('1100', '1110', '2000', '2010'),
                },
            )
            accounts[code] = account

        for purpose, currency, code in MAPPINGS:
            AccountMapping.objects.get_or_create(
                purpose=purpose, currency=currency, defaults={'account': accounts[code]}
            )

        for code, name, income, order in FEE_CATEGORIES:
            FeeCategory.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'income_account': accounts[income],
                    'deferred_account': accounts['2200'],
                    'pocket_order': order,
                },
            )

        for name, level, section in GRADES:
            Grade.objects.get_or_create(name=name, defaults={'level': level, 'section': section})

        year, _ = AcademicYear.objects.get_or_create(
            name='2026',
            defaults={'start_date': date(2026, 1, 13), 'end_date': date(2026, 12, 4), 'is_current': True},
        )
        terms = [
            (1, 'Term 1', date(2026, 1, 13), date(2026, 4, 9)),
            (2, 'Term 2', date(2026, 5, 5), date(2026, 8, 6)),
            (3, 'Term 3', date(2026, 9, 7), date(2026, 12, 3)),
        ]
        for number, name, start, end in terms:
            Term.objects.get_or_create(
                academic_year=year, number=number,
                defaults={'name': name, 'start_date': start, 'end_date': end, 'is_current': number == 2},
            )

        fiscal_year, created = FiscalYear.objects.get_or_create(
            name='FY2026', defaults={'start_date': date(2026, 1, 1), 'end_date': date(2026, 12, 31)}
        )
        if created:
            for month in range(1, 13):
                start = date(2026, month, 1)
                end = date(2026, month + 1, 1) if month < 12 else date(2027, 1, 1)
                from datetime import timedelta

                FiscalPeriod.objects.create(
                    fiscal_year=fiscal_year, period_no=month,
                    start_date=start, end_date=end - timedelta(days=1),
                )

        ExchangeRate.objects.get_or_create(
            from_currency='ZWG', to_currency='USD', effective_date=date(2026, 1, 1),
            defaults={'rate': Decimal('0.037175'), 'source': 'seed'},
        )

        for code, name, acc_type, gl_code, currency, is_default in BANKS:
            BankAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name, 'account_type': acc_type, 'gl_account': accounts[gl_code],
                    'currency': currency, 'is_default': is_default,
                },
            )

        settings_obj = SchoolSettings.get()
        if settings_obj.current_academic_year_id is None:
            settings_obj.current_academic_year = year
            settings_obj.save()

        self.stdout.write(self.style.SUCCESS('Seed complete.'))

        if options['demo']:
            self._seed_demo(year)

    def _seed_demo(self, year):
        from apps.accounting.models import BankAccount
        from apps.core.models import DocumentSequence
        from apps.fees.models import BillingRun, FeeStructure
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

        from apps.fees.models import FeeCategory

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
                    'code': DocumentSequence.next_for('STU'),
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
                number=DocumentSequence.next_for('RUN'),
                term=term, currency='USD',
                date=date(2026, 1, 15), due_date=date(2026, 2, 15),
            )
        if run.status != 'completed':
            execute_billing_run(run.pk)

        # A couple of receipts against the first student
        student = Student.objects.filter(fee_invoices__isnull=False).first()
        if student and not student.receipts.exists():
            bank = BankAccount.objects.get(code='BANK-USD')
            create_receipt(
                student=student, bank_account=bank, amount=Decimal('200'),
                date=date(2026, 2, 1), payment_method='bank_transfer', reference='DEMO-001',
            )

        self.stdout.write(self.style.SUCCESS('Demo data created.'))
