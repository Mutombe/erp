"""Comprehensive demo-data seeder for the School ERP.

Populates every module with realistic, internally-consistent data so ALL
reports render meaningful numbers (Trial Balance, Balance Sheet, Income
Statement, Cash Flow, Aged Debtors/Creditors, Cashbook, Fee Collection, Asset
Register, Stock Valuation, Department Consumption, Dashboard).

Correctness contract: financial transactions are ONLY created through the
service layer / model ``post()`` methods (never hand-written GL/JournalLine
rows), so the books always balance by construction.

Determinism: all randomness flows from a single ``random.Random(42)`` so
re-runs are reproducible.

Usage:
    python manage.py seed_demo            # build (refuses if demo data exists)
    python manage.py seed_demo --reset    # wipe demo/transactional rows, rebuild
"""
import random
from datetime import date, timedelta
from decimal import Decimal

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db.models import Sum

ZERO = Decimal('0')
TWO = Decimal('0.01')

# Hard-coded Zimbabwean name pools (combined for variety).
FIRST_NAMES = [
    'Tinashe', 'Rudo', 'Tatenda', 'Chipo', 'Farai', 'Nyasha', 'Tapiwa', 'Kudakwashe',
    'Rutendo', 'Blessing', 'Panashe', 'Tanaka', 'Anesu', 'Simba', 'Munyaradzi',
    'Chiedza', 'Takudzwa', 'Vimbai', 'Tafara', 'Ropafadzo', 'Tadiwa', 'Mukudzei',
    'Nokutenda', 'Kupakwashe', 'Tawanda', 'Shamiso', 'Rumbidzai', 'Tendai',
    'Fadzai', 'Garikai', 'Mazvita', 'Tsitsi', 'Wadzanai', 'Batsirai', 'Nyaradzo',
    'Tariro', 'Kundai', 'Ngonidzashe', 'Rufaro', 'Chenai', 'Michelle', 'Brian',
    'Prosper', 'Gift', 'Praise', 'Emmanuel', 'Precious', 'Faith', 'Trust', 'Melody',
]
LAST_NAMES = [
    'Moyo', 'Ncube', 'Dube', 'Chirwa', 'Sibanda', 'Nkomo', 'Mpofu', 'Ndlovu',
    'Mabhena', 'Chibaya', 'Marufu', 'Gumbo', 'Mutasa', 'Chikoto', 'Madziva',
    'Mangwana', 'Chinamasa', 'Zvobgo', 'Mujuru', 'Sithole', 'Banda', 'Phiri',
    'Mudenda', 'Chigumba', 'Makoni', 'Mutsvangwa', 'Chirwa', 'Nyathi', 'Bhebhe',
]

# Grade name -> (term tuition, section).  Exam/boarding derived from section.
GRADE_PLAN = [
    ('ECD A', Decimal('180')),
    ('Grade 1', Decimal('250')),
    ('Grade 3', Decimal('280')),
    ('Grade 5', Decimal('300')),
    ('Grade 7', Decimal('320')),
    ('Form 1', Decimal('380')),
    ('Form 2', Decimal('420')),
    ('Form 4', Decimal('480')),
    ('Form 6', Decimal('520')),
]
EXAM_GRADES = {'Grade 7', 'Form 4', 'Form 6'}
TEACHERS = [
    'Mrs Moyo', 'Mr Ncube', 'Ms Dube', 'Mr Sibanda', 'Mrs Chirwa', 'Mr Mpofu',
    'Ms Ndlovu', 'Mr Gumbo', 'Mrs Sithole',
]

# ItemCategory -> (inventory acct, consumption expense acct)
ITEM_CATEGORIES = [
    ('Stationery', '1200', '5210'),
    ('Farm Supplies', '1200', '5230'),
    ('Sports Equipment', '1200', '5220'),
    ('Kitchen/Food', '1200', '5200'),
    ('Cleaning', '1200', '5100'),
]

# AssetCategory -> (name, asset acct, accum acct, expense acct, life_months, residual %)
ASSET_CATEGORIES = [
    ('MV', 'Motor Vehicles', '1510', '1610', '5800', 60, Decimal('10')),
    ('FURN', 'Furniture & Fittings', '1520', '1620', '5800', 120, Decimal('5')),
    ('COMP', 'Computers & ICT', '1530', '1630', '5800', 36, Decimal('5')),
    ('KITC', 'Kitchen Equipment', '1540', '1640', '5800', 60, Decimal('5')),
    ('SPRT', 'Sports Equipment', '1550', '1650', '5800', 36, Decimal('0')),
]


