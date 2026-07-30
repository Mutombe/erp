"""Reusable, idempotent per-school provisioner.

`provision_school(school)` builds out everything a freshly-created tenant needs
to start trading: chart of accounts, account mappings, document sequences,
fiscal calendar and bank accounts (all stamped with the school), plus the
shared catalog (fee categories, grades, academic calendar, departments) that
is still global during the multi-tenant transition (Wave 1).
"""
from datetime import date, timedelta
from decimal import Decimal

# (code, name, report_group, currency, is_system)
COA = [
    ('1000', 'Cash on Hand (USD)', 'current_assets', 'USD', True),
    ('1005', 'Cash on Hand (ZWG)', 'current_assets', 'ZWG', True),
    ('1010', 'Bank Account (USD)', 'current_assets', 'USD', True),
    ('1020', 'Bank Account (ZWG)', 'current_assets', 'ZWG', True),
    ('1030', 'Mobile Money (ZWG)', 'current_assets', 'ZWG', False),
    ('1100', 'Accounts Receivable (USD)', 'current_assets', 'USD', True),
    ('1110', 'Accounts Receivable (ZWG)', 'current_assets', 'ZWG', True),
    ('1200', 'Inventory — Consumables', 'current_assets', '', True),
    ('1210', 'Inventory — Uniforms & Resale', 'current_assets', '', False),
    ('1300', 'Prepayments', 'current_assets', '', False),
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
    ('3000', 'Accumulated Fund', 'equity', '', True),
    ('3900', 'Opening Balances', 'equity', '', True),
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
    ('5000', 'Salaries & Wages', 'operating_expenses', '', False),
    ('5100', 'Utilities (Water & Electricity)', 'operating_expenses', '', False),
    ('5110', 'Repairs & Maintenance', 'operating_expenses', '', False),
    ('5200', 'Food & Catering', 'operating_expenses', '', False),
    ('5210', 'Stationery & Teaching Materials', 'operating_expenses', '', False),
    ('5220', 'Sports & Activities', 'operating_expenses', '', False),
    ('5230', 'Agriculture & Farm Expenses', 'operating_expenses', '', False),
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
    ('TCH', 'TCH'),
]

GRADES = (
    [('ECD A', 1, 'ecd'), ('ECD B', 2, 'ecd')]
    + [(f'Grade {i}', i + 2, 'primary') for i in range(1, 8)]
    + [(f'Form {i}', i + 9, 'secondary') for i in range(1, 7)]
)

DEPARTMENTS = [
    ('ACAD', 'Academic / Teaching', '5210'),
    ('AGRI', 'Agriculture', '5230'),
    ('SPRT', 'Sports & Recreation', '5220'),
    ('KITC', 'Kitchen & Catering', '5200'),
    ('BORD', 'Boarding', None),
    ('MAINT', 'Maintenance & Grounds', '5110'),
    ('TRAN', 'Transport', '5300'),
    ('ADMIN', 'Administration', '5400'),
    ('ICT', 'ICT', '5410'),
    ('HLTH', 'Health & Clinic', None),
    ('LIB', 'Library', None),
]

BANKS = [
    ('CASH-USD', 'Cash Box (USD)', 'cash', '1000', 'USD', True),
    ('CASH-ZWG', 'Cash Box (ZWG)', 'cash', '1005', 'ZWG', False),
    ('BANK-USD', 'Main Bank (USD)', 'bank', '1010', 'USD', False),
    ('BANK-ZWG', 'Main Bank (ZWG)', 'bank', '1020', 'ZWG', True),
]


