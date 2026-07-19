"""Depreciation math (pure functions) and the monthly run service."""
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.accounting.services import LineSpec, base_currency, build_and_post_journal

from .models import Asset, DepreciationEntry, DepreciationRun

TWO = Decimal('0.01')
ZERO = Decimal('0')


def monthly_charge(asset, months_elapsed):
    """Charge for one month, given how many months have already been charged.

    Straight line: (cost - residual) / life, with the FINAL month absorbing the
    rounding remainder so the schedule sums exactly to cost - residual.
    Reducing balance: NBV x (annual_rate / 12), floored at residual value.
    """
    depreciable = asset.cost_base - asset.residual_value
    if depreciable <= 0:
        return ZERO

    if asset.method == 'straight_line':
        life = asset.life_months
        if months_elapsed >= life:
            return ZERO
        base_monthly = (depreciable / life).quantize(TWO)
        if months_elapsed == life - 1:  # final month absorbs rounding
            return depreciable - base_monthly * (life - 1)
        return base_monthly

    # reducing balance
    rate = asset.rb_annual_rate / Decimal('100') / Decimal('12')
    nbv = asset.cost_base - asset.accumulated_depreciation
    charge = (nbv * rate).quantize(TWO)
    max_charge = nbv - asset.residual_value
    return max(min(charge, max_charge), ZERO)


def months_between(start, end):
    return (end.year - start.year) * 12 + (end.month - start.month)


def run_depreciation(period, user=None):
    """One run per fiscal period. Posts a single journal grouped by category:
    Dr depreciation expense / Cr accumulated depreciation."""
    existing = DepreciationRun.objects.filter(period=period).first()
    if existing and existing.status == 'posted':
        raise ValidationError(f'Depreciation for {period} has already been posted.')

    with transaction.atomic():
        run = existing or DepreciationRun.objects.create(
            period=period, run_date=period.end_date, created_by=user
        )
        run.entries.all().delete()

        category_totals = {}  # category -> amount
        entries = []
        assets = (
            Asset.objects.select_for_update()
            .select_related('category')
            .filter(status='active', in_service_date__lte=period.end_date)
            .order_by('code')
        )
        for asset in assets:
            months_elapsed = asset.depreciation_entries.filter(run__status='posted').count()
            charge = monthly_charge(asset, months_elapsed)
            if charge <= 0:
                continue
            asset.accumulated_depreciation += charge
            if asset.cost_base - asset.accumulated_depreciation <= asset.residual_value:
                asset.status = 'fully_depreciated'
            asset.save(update_fields=['accumulated_depreciation', 'status'])
            entries.append(DepreciationEntry(
                run=run,
                asset=asset,
                amount=charge,
                accumulated_after=asset.accumulated_depreciation,
                nbv_after=asset.net_book_value,
            ))
            category_totals[asset.category] = category_totals.get(asset.category, ZERO) + charge

        if not entries:
            raise ValidationError('No depreciable assets found for this period.')
        DepreciationEntry.objects.bulk_create(entries)

        specs = []
        for category, amount in category_totals.items():
            specs.append(LineSpec(account=category.depr_expense_account, debit=amount,
                                  description=f'Depreciation {period}: {category.name}'))
            specs.append(LineSpec(account=category.accum_depr_account, credit=amount,
                                  description=f'Depreciation {period}: {category.name}'))

        journal = build_and_post_journal(
            journal_type='depreciation',
            date=period.end_date,
            currency=base_currency(),
            description=f'Depreciation run {period}',
            lines=specs,
            reference=str(period),
            exchange_rate=Decimal('1'),
            user=user,
            source=('assets.DepreciationRun', run.pk, str(period)),
        )
        run.journal = journal
        run.status = 'posted'
        run.total_amount = sum(category_totals.values(), ZERO)
        run.save(update_fields=['journal', 'status', 'total_amount'])
        return run


def reverse_depreciation_run(run, reason='', user=None):
    with transaction.atomic():
        run = DepreciationRun.objects.select_for_update().get(pk=run.pk)
        if run.status != 'posted':
            raise ValidationError('Only posted runs can be reversed.')
        run.journal.reverse(reason=reason or f'Reverse depreciation {run.period}', user=user)
        for entry in run.entries.select_related('asset'):
            asset = Asset.objects.select_for_update().get(pk=entry.asset_id)
            asset.accumulated_depreciation -= entry.amount
            if asset.status == 'fully_depreciated':
                asset.status = 'active'
            asset.save(update_fields=['accumulated_depreciation', 'status'])
        run.status = 'reversed'
        run.save(update_fields=['status'])
        return run