class Command(BaseCommand):
    help = 'Seed a full, internally-consistent demo dataset across every module.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true',
                            help='Wipe demo/transactional rows first, then rebuild from a clean base seed.')

    def handle(self, *args, **options):
        # Best-effort UTF-8 console so the ✓/✗ summary renders on Windows too.
        try:
            import sys
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
        except Exception:
            pass

        self.rng = random.Random(42)
        self.counts = {}

        # Ensure the base seed (COA, mappings, categories, grades, calendar,
        # sequences, departments, banks) exists. Idempotent.
        call_command('seed_school')

        from apps.students.models import Student

        if options['reset']:
            self._reset()
        elif Student.objects.exists():
            self.stdout.write(self.style.WARNING(
                'Demo data already exists. Re-run with --reset to wipe and rebuild:\n'
                '    python manage.py seed_demo --reset'
            ))
            return

        self._build()
        self._print_summary()

    # ------------------------------------------------------------------ reset
    def _reset(self):
        """Hard-delete every transactional + demo-master row, returning the DB to
        a fresh base-seed state. Deletion order is FK-safe.

        NOTE: Hard-deleting GeneralLedger / journals is acceptable HERE because
        this is DEMO data cleanup, not real ledger history. In production the
        ledger is append-only (reverse, never delete)."""
        from apps.accounting.models import (
            BankAccount, BankReconciliation, BankStatement, BankStatementLine,
            ChartOfAccount, GeneralLedger, Journal, JournalLine, OpeningBalance,
            ReconciliationItem, SubAccount, SubAccountTransaction,
        )
        from apps.assets.models import Asset, AssetCategory, DepreciationEntry, DepreciationRun
        from apps.fees.models import (
            BillingRun, BursaryAward, CreditNote, CreditNoteLine, FeeInvoice,
            FeeInvoiceLine, Receipt, ReceiptAllocation,
        )
        from apps.inventory.models import Item, StockLevel, StockMove
        from apps.procurement.models import (
            GoodsReceivedNote, GRNLine, PaymentAllocation, POLine, PurchaseOrder,
            Supplier, SupplierPayment, VendorBill, VendorBillLine,
        )
        from apps.students.models import (
            ClassRoom, Enrollment, Guardian, Student, StudentGuardian,
        )
        from apps.fees.models import FeeStructure

        # Ordered so each model is removed before anything that PROTECT-references it.
        # QuerySet.delete() issues bulk SQL (it does NOT call the model.delete()
        # override), so the GeneralLedger immutability guard is bypassed here.
        deletion_order = [
            ('GeneralLedger', GeneralLedger),
            ('SubAccountTransaction', SubAccountTransaction),
            ('ReceiptAllocation', ReceiptAllocation),
            ('PaymentAllocation', PaymentAllocation),
            ('Receipt', Receipt),
            ('CreditNoteLine', CreditNoteLine),
            ('CreditNote', CreditNote),
            ('FeeInvoiceLine', FeeInvoiceLine),
            ('FeeInvoice', FeeInvoice),
            ('BillingRun', BillingRun),
            ('BursaryAward', BursaryAward),
            ('DepreciationEntry', DepreciationEntry),
            ('DepreciationRun', DepreciationRun),
            ('Asset', Asset),
            ('AssetCategory', AssetCategory),
            ('StockMove', StockMove),
            ('StockLevel', StockLevel),
            ('VendorBillLine', VendorBillLine),
            ('VendorBill', VendorBill),
            ('GRNLine', GRNLine),
            ('GoodsReceivedNote', GoodsReceivedNote),
            ('POLine', POLine),
            ('PurchaseOrder', PurchaseOrder),
            ('SupplierPayment', SupplierPayment),
            ('Supplier', Supplier),
            ('Item', Item),
            ('OpeningBalance', OpeningBalance),
            # Bank reconciliation rows PROTECT-reference journal lines.
            ('ReconciliationItem', ReconciliationItem),
            ('BankReconciliation', BankReconciliation),
            ('BankStatementLine', BankStatementLine),
            ('BankStatement', BankStatement),
            ('JournalLine', JournalLine),
            ('Journal', Journal),
            ('SubAccount', SubAccount),
            ('Enrollment', Enrollment),
            ('StudentGuardian', StudentGuardian),
            ('Student', Student),
            ('Guardian', Guardian),
            ('ClassRoom', ClassRoom),
            ('FeeStructure', FeeStructure),
        ]

        cleared = {}
        for name, model in deletion_order:
            try:
                deleted, _ = model.objects.all().delete()
                if deleted:
                    cleared[name] = deleted
            except Exception as exc:  # pragma: no cover - defensive per-model guard
                self.stdout.write(self.style.WARNING(f'  skip {name}: {exc}'))

        # Zero the lifetime running balances the deleted journals had accumulated.
        ChartOfAccount.objects.update(current_balance=Decimal('0.00'))
        BankAccount.objects.update(book_balance=Decimal('0.00'), bank_balance=Decimal('0.00'))

        self.stdout.write(self.style.MIGRATE_HEADING('Reset — cleared:'))
        if cleared:
            for name, n in cleared.items():
                self.stdout.write(f'  {name}: {n}')
        else:
            self.stdout.write('  (nothing to clear)')
        self.stdout.write('  ChartOfAccount.current_balance / BankAccount balances -> 0')

    # ------------------------------------------------------------------ build
    def _build(self):
        self.stdout.write(self.style.MIGRATE_HEADING('Building demo dataset...'))
        self._exchange_rates()
        self._inventory_masters()
        self._suppliers()
        self._items()
        self._asset_categories()
        self._classrooms()
        self._students_and_guardians()
        self._fee_structures()
        self._bursaries()
        self._billing()
        self._receipts()
        self._credit_notes()
        self._procurement()
        self._stock_issues()
        self._assets_and_capitalization()
        self._depreciation()
        self._direct_expenses()
        self._extra_opening_balance()

    # -------- reference data
    def _exchange_rates(self):
        from apps.accounting.models import ExchangeRate

        for d, rate in [
            (date(2026, 1, 1), '0.037000'),
            (date(2026, 4, 1), '0.030000'),
            (date(2026, 7, 1), '0.025000'),
        ]:
            ExchangeRate.objects.get_or_create(
                from_currency='ZWG', to_currency='USD', effective_date=d,
                defaults={'rate': Decimal(rate), 'source': 'seed_demo'},
            )

    def _inventory_masters(self):
        from apps.accounting.models import ChartOfAccount
        from apps.inventory.models import ItemCategory, Warehouse

        self.item_categories = {}
        for name, inv_code, exp_code in ITEM_CATEGORIES:
            cat, _ = ItemCategory.objects.get_or_create(
                name=name,
                defaults={
                    'inventory_account': ChartOfAccount.objects.get(code=inv_code),
                    'consumption_expense_account': ChartOfAccount.objects.get(code=exp_code),
                },
            )
            self.item_categories[name] = cat

        self.warehouses = {}
        for code, name in [('MAIN', 'Main Store'), ('FARM', 'Farm Store')]:
            wh, _ = Warehouse.objects.get_or_create(code=code, defaults={'name': name})
            self.warehouses[code] = wh

    def _suppliers(self):
        from apps.core.models import DocumentSequence
        from apps.procurement.models import Supplier

        specs = [
            ('Bookworld Stationers', 'stationery'),
            ('AgriValley Farm Supplies', 'farm'),
            ('FreshFoods Catering', 'food'),
            ('ProSport Zimbabwe', 'sports'),
            ('TechHub ICT Solutions', 'ict'),
            ('Highfield General Traders', 'general'),
        ]
        self.suppliers = {}
        for name, key in specs:
            supplier = Supplier.objects.create(
                code=DocumentSequence.next_for('SUP'),
                name=name,
                contact_person=self.rng.choice(FIRST_NAMES) + ' ' + self.rng.choice(LAST_NAMES),
                phone=self._phone(),
                email=f'accounts@{key}.co.zw',
                default_currency='USD',
                payment_terms_days=30,
            )
            self.suppliers[key] = supplier
        self.counts['suppliers'] = len(self.suppliers)

    def _items(self):
        from apps.inventory.models import Item

        # (code, name, category, warehouse, reorder, is_procured)
        catalog = [
            ('FERT-01', 'Compound D Fertiliser (50kg)', 'Farm Supplies', 'FARM', 20, True),
            ('BALL-01', 'Match Soccer Balls', 'Sports Equipment', 'MAIN', 5, True),
            ('MEAL-01', 'Maize Meal (10kg)', 'Kitchen/Food', 'MAIN', 30, True),
            ('BOOK-01', 'Exercise Books (pack of 10)', 'Stationery', 'MAIN', 50, True),
            ('CLEAN-01', 'Multi-surface Detergent (5L)', 'Cleaning', 'MAIN', 10, True),
            ('PEN-01', 'Ballpoint Pens (box)', 'Stationery', 'MAIN', 40, False),
            ('CHALK-01', 'White Chalk (box)', 'Stationery', 'MAIN', 25, False),
            ('SEED-01', 'Maize Seed (10kg)', 'Farm Supplies', 'FARM', 10, False),
            ('PEST-01', 'Pesticide Concentrate (1L)', 'Farm Supplies', 'FARM', 8, False),
            ('CONE-01', 'Training Cones (set)', 'Sports Equipment', 'MAIN', 4, False),
            ('OIL-01', 'Cooking Oil (2L)', 'Kitchen/Food', 'MAIN', 20, False),
            ('MOP-01', 'Floor Mops', 'Cleaning', 'MAIN', 6, False),
        ]
        self.items = {}
        self.procured_items = []
        for code, name, cat_name, wh_code, reorder, procured in catalog:
            item = Item.objects.create(
                code=code, name=name,
                category=self.item_categories[cat_name],
                reorder_level=Decimal(reorder),
            )
            self.items[code] = item
            if procured:
                self.procured_items.append((item, wh_code))
        self.counts['items'] = len(self.items)

    def _asset_categories(self):
        from apps.accounting.models import ChartOfAccount
        from apps.assets.models import AssetCategory

        self.asset_categories = {}
        for code, name, a_code, accum_code, exp_code, life, residual in ASSET_CATEGORIES:
            cat = AssetCategory.objects.create(
                code=code, name=name,
                depreciation_method='straight_line',
                useful_life_months=life,
                residual_rate=residual,
                asset_account=ChartOfAccount.objects.get(code=a_code),
                accum_depr_account=ChartOfAccount.objects.get(code=accum_code),
                depr_expense_account=ChartOfAccount.objects.get(code=exp_code),
            )
            self.asset_categories[code] = cat

    # -------- academic + students
    def _classrooms(self):
        from apps.students.models import AcademicYear, ClassRoom, Grade

        self.year = AcademicYear.objects.get(name='2026')
        self.classrooms = {}  # grade_name -> ClassRoom
        stream_colours = ['Red', 'Blue', 'Green', 'Gold', 'Silver']
        for i, (grade_name, _tuition) in enumerate(GRADE_PLAN):
            grade = Grade.objects.get(name=grade_name)
            colour = stream_colours[i % len(stream_colours)]
            room, _ = ClassRoom.objects.get_or_create(
                name=f'{grade_name} {colour}', academic_year=self.year,
                defaults={'grade': grade, 'teacher_name': TEACHERS[i % len(TEACHERS)]},
            )
            self.classrooms[grade_name] = room

    def _students_and_guardians(self):
        from apps.core.models import DocumentSequence
        from apps.students.models import Enrollment, Guardian, Student, StudentGuardian

        self.guardians = []
        self.enrolled_students = []
        guardian_seq = [0]

        def make_guardian(last_name):
            guardian_seq[0] += 1
            g = Guardian.objects.create(
                code=f'GRD{guardian_seq[0]:04d}',
                first_name=self.rng.choice(FIRST_NAMES),
                last_name=last_name,
                phone=self._phone(),
                email=f'{last_name.lower()}{guardian_seq[0]}@example.co.zw',
                national_id=f'63-{self.rng.randint(1000000, 1999999)}A{self.rng.randint(10, 99)}',
            )
            self.guardians.append(g)
            return g

        self.sibling_reuse = 0
        # 5 enrolled students per grade (9 grades = 45 enrolled).
        for grade_name, _tuition in GRADE_PLAN:
            room = self.classrooms[grade_name]
            grade = room.grade
            for _ in range(5):
                first = self.rng.choice(FIRST_NAMES)
                # Siblings: sometimes reuse an existing guardian (shared billing).
                if self.guardians and self.rng.random() < 0.16:
                    guardian = self.rng.choice(self.guardians)
                    last = guardian.last_name
                    self.sibling_reuse += 1
                else:
                    last = self.rng.choice(LAST_NAMES)
                    guardian = make_guardian(last)

                boarder = grade.section == 'secondary' and self.rng.random() < 0.4
                attendance = 'boarder' if boarder else 'day'
                admission = date(2026, 1, 13) + timedelta(days=self.rng.randint(0, 5))
                student = Student.objects.create(
                    code=DocumentSequence.next_for('STU'),
                    first_name=first, last_name=last,
                    gender=self.rng.choice(['male', 'female']),
                    admission_date=admission,
                    status='enrolled',
                    attendance_type=attendance,
                )
                StudentGuardian.objects.create(
                    student=student, guardian=guardian,
                    relationship=self.rng.choice(['father', 'mother', 'guardian']),
                    is_primary_contact=True, is_billing_contact=True,
                )
                Enrollment.objects.create(
                    student=student, academic_year=self.year, class_room=room,
                    enrolled_date=admission, attendance_type=attendance, status='active',
                )
                self.enrolled_students.append(student)

        # ~4 applicants (admissions pipeline) — NOT enrolled, NOT billed.
        for _ in range(4):
            last = self.rng.choice(LAST_NAMES)
            student = Student.objects.create(
                code=DocumentSequence.next_for('STU'),
                first_name=self.rng.choice(FIRST_NAMES), last_name=last,
                gender=self.rng.choice(['male', 'female']),
                admission_date=date(2026, 6, 1) + timedelta(days=self.rng.randint(0, 20)),
                status='applicant',
                attendance_type='day',
            )
            make_guardian(last)  # applicant still has a guardian contact

        self.counts['students'] = Student.objects.count()
        self.counts['enrolled'] = len(self.enrolled_students)
        self.counts['applicants'] = 4
        self.counts['guardians'] = len(self.guardians)

    def _fee_structures(self):
        from apps.fees.models import FeeCategory, FeeStructure
        from apps.students.models import Grade, Term

        tui = FeeCategory.objects.get(code='TUI')
        lvy = FeeCategory.objects.get(code='LVY')
        exm = FeeCategory.objects.get(code='EXM')
        brd = FeeCategory.objects.get(code='BRD')

        terms = [Term.objects.get(academic_year=self.year, number=n) for n in (1, 2)]
        for term in terms:
            for grade_name, tuition in GRADE_PLAN:
                grade = Grade.objects.get(name=grade_name)
                FeeStructure.objects.get_or_create(
                    term=term, grade=grade, fee_category=tui, currency='USD', applies_to='all',
                    defaults={'academic_year': self.year, 'amount': tuition},
                )
                FeeStructure.objects.get_or_create(
                    term=term, grade=grade, fee_category=lvy, currency='USD', applies_to='all',
                    defaults={'academic_year': self.year, 'amount': Decimal('50')},
                )
                if grade_name in EXAM_GRADES:
                    FeeStructure.objects.get_or_create(
                        term=term, grade=grade, fee_category=exm, currency='USD', applies_to='all',
                        defaults={'academic_year': self.year, 'amount': Decimal('30')},
                    )
                if grade.section == 'secondary':
                    FeeStructure.objects.get_or_create(
                        term=term, grade=grade, fee_category=brd, currency='USD', applies_to='boarder',
                        defaults={'academic_year': self.year, 'amount': Decimal('600')},
                    )

    def _bursaries(self):
        from apps.fees.models import BursaryAward, FeeCategory

        tui = FeeCategory.objects.get(code='TUI')
        # 3 students on a 50% tuition bursary (created BEFORE billing so the
        # discount flows into invoice lines and the bursary contra posts).
        chosen = self.rng.sample(self.enrolled_students, 3)
        for student in chosen:
            BursaryAward.objects.create(
                student=student, fee_category=tui, academic_year=self.year,
                award_type='percent', value=Decimal('50'),
                funder='Alumni Trust Fund', is_active=True,
            )
        self.counts['bursaries'] = 3

    def _billing(self):
        from apps.core.models import DocumentSequence
        from apps.fees.models import BillingRun
        from apps.fees.services import execute_billing_run
        from apps.students.models import Term

        self.billing_runs = {}
        for number, term_no, run_date, due in [
            (1, 1, date(2026, 1, 15), date(2026, 2, 15)),
            (2, 2, date(2026, 5, 6), date(2026, 6, 6)),
        ]:
            term = Term.objects.get(academic_year=self.year, number=term_no)
            run = BillingRun.objects.create(
                number=DocumentSequence.next_for('RUN'),
                term=term, currency='USD', date=run_date, due_date=due,
            )
            execute_billing_run(run.pk)
            run.refresh_from_db()
            self.billing_runs[term_no] = run

        from apps.fees.models import FeeInvoice
        self.counts['invoices'] = FeeInvoice.objects.count()

    def _receipts(self):
        from apps.accounting.models import BankAccount
        from apps.fees.models import FeeInvoice
        from apps.fees.services import create_receipt

        bank_usd = BankAccount.objects.get(code='BANK-USD')
        cash_usd = BankAccount.objects.get(code='CASH-USD')
        methods = ['cash', 'bank_transfer', 'ecocash']

        # (term_no, run_date_window, full_prob, partial_prob)
        windows = {
            1: (date(2026, 2, 1), date(2026, 3, 25), 0.55, 0.25),
            2: (date(2026, 5, 10), date(2026, 7, 15), 0.40, 0.25),
        }
        receipts = 0
        for term_no, (win_start, win_end, full_p, part_p) in windows.items():
            run = self.billing_runs[term_no]
            invoices = FeeInvoice.objects.filter(billing_run=run).select_related('student')
            for invoice in invoices:
                roll = self.rng.random()
                if roll < full_p:
                    amount = invoice.total
                elif roll < full_p + part_p:
                    frac = Decimal(str(self.rng.choice([0.3, 0.5, 0.6])))
                    amount = (invoice.total * frac).quantize(TWO)
                else:
                    continue  # unpaid — feeds aged debtors
                if amount <= 0:
                    continue
                rdate = self._rand_date(win_start, win_end)
                # Mostly bank, occasionally the cash box.
                bank = cash_usd if self.rng.random() < 0.2 else bank_usd
                method = 'cash' if bank == cash_usd else self.rng.choice(methods)
                create_receipt(
                    student=invoice.student, bank_account=bank, amount=amount,
                    date=rdate, payment_method=method,
                    payer_guardian=invoice.student.guardians.first(),
                    reference=f'PAY-{invoice.number}',
                )
                receipts += 1
        self.counts['receipts'] = receipts

    def _credit_notes(self):
        from apps.core.models import DocumentSequence
        from apps.fees.models import CreditNote, CreditNoteLine, FeeCategory, FeeInvoice

        lvy = FeeCategory.objects.get(code='LVY')
        # Two fee adjustments on invoices that still carry a balance.
        candidates = list(
            FeeInvoice.objects.filter(status__in=['posted', 'partial'])
            .order_by('id')
        )
        made = 0
        for invoice in candidates:
            if made >= 2:
                break
            if invoice.balance < Decimal('40'):
                continue
            note = CreditNote.objects.create(
                number=DocumentSequence.next_for('CRN'),
                student=invoice.student, invoice=invoice,
                date=self._rand_date(date(2026, 6, 1), date(2026, 7, 10)),
                currency='USD',
                reason='Levy adjustment — approved fee waiver',
            )
            CreditNoteLine.objects.create(credit_note=note, fee_category=lvy, amount=Decimal('30'))
            note.post()
            made += 1
        self.counts['credit_notes'] = made

    # -------- procurement + inventory
    def _procurement(self):
        from apps.core.models import DocumentSequence
        from apps.procurement.models import (
            create_supplier_payment, GoodsReceivedNote, GRNLine, POLine,
            PurchaseOrder, VendorBill, VendorBillLine,
        )

        # item code -> (supplier key, po qty, unit price)
        flow = {
            'FERT-01': ('farm', Decimal('100'), Decimal('22.00')),
            'BALL-01': ('sports', Decimal('30'), Decimal('18.50')),
            'MEAL-01': ('food', Decimal('200'), Decimal('9.75')),
            'BOOK-01': ('stationery', Decimal('150'), Decimal('12.40')),
            'CLEAN-01': ('general', Decimal('40'), Decimal('15.00')),
        }
        # settlement plan per flow index: full / partial / unpaid
        settlement = ['full', 'full', 'partial', 'unpaid', 'unpaid']

        self.counts['pos'] = 0
        self.counts['grns'] = 0
        self.counts['bills'] = 0
        self.counts['payments'] = 0

        for idx, (item, wh_code) in enumerate(self.procured_items):
            supplier_key, qty, price = flow[item.code]
            supplier = self.suppliers[supplier_key]
            warehouse = self.warehouses[wh_code]
            po_date = date(2026, 2, 5) + timedelta(days=idx * 18)

            po = PurchaseOrder.objects.create(
                number=DocumentSequence.next_for('PO'),
                supplier=supplier, date=po_date,
                expected_date=po_date + timedelta(days=10),
                currency='USD', status='draft',
            )
            po_line = POLine.objects.create(po=po, item=item, quantity=qty, unit_price=price)
            po.approve()
            self.counts['pos'] += 1

            grn = GoodsReceivedNote.objects.create(
                number=DocumentSequence.next_for('GRN'),
                po=po, warehouse=warehouse,
                date=po_date + timedelta(days=7),
            )
            grn_line = GRNLine.objects.create(grn=grn, po_line=po_line, quantity=qty)
            grn.post()
            self.counts['grns'] += 1

            bill_date = grn.date + timedelta(days=2)
            bill = VendorBill.objects.create(
                number=DocumentSequence.next_for('BIL'),
                supplier=supplier, supplier_reference=f'INV-{supplier.code}-{idx+1}',
                po=po, date=bill_date, due_date=bill_date + timedelta(days=30),
                currency='USD',
            )
            VendorBillLine.objects.create(
                bill=bill, grn_line=grn_line, item=item,
                description=item.name, quantity=qty, unit_price=price,
            )
            bill.post()
            bill.refresh_from_db()
            self.counts['bills'] += 1

            # Settlement drives aged creditors (leave some bills open).
            mode = settlement[idx]
            if mode == 'unpaid':
                continue
            pay_amount = bill.total if mode == 'full' else (bill.total * Decimal('0.5')).quantize(TWO)
            create_supplier_payment(
                supplier=supplier,
                bank_account=self._bank('BANK-USD'),
                amount=pay_amount,
                date=bill_date + timedelta(days=self.rng.randint(10, 25)),
                reference=f'EFT-{bill.number}',
            )
            self.counts['payments'] += 1

    def _stock_issues(self):
        from apps.inventory.models import Department, issue_stock

        # item code -> (department code, [issue quantities across dates])
        plan = {
            'FERT-01': ('AGRI', [Decimal('20'), Decimal('15'), Decimal('25')]),
            'BALL-01': ('SPRT', [Decimal('4'), Decimal('3'), Decimal('5')]),
            'MEAL-01': ('KITC', [Decimal('40'), Decimal('35'), Decimal('50')]),
            'BOOK-01': ('ACAD', [Decimal('30'), Decimal('25'), Decimal('40')]),
            'CLEAN-01': ('MAINT', [Decimal('6'), Decimal('5'), Decimal('8')]),
        }
        issue_dates = [date(2026, 3, 20), date(2026, 5, 15), date(2026, 6, 25)]
        issues = 0
        for item, wh_code in self.procured_items:
            dept_code, quantities = plan[item.code]
            department = Department.objects.get(code=dept_code)
            warehouse = self.warehouses[wh_code]
            for qty, idate in zip(quantities, issue_dates):
                issue_stock(
                    item=item, warehouse=warehouse, quantity=qty, date=idate,
                    department=department, reason=f'Issue to {department.name}',
                )
                issues += 1
        self.counts['stock_issues'] = issues

    # -------- assets + depreciation
    def _assets_and_capitalization(self):
        from apps.accounting.models import OpeningBalance
        from apps.core.models import DocumentSequence
        from apps.assets.models import Asset

        # (name, category code, cost)
        asset_specs = [
            ('School Bus (65-seater)', 'MV', Decimal('45000.00')),
            ('Staff Minibus (18-seater)', 'MV', Decimal('28000.00')),
            ('Classroom Desks (set of 40)', 'FURN', Decimal('6000.00')),
            ('Computer Lab (25 workstations)', 'COMP', Decimal('15000.00')),
            ('Kitchen Catering Equipment', 'KITC', Decimal('8000.00')),
            ('Sports Field Equipment', 'SPRT', Decimal('3500.00')),
        ]
        acq = date(2026, 1, 10)
        self.assets = []
        for name, cat_code, cost in asset_specs:
            cat = self.asset_categories[cat_code]
            residual = (cost * cat.residual_rate / Decimal('100')).quantize(TWO)
            asset = Asset.objects.create(
                code=DocumentSequence.next_for('AST'),
                name=name, category=cat,
                acquisition_date=acq, in_service_date=acq,
                cost=cost, currency='USD', cost_base=cost,
                residual_value=residual, status='active',
            )
            self.assets.append(asset)
            # Capitalize onto the books as a takeover balance: Dr asset / Cr 3900.
            # Keeps the balance sheet's fixed-asset section meaningful while the
            # ledger stays balanced by construction.
            ob = OpeningBalance.objects.create(
                number=DocumentSequence.next_for('OPB'),
                date=date(2026, 1, 1),
                target_account=cat.asset_account,
                direction='debit', amount=cost, currency='USD',
                description=f'Opening capitalization: {name}',
            )
            ob.post()
        self.counts['assets'] = len(self.assets)

    def _depreciation(self):
        from apps.accounting.models import FiscalPeriod, FiscalYear
        from apps.assets.services import run_depreciation

        fy = FiscalYear.objects.get(name='FY2026')
        runs = 0
        for period_no in range(1, 7):  # Jan..Jun
            period = FiscalPeriod.objects.get(fiscal_year=fy, period_no=period_no)
            run_depreciation(period)
            runs += 1
        self.counts['depreciation_runs'] = runs

    # -------- direct operating expenses (manual journals)
    def _direct_expenses(self):
        from apps.accounting.models import BankAccount, ChartOfAccount
        from apps.accounting.services import LineSpec, build_and_post_journal

        bank = BankAccount.objects.get(code='BANK-USD')
        # code -> monthly amount
        monthly_expenses = [
            ('5000', 'Salaries & Wages', Decimal('12000')),
            ('5100', 'Utilities (Water & Electricity)', Decimal('850')),
            ('5300', 'Transport & Fuel', Decimal('600')),
            ('5410', 'Communication & Internet', Decimal('220')),
            ('5500', 'Insurance', Decimal('400')),
            ('5600', 'Bank Charges', Decimal('45')),
        ]
        journals = 0
        for month in range(2, 7):  # Feb..Jun
            pay_date = date(2026, month, 25)
            specs = []
            total = ZERO
            for code, name, amount in monthly_expenses:
                # small deterministic variation
                amt = (amount * Decimal(str(1 + (self.rng.random() - 0.5) * 0.1))).quantize(TWO)
                specs.append(LineSpec(
                    account=ChartOfAccount.objects.get(code=code),
                    debit=amt, description=f'{name} — {pay_date:%B %Y}',
                ))
                total += amt
            specs.append(LineSpec(
                account=bank.gl_account, credit=total, bank_account=bank,
                description=f'Operating expenses paid — {pay_date:%B %Y}',
            ))
            build_and_post_journal(
                journal_type='payments', date=pay_date, currency='USD',
                description=f'Operating expenses — {pay_date:%B %Y}',
                lines=specs, reference=f'OPEX-{pay_date:%Y-%m}',
            )
            journals += 1
        self.counts['expense_journals'] = journals

    def _extra_opening_balance(self):
        from apps.accounting.models import OpeningBalance
        from apps.core.models import DocumentSequence

        from apps.accounting.models import ChartOfAccount
        # A pre-system equipment loan (Cr Loans Payable / Dr Opening contra).
        ob = OpeningBalance.objects.create(
            number=DocumentSequence.next_for('OPB'),
            date=date(2026, 1, 1),
            target_account=ChartOfAccount.objects.get(code='2500'),
            direction='credit', amount=Decimal('10000'), currency='USD',
            description='Opening equipment finance loan',
        )
        ob.post()

    # ------------------------------------------------------------------ output
    def _print_summary(self):
        from apps.accounting.models import GeneralLedger, Journal

        journals = Journal.objects.count()
        totals = GeneralLedger.objects.aggregate(d=Sum('debit_base'), c=Sum('credit_base'))
        debit = totals['d'] or ZERO
        credit = totals['c'] or ZERO
        balanced = debit == credit

        self.stdout.write(self.style.MIGRATE_HEADING('\nDemo dataset built. Summary:'))
        rows = [
            ('Students (total)', self.counts.get('students')),
            ('  - enrolled', self.counts.get('enrolled')),
            ('  - applicants', self.counts.get('applicants')),
            ('Guardians', self.counts.get('guardians')),
            ('  - sibling reuse', self.sibling_reuse),
            ('Fee invoices', self.counts.get('invoices')),
            ('Receipts', self.counts.get('receipts')),
            ('Credit notes', self.counts.get('credit_notes')),
            ('Bursaries', self.counts.get('bursaries')),
            ('Suppliers', self.counts.get('suppliers')),
            ('Items', self.counts.get('items')),
            ('Purchase orders', self.counts.get('pos')),
            ('GRNs', self.counts.get('grns')),
            ('Vendor bills', self.counts.get('bills')),
            ('Supplier payments', self.counts.get('payments')),
            ('Stock issues', self.counts.get('stock_issues')),
            ('Assets', self.counts.get('assets')),
            ('Depreciation runs', self.counts.get('depreciation_runs')),
            ('Expense journals', self.counts.get('expense_journals')),
            ('Total journals posted', journals),
        ]
        for label, value in rows:
            self.stdout.write(f'  {label:.<28} {value}')

        self.stdout.write('')
        self.stdout.write(f'  GL debit_base  = {debit}')
        self.stdout.write(f'  GL credit_base = {credit}')
        if balanced:
            self.stdout.write(self.style.SUCCESS('  BALANCED ✓'))
        else:
            self.stdout.write(self.style.ERROR('  OUT OF BALANCE ✗'))

    # ------------------------------------------------------------------ helpers
    def _rand_date(self, start, end):
        return start + timedelta(days=self.rng.randint(0, (end - start).days))

    def _phone(self):
        return f'+2637{self.rng.choice("137")}{self.rng.randint(1000000, 9999999)}'

    def _bank(self, code):
        from apps.accounting.models import BankAccount
        return BankAccount.objects.get(code=code)
