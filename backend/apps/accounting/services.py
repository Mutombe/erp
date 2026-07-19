"""The single posting pathway. Every document (fee invoice, receipt, vendor
bill, GRN, payment, depreciation run, stock issue, opening balance, manual
journal) builds LineSpecs and calls build_and_post_journal(). No posting code
anywhere references an account code literal — purposes resolve through
AccountMapping."""
from dataclasses import dataclass, field
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction

from apps.core.models import DocumentSequence

from .models import AccountMapping, ChartOfAccount, ExchangeRate, Journal, JournalLine

TWO_PLACES = Decimal('0.01')
ZERO = Decimal('0')


@dataclass
class LineSpec:
    account: ChartOfAccount | None = None
    mapping_purpose: str | None = None
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    sub_account: object = None
    bank_account: object = None
    description: str = ''
    # Optional explicit base-currency amounts (else journal rate applies).
    debit_base: Decimal | None = None
    credit_base: Decimal | None = None
    source: tuple | None = field(default=None)  # ('app.Model', id)

    def resolve_account(self, currency):
        if self.account is not None:
            return self.account
        if self.mapping_purpose:
            return AccountMapping.resolve(self.mapping_purpose, currency)
        raise ValidationError('LineSpec needs an account or a mapping_purpose.')


def base_currency():
    return settings.BASE_CURRENCY


def build_and_post_journal(
    journal_type,
    date,
    currency,
    description,
    lines,
    reference='',
    exchange_rate=None,
    user=None,
    source=None,  # ('app.Model', id, display_ref)
    auto_post=True,
):
    """Create a journal from LineSpecs and (by default) post it atomically."""
    if not lines:
        raise ValidationError('A journal needs at least one line.')

    if exchange_rate is None:
        exchange_rate = ExchangeRate.get_rate(currency, base_currency(), date)

    source_type, source_id, source_ref = ('', None, '')
    if source:
        source_type, source_id = source[0], source[1]
        source_ref = source[2] if len(source) > 2 else ''

    with transaction.atomic():
        journal = Journal.objects.create(
            number=DocumentSequence.next_for('JRN'),
            journal_type=journal_type,
            date=date,
            description=description,
            reference=reference,
            currency=currency,
            exchange_rate=exchange_rate,
            source_type=source_type,
            source_id=source_id,
            source_ref=source_ref,
            created_by=user,
        )
        for spec in lines:
            debit = Decimal(spec.debit or 0).quantize(TWO_PLACES)
            credit = Decimal(spec.credit or 0).quantize(TWO_PLACES)
            debit_base = spec.debit_base if spec.debit_base is not None else None
            credit_base = spec.credit_base if spec.credit_base is not None else None
            if debit == 0 and credit == 0 and not debit_base and not credit_base:
                continue
            account = spec.resolve_account(currency)
            JournalLine.objects.create(
                journal=journal,
                account=account,
                debit_amount=debit,
                credit_amount=credit,
                debit_base=debit_base if debit_base is not None else ZERO,
                credit_base=credit_base if credit_base is not None else ZERO,
                sub_account=spec.sub_account,
                bank_account=spec.bank_account,
                description=spec.description or description,
                source_type=(spec.source or (source_type,))[0] if (spec.source or source_type) else '',
                source_id=spec.source[1] if spec.source else source_id,
            )
        if auto_post:
            journal.post(user=user)
        return journal