def provision_school(school):
    """Idempotently build out `school`'s COA, mappings, sequences, fiscal
    calendar, banks and the shared catalog. Returns the AcademicYear used."""
    from apps.accounting.models import (
        AccountMapping, BankAccount, ChartOfAccount, ExchangeRate, FiscalPeriod, FiscalYear,
    )
    from apps.core.models import DocumentSequence
    from apps.fees.models import FeeCategory
    from apps.inventory.models import Department
    from apps.students.models import AcademicYear, Grade, Term

    # Per-school document sequences.
    for doc_type, prefix in SEQUENCES:
        DocumentSequence.objects.get_or_create(
            school=school, doc_type=doc_type, defaults={'prefix': prefix}
        )

    # Per-school chart of accounts.
    accounts = {}
    for code, name, group, currency, is_system in COA:
        account, _ = ChartOfAccount.objects.get_or_create(
            school=school, code=code,
            defaults={
                'name': name, 'report_group': group, 'currency': currency,
                'is_system': is_system,
                'allow_manual_journal': code not in ('1100', '1110', '2000', '2010'),
            },
        )
        accounts[code] = account

    # Per-school account mappings.
    for purpose, currency, code in MAPPINGS:
        AccountMapping.objects.get_or_create(
            school=school, purpose=purpose, currency=currency, defaults={'account': accounts[code]}
        )

    # Per-school catalog: fee categories keyed by (school, code).
    for code, name, income, order in FEE_CATEGORIES:
        FeeCategory.objects.get_or_create(
            school=school, code=code,
            defaults={
                'name': name,
                'income_account': accounts[income],
                'deferred_account': accounts['2200'],
                'pocket_order': order,
            },
        )

    for name, level, section in GRADES:
        Grade.objects.get_or_create(school=school, name=name, defaults={'level': level, 'section': section})

    year, _ = AcademicYear.objects.get_or_create(
        school=school, name='2026',
        defaults={'start_date': date(2026, 1, 13), 'end_date': date(2026, 12, 4), 'is_current': True},
    )
    for number, name, start, end in [
        (1, 'Term 1', date(2026, 1, 13), date(2026, 4, 9)),
        (2, 'Term 2', date(2026, 5, 5), date(2026, 8, 6)),
        (3, 'Term 3', date(2026, 9, 7), date(2026, 12, 3)),
    ]:
        Term.objects.get_or_create(
            school=school, academic_year=year, number=number,
            defaults={'name': name, 'start_date': start, 'end_date': end, 'is_current': number == 2},
        )

    # Per-school fiscal calendar.
    fiscal_year, created = FiscalYear.objects.get_or_create(
        school=school, name='FY2026',
        defaults={'start_date': date(2026, 1, 1), 'end_date': date(2026, 12, 31)},
    )
    if created:
        for month in range(1, 13):
            start = date(2026, month, 1)
            end = date(2026, month + 1, 1) if month < 12 else date(2027, 1, 1)
            FiscalPeriod.objects.create(
                school=school, fiscal_year=fiscal_year, period_no=month,
                start_date=start, end_date=end - timedelta(days=1),
            )

    # Per-school exchange rate.
    ExchangeRate.objects.get_or_create(
        school=school, from_currency='ZWG', to_currency='USD',
        effective_date=date(2026, 1, 1), source='seed',
        defaults={'rate': Decimal('0.037175')},
    )

    # Per-school bank accounts.
    for code, name, acc_type, gl_code, currency, is_default in BANKS:
        BankAccount.objects.get_or_create(
            school=school, code=code,
            defaults={
                'name': name, 'account_type': acc_type, 'gl_account': accounts[gl_code],
                'currency': currency, 'is_default': is_default,
            },
        )

    # Per-school departments.
    for code, name, expense_code in DEPARTMENTS:
        Department.objects.get_or_create(
            school=school, code=code,
            defaults={
                'name': name,
                'expense_account': accounts[expense_code] if expense_code else None,
            },
        )

    # School configuration defaults.
    changed = False
    if school.current_academic_year_id is None:
        school.current_academic_year = year
        changed = True
    if not school.statement_footer:
        school.statement_footer = f'{school.name} · Sailing To Success'
        changed = True
    if changed:
        school.save(update_fields=['current_academic_year', 'statement_footer'])

    return year
