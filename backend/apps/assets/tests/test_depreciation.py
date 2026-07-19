from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.accounting.models import ChartOfAccount, FiscalPeriod
from apps.assets.models import Asset, AssetCategory
from apps.assets.services import monthly_charge, reverse_depreciation_run, run_depreciation
from conftest import assert_gl_balanced

pytestmark = pytest.mark.django_db

D = Decimal


@pytest.fixture
def category(seeded_db):
    return AssetCategory.objects.create(
        code='COMP', name='Computers', depreciation_method='straight_line',
        useful_life_months=36,
        asset_account=ChartOfAccount.objects.get(code='1530'),
        accum_depr_account=ChartOfAccount.objects.get(code='1630'),
        depr_expense_account=ChartOfAccount.objects.get(code='5800'),
    )


@pytest.fixture
def laptop(category):
    from apps.accounting.services import LineSpec, build_and_post_journal

    asset = Asset.objects.create(
        code='AST00001', name='Laptop', category=category,
        acquisition_date=date(2026, 1, 10), in_service_date=date(2026, 1, 10),
        cost=D('1000'), currency='USD', cost_base=D('1000'), residual_value=D('100'),
    )
    # Capitalize: cash purchase Dr asset cost / Cr bank.
    journal = build_and_post_journal(
        journal_type='general', date=asset.acquisition_date, currency='USD',
        description=f'Capitalize {asset.code}',
        lines=[
            LineSpec(account=category.asset_account, debit=asset.cost_base),
            LineSpec(account=ChartOfAccount.objects.get(code='1010'), credit=asset.cost_base),
        ],
        source=('assets.Asset', asset.pk, asset.code),
    )
    asset.capitalization_journal = journal
    asset.save(update_fields=['capitalization_journal'])
    return asset


class TestDepreciationMath:
    def test_straight_line_sums_exactly_to_depreciable_amount(self, laptop):
        total = D('0')
        for month in range(36):
            charge = monthly_charge(laptop, month)
            laptop.accumulated_depreciation += charge
            total += charge
        assert total == D('900')  # cost - residual, exact: final month absorbed rounding
        assert monthly_charge(laptop, 36) == 0

    def test_reducing_balance_floors_at_residual(self, category):
        category.depreciation_method = 'reducing_balance'
        category.annual_rate = D('40')
        category.save()
        asset = Asset.objects.create(
            code='AST00002', name='Vehicle', category=category,
            acquisition_date=date(2026, 1, 1), in_service_date=date(2026, 1, 1),
            cost=D('500'), currency='USD', cost_base=D('500'), residual_value=D('400'),
        )
        total = D('0')
        for month in range(60):
            charge = monthly_charge(asset, month)
            asset.accumulated_depreciation += charge
            total += charge
        assert asset.cost_base - asset.accumulated_depreciation >= asset.residual_value
        assert total <= D('100')


class TestDepreciationRun:
    def test_run_posts_journal_and_is_once_per_period(self, laptop):
        period = FiscalPeriod.objects.get(fiscal_year__name='FY2026', period_no=1)
        run = run_depreciation(period)
        assert run.status == 'posted'
        assert run.total_amount == D('25.00')  # 900/36
        assert ChartOfAccount.objects.get(code='5800').current_balance == D('25.00')
        assert ChartOfAccount.objects.get(code='1630').current_balance == D('-25.00')
        laptop.refresh_from_db()
        assert laptop.accumulated_depreciation == D('25.00')
        assert_gl_balanced()
        with pytest.raises(ValidationError):
            run_depreciation(period)

    def test_reverse_run_restores_assets(self, laptop):
        period = FiscalPeriod.objects.get(fiscal_year__name='FY2026', period_no=1)
        run = run_depreciation(period)
        reverse_depreciation_run(run)
        laptop.refresh_from_db()
        assert laptop.accumulated_depreciation == 0
        assert ChartOfAccount.objects.get(code='5800').current_balance == 0
        assert_gl_balanced()


class TestDisposal:
    def test_disposal_with_loss(self, laptop, seeded_db):
        from apps.accounting.models import BankAccount

        period = FiscalPeriod.objects.get(fiscal_year__name='FY2026', period_no=1)
        run_depreciation(period)  # accum 25
        laptop.refresh_from_db()
        bank = BankAccount.objects.get(code='BANK-USD')
        laptop.dispose(date=date(2026, 2, 15), proceeds=D('800'), bank_account=bank)
        laptop.refresh_from_db()
        assert laptop.status == 'disposed'
        # NBV was 975; proceeds 800 -> loss 175
        assert ChartOfAccount.objects.get(code='5720').current_balance == D('175.00')
        assert ChartOfAccount.objects.get(code='1530').current_balance == 0
        assert ChartOfAccount.objects.get(code='1630').current_balance == 0
        assert_gl_balanced()
