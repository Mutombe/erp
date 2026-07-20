"""Financial and operational reports. All period-strict: aggregated from the
GL as-of/within dates in base currency — never from lifetime running balances."""
from datetime import date as date_cls
from decimal import Decimal

from django.core.cache import cache
from django.db.models import Count, F, Q, Sum
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounting.models import BankAccount, ChartOfAccount, GeneralLedger, SubAccount

ZERO = Decimal('0')

AGING_BUCKETS = [(0, 30), (31, 60), (61, 90), (91, 120), (121, None)]


def _parse_date(value, default):
    if not value:
        return default
    return date_cls.fromisoformat(value)


def _aggregate_balances_from_gl(account_types=None, start_date=None, end_date=None, currency=None):
    """Per-account Dr/Cr sums from the GL (base currency), respecting dates."""
    qs = GeneralLedger.objects.all()
    if account_types:
        qs = qs.filter(account__account_type__in=account_types)
    if start_date:
        qs = qs.filter(date__gte=start_date)
    if end_date:
        qs = qs.filter(date__lte=end_date)
    if currency:
        qs = qs.filter(currency=currency)
    return (
        qs.values(
            'account_id',
            code=F('account__code'),
            name=F('account__name'),
            account_type=F('account__account_type'),
            report_group=F('account__report_group'),
        )
        .annotate(debit=Sum('debit_base'), credit=Sum('credit_base'))
        .order_by('code')
    )


def _natural_balance(row):
    """Collapse Dr/Cr sums to the account's natural side (positive = normal)."""
    debit, credit = row['debit'] or ZERO, row['credit'] or ZERO
    if row['account_type'] in ('asset', 'expense'):
        return debit - credit
    return credit - debit


class ReportView(APIView):
    cache_seconds = 60

    def cache_key(self, request):
        params = '&'.join(f'{k}={v}' for k, v in sorted(request.query_params.items()))
        return f'report:{self.__class__.__name__}:{params}'

    def get(self, request):
        key = self.cache_key(request)
        cached = cache.get(key)
        if cached is not None and request.query_params.get('fresh') != '1':
            return Response(cached)
        data = self.build(request)
        cache.set(key, data, self.cache_seconds)
        return Response(data)

    def build(self, request):  # pragma: no cover - abstract
        raise NotImplementedError


class TrialBalanceView(ReportView):
    def build(self, request):
        # Movement mode: ?start=&end= → Opening | Debits | Credits | Closing.
        if request.query_params.get('start'):
            return self._movements(request)
        as_of = _parse_date(request.query_params.get('as_of_date'), timezone.localdate())
        currency = request.query_params.get('currency') or None
        rows, total_debit, total_credit = [], ZERO, ZERO
        for row in _aggregate_balances_from_gl(end_date=as_of, currency=currency):
            balance = _natural_balance(row)
            if balance == 0 and not (row['debit'] or row['credit']):
                continue
            debit = balance if row['account_type'] in ('asset', 'expense') else ZERO
            credit = balance if row['account_type'] not in ('asset', 'expense') else ZERO
            # Contra balances flip sides so the TB always shows positive columns.
            if balance < 0:
                if debit:
                    credit, debit = -debit, ZERO
                else:
                    debit, credit = -credit, ZERO
            rows.append({
                'account_id': row['account_id'], 'code': row['code'], 'name': row['name'],
                'account_type': row['account_type'], 'debit': debit, 'credit': credit,
            })
            total_debit += debit
            total_credit += credit
        return {
            'as_of_date': as_of.isoformat(),
            'rows': rows,
            'total_debit': total_debit,
            'total_credit': total_credit,
            'balanced': total_debit == total_credit,
        }

    def _movements(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start'), today.replace(day=1))
        end = _parse_date(request.query_params.get('end'), today)
        currency = request.query_params.get('currency') or None
        from datetime import timedelta

        opening = {
            r['account_id']: r for r in _aggregate_balances_from_gl(
                end_date=start - timedelta(days=1), currency=currency)
        }
        period = {
            r['account_id']: r for r in _aggregate_balances_from_gl(
                start_date=start, end_date=end, currency=currency)
        }
        rows = []
        totals = {'opening': ZERO, 'debit': ZERO, 'credit': ZERO, 'closing': ZERO}
        for account_id in sorted(set(opening) | set(period), key=lambda i: (opening.get(i) or period[i])['code']):
            meta = opening.get(account_id) or period[account_id]
            open_bal = _natural_balance(opening[account_id]) if account_id in opening else ZERO
            debit = (period.get(account_id) or {}).get('debit') or ZERO
            credit = (period.get(account_id) or {}).get('credit') or ZERO
            signed = debit - credit if meta['account_type'] in ('asset', 'expense') else credit - debit
            closing = open_bal + signed
            if open_bal == 0 and debit == 0 and credit == 0:
                continue
            rows.append({
                'account_id': account_id, 'code': meta['code'], 'name': meta['name'],
                'account_type': meta['account_type'],
                'opening': open_bal, 'debit': debit, 'credit': credit, 'closing': closing,
            })
            totals['opening'] += open_bal if meta['account_type'] in ('asset', 'expense') else -open_bal
            totals['debit'] += debit
            totals['credit'] += credit
            totals['closing'] += closing if meta['account_type'] in ('asset', 'expense') else -closing
        return {
            'mode': 'movements',
            'start': start.isoformat(), 'end': end.isoformat(),
            'rows': rows,
            'totals': totals,
            # Signed natural-side totals cancel to zero when the books balance.
            'balanced': totals['opening'] == 0 and totals['closing'] == 0 and totals['debit'] == totals['credit'],
        }


class BalanceSheetView(ReportView):
    def build(self, request):
        as_of = _parse_date(request.query_params.get('as_of_date'), timezone.localdate())
        compare_raw = request.query_params.get('compare_date')
        compare_date = _parse_date(compare_raw, None) if compare_raw else None

        prev, prev_surplus = None, ZERO
        if compare_date:
            prev = {}
            for row in _aggregate_balances_from_gl(end_date=compare_date):
                balance = _natural_balance(row)
                if row['account_type'] in ('revenue', 'expense'):
                    prev_surplus += balance if row['account_type'] == 'revenue' else -balance
                else:
                    prev[row['account_id']] = balance

        groups = {}
        surplus = ZERO
        for row in _aggregate_balances_from_gl(end_date=as_of):
            balance = _natural_balance(row)
            if row['account_type'] in ('revenue', 'expense'):
                surplus += balance if row['account_type'] == 'revenue' else -balance
                continue
            if balance == 0 and (prev is None or prev.get(row['account_id'], ZERO) == 0):
                continue
            entry = {
                'account_id': row['account_id'], 'code': row['code'], 'name': row['name'],
                'balance': balance,
            }
            if prev is not None:
                entry['prev_balance'] = prev.pop(row['account_id'], ZERO)
            groups.setdefault(row['report_group'], []).append(entry)

        def section(keys):
            out = []
            for key in keys:
                rows = groups.get(key, [])
                item = {'group': key, 'rows': rows, 'total': sum((r['balance'] for r in rows), ZERO)}
                if prev is not None:
                    item['prev_total'] = sum((r.get('prev_balance', ZERO) for r in rows), ZERO)
                out.append(item)
            return out

        assets = section(['current_assets', 'non_current_assets'])
        liabilities = section(['current_liabilities', 'non_current_liabilities'])
        equity = section(['equity'])
        surplus_row = {'account_id': None, 'code': '', 'name': 'Surplus/(Deficit) to date', 'balance': surplus}
        if prev is not None:
            surplus_row['prev_balance'] = prev_surplus
        equity.append({
            'group': 'surplus_to_date',
            'rows': [surplus_row],
            'total': surplus,
            **({'prev_total': prev_surplus} if prev is not None else {}),
        })
        total_assets = sum(s['total'] for s in assets)
        total_liabilities = sum(s['total'] for s in liabilities)
        total_equity = sum(s['total'] for s in equity)
        payload = {
            'as_of_date': as_of.isoformat(),
            'assets': assets,
            'liabilities': liabilities,
            'equity': equity,
            'total_assets': total_assets,
            'total_liabilities': total_liabilities,
            'total_equity': total_equity,
            'balanced': total_assets == total_liabilities + total_equity,
        }
        if prev is not None:
            payload['compare_date'] = compare_date.isoformat()
            payload['prev_total_assets'] = sum(s.get('prev_total', ZERO) for s in assets)
            payload['prev_total_liabilities'] = sum(s.get('prev_total', ZERO) for s in liabilities)
            payload['prev_total_equity'] = sum(s.get('prev_total', ZERO) for s in equity)
        return payload


class IncomeStatementView(ReportView):
    def build(self, request):
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start'), today.replace(month=1, day=1))
        end = _parse_date(request.query_params.get('end'), today)
        fmt = request.query_params.get('layout', 'pnl')  # pnl | ie
        if request.query_params.get('monthly') == '1':
            return self._monthly(start, end, fmt)
        compare = request.query_params.get('compare')  # prior_period | prior_year
        prev = None
        if compare:
            from datetime import timedelta

            if compare == 'prior_year':
                prev_start = start.replace(year=start.year - 1)
                prev_end = end.replace(year=end.year - 1, day=min(end.day, 28) if end.month == 2 else end.day)
            else:  # prior period of the same length, ending the day before start
                length = (end - start).days
                prev_end = start - timedelta(days=1)
                prev_start = prev_end - timedelta(days=length)
            prev = {
                row['account_id']: _natural_balance(row)
                for row in _aggregate_balances_from_gl(
                    account_types=['revenue', 'expense'], start_date=prev_start, end_date=prev_end
                )
            }

        income_groups, expense_groups = {}, {}
        for row in _aggregate_balances_from_gl(
            account_types=['revenue', 'expense'], start_date=start, end_date=end
        ):
            balance = _natural_balance(row)
            if balance == 0:
                continue
            bucket = income_groups if row['account_type'] == 'revenue' else expense_groups
            entry = {
                'account_id': row['account_id'], 'code': row['code'], 'name': row['name'],
                'amount': balance,
            }
            if prev is not None:
                entry['prev_amount'] = prev.pop(row['account_id'], ZERO)
            bucket.setdefault(row['report_group'], []).append(entry)

        def sections(source, keys):
            out = []
            for key in keys:
                rows = source.get(key, [])
                if rows:
                    section = {'group': key, 'rows': rows, 'total': sum((r['amount'] for r in rows), ZERO)}
                    if prev is not None:
                        section['prev_total'] = sum((r.get('prev_amount', ZERO) for r in rows), ZERO)
                    out.append(section)
            return out

        income = sections(income_groups, ['fee_income', 'other_income'])
        expenses = sections(expense_groups, ['operating_expenses', 'administrative_expenses', 'finance_costs'])
        total_income = sum(s['total'] for s in income)
        total_expenses = sum(s['total'] for s in expenses)
        labels = (
            {'income': 'Income', 'expenses': 'Expenditure', 'result': 'Surplus/(Deficit)'}
            if fmt == 'ie'
            else {'income': 'Revenue', 'expenses': 'Expenses', 'result': 'Net Profit/(Loss)'}
        )
        payload = {
            'start': start.isoformat(), 'end': end.isoformat(), 'layout': fmt, 'labels': labels,
            'income': income, 'expenses': expenses,
            'total_income': total_income, 'total_expenses': total_expenses,
            'result': total_income - total_expenses,
        }
        if prev is not None:
            prev_income = sum((s.get('prev_total', ZERO) for s in income), ZERO)
            prev_expenses = sum((s.get('prev_total', ZERO) for s in expenses), ZERO)
            payload['compare'] = compare
            payload['prev_total_income'] = prev_income
            payload['prev_total_expenses'] = prev_expenses
            payload['prev_result'] = prev_income - prev_expenses
        return payload

    def _monthly(self, start, end, fmt):
        """Per-account monthly breakdown across the period."""
        from django.db.models.functions import TruncMonth

        qs = (
            GeneralLedger.objects.filter(
                account__account_type__in=['revenue', 'expense'],
                date__gte=start, date__lte=end,
            )
            .annotate(month=TruncMonth('date'))
            .values(
                'account_id', 'month',
                code=F('account__code'), name=F('account__name'),
                account_type=F('account__account_type'),
            )
            .annotate(debit=Sum('debit_base'), credit=Sum('credit_base'))
        )
        months = sorted({row['month'].strftime('%Y-%m') for row in qs})
        accounts = {}
        for row in qs:
            entry = accounts.setdefault(row['account_id'], {
                'account_id': row['account_id'], 'code': row['code'], 'name': row['name'],
                'account_type': row['account_type'], 'months': {}, 'total': ZERO,
            })
            amount = _natural_balance(row)
            key = row['month'].strftime('%Y-%m')
            entry['months'][key] = entry['months'].get(key, ZERO) + amount
            entry['total'] += amount
        rows = sorted(accounts.values(), key=lambda r: r['code'])
        income_rows = [r for r in rows if r['account_type'] == 'revenue']
        expense_rows = [r for r in rows if r['account_type'] == 'expense']

        def month_totals(source):
            return {
                m: sum((r['months'].get(m, ZERO) for r in source), ZERO) for m in months
            }

        income_totals, expense_totals = month_totals(income_rows), month_totals(expense_rows)
        return {
            'mode': 'monthly', 'layout': fmt,
            'start': start.isoformat(), 'end': end.isoformat(),
            'months': months,
            'income_rows': income_rows, 'expense_rows': expense_rows,
            'income_month_totals': income_totals,
            'expense_month_totals': expense_totals,
            'result_by_month': {m: income_totals[m] - expense_totals[m] for m in months},
            'total_income': sum((r['total'] for r in income_rows), ZERO),
            'total_expenses': sum((r['total'] for r in expense_rows), ZERO),
        }


class AgedReceivablesView(ReportView):
    def build(self, request):
        from apps.fees.models import CreditNote, FeeInvoice, ReceiptAllocation

        as_of = _parse_date(request.query_params.get('as_of_date'), timezone.localdate())
        currency = request.query_params.get('currency') or None
        # True as-at aging: rebuild each invoice's outstanding balance from
        # settlements dated on/before as_of (posted receipts + credit notes),
        # so a back-dated report shows what was actually owed on that date.
        # Reversed receipts are treated as never having happened.
        qs = (
            FeeInvoice.objects.exclude(status__in=['draft', 'cancelled'])
            .filter(date__lte=as_of)
            .select_related('student', 'enrollment__class_room__grade')
        )
        if currency:
            qs = qs.filter(currency=currency)
        grade = request.query_params.get('grade')
        if grade:
            qs = qs.filter(enrollment__class_room__grade_id=grade)

        paid_as_of = {
            row['invoice_id']: row['total']
            for row in ReceiptAllocation.objects.filter(
                receipt__status='posted', receipt__date__lte=as_of, invoice__in=qs
            ).values('invoice_id').annotate(total=Sum('amount'))
        }
        credited_as_of = {
            row['invoice_id']: row['total']
            for row in CreditNote.objects.filter(
                status='posted', date__lte=as_of, invoice__in=qs
            ).values('invoice_id').annotate(total=Sum('total'))
        }

        students = {}
        bucket_totals = [ZERO] * len(AGING_BUCKETS)
        for invoice in qs:
            balance = (
                invoice.total
                - paid_as_of.get(invoice.pk, ZERO)
                - credited_as_of.get(invoice.pk, ZERO)
            )
            if balance <= 0:
                continue
            days = (as_of - invoice.due_date).days
            days = max(days, 0)
            idx = next(
                i for i, (lo, hi) in enumerate(AGING_BUCKETS) if days >= lo and (hi is None or days <= hi)
            )
            entry = students.setdefault(invoice.student_id, {
                'student_id': invoice.student_id,
                'student_code': invoice.student.code,
                'student_name': invoice.student.full_name,
                'grade': (
                    invoice.enrollment.class_room.grade.name
                    if invoice.enrollment_id else ''
                ),
                'currency': invoice.currency,
                'buckets': [ZERO] * len(AGING_BUCKETS),
                'total': ZERO,
            })
            entry['buckets'][idx] += balance
            entry['total'] += balance
            bucket_totals[idx] += balance

        rows = sorted(students.values(), key=lambda r: -r['total'])
        return {
            'as_of_date': as_of.isoformat(),
            'bucket_labels': ['0-30', '31-60', '61-90', '91-120', '120+'],
            'rows': rows,
            'bucket_totals': bucket_totals,
            'grand_total': sum(bucket_totals, ZERO),
        }


class AgedPayablesView(ReportView):
    def build(self, request):
        from apps.procurement.models import PaymentAllocation, VendorBill

        as_of = _parse_date(request.query_params.get('as_of_date'), timezone.localdate())
        qs = VendorBill.objects.exclude(status__in=['draft', 'cancelled']).filter(
            date__lte=as_of
        ).select_related('supplier')
        paid_as_of = {
            row['bill_id']: row['total']
            for row in PaymentAllocation.objects.filter(
                payment__status='posted', payment__date__lte=as_of, bill__in=qs
            ).values('bill_id').annotate(total=Sum('amount'))
        }
        suppliers = {}
        bucket_totals = [ZERO] * len(AGING_BUCKETS)
        for bill in qs:
            balance = bill.total - paid_as_of.get(bill.pk, ZERO)
            if balance <= 0:
                continue
            days = max((as_of - bill.due_date).days, 0)
            idx = next(
                i for i, (lo, hi) in enumerate(AGING_BUCKETS) if days >= lo and (hi is None or days <= hi)
            )
            entry = suppliers.setdefault(bill.supplier_id, {
                'supplier_id': bill.supplier_id,
                'supplier_code': bill.supplier.code,
                'supplier_name': bill.supplier.name,
                'currency': bill.currency,
                'buckets': [ZERO] * len(AGING_BUCKETS),
                'total': ZERO,
            })
            entry['buckets'][idx] += balance
            entry['total'] += balance
            bucket_totals[idx] += balance
        return {
            'as_of_date': as_of.isoformat(),
            'bucket_labels': ['0-30', '31-60', '61-90', '91-120', '120+'],
            'rows': sorted(suppliers.values(), key=lambda r: -r['total']),
            'bucket_totals': bucket_totals,
            'grand_total': sum(bucket_totals, ZERO),
        }


class StudentStatementView(APIView):
    def get(self, request, student_id):
        from apps.students.models import Student

        student = Student.objects.get(pk=student_id)
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start'), today.replace(month=1, day=1))
        end = _parse_date(request.query_params.get('end'), today)
        currency = request.query_params.get('currency') or 'USD'

        pockets = SubAccount.objects.filter(student=student, currency=currency)
        opening = sum((p.balance_as_of(start) for p in pockets), ZERO)
        # Re-derive opening excluding the start day itself
        from datetime import timedelta

        opening = sum((p.balance_as_of(start - timedelta(days=1)) for p in pockets), ZERO)

        from apps.accounting.models import SubAccountTransaction

        txns = (
            SubAccountTransaction.objects.filter(
                sub_account__in=pockets, date__gte=start, date__lte=end
            )
            .select_related('sub_account', 'journal_line__journal')
            .order_by('date', 'id')
        )
        rows, running = [], opening
        for txn in txns:
            running += txn.debit - txn.credit
            journal = txn.journal_line.journal if txn.journal_line_id else None
            rows.append({
                'date': txn.date.isoformat(),
                'category': txn.sub_account.category,
                'reference': txn.reference,
                'description': txn.description,
                'debit': txn.debit,
                'credit': txn.credit,
                'balance': running,
                'journal_id': journal.pk if journal else None,
                'source_type': journal.source_type if journal else '',
                'source_id': journal.source_id if journal else None,
                'source_ref': journal.source_ref if journal else '',
            })
        return Response({
            'student': {'id': student.pk, 'code': student.code, 'name': student.full_name},
            'currency': currency,
            'start': start.isoformat(),
            'end': end.isoformat(),
            'opening_balance': opening,
            'rows': rows,
            'closing_balance': running,
        })


class CashbookView(ReportView):
    def build(self, request):
        bank_id = request.query_params.get('bank_account')
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start'), today.replace(day=1))
        end = _parse_date(request.query_params.get('end'), today)
        if not bank_id:
            return {'error': 'bank_account parameter is required'}
        bank = BankAccount.objects.select_related('gl_account').get(pk=bank_id)

        opening_agg = GeneralLedger.objects.filter(
            account=bank.gl_account, date__lt=start
        ).aggregate(d=Sum('debit_amount'), c=Sum('credit_amount'))
        opening = (opening_agg['d'] or ZERO) - (opening_agg['c'] or ZERO)

        rows, running = [], opening
        for entry in GeneralLedger.objects.filter(
            account=bank.gl_account, date__gte=start, date__lte=end
        ).select_related('journal').order_by('date', 'id'):
            running += entry.debit_amount - entry.credit_amount
            rows.append({
                'date': entry.date.isoformat(),
                'journal_id': entry.journal_id,
                'journal_number': entry.journal.number,
                'description': entry.description,
                'reference': entry.journal.reference,
                'received': entry.debit_amount,
                'paid': entry.credit_amount,
                'balance': running,
                'source_type': entry.journal.source_type,
                'source_id': entry.journal.source_id,
            })
        return {
            'bank_account': {'id': bank.pk, 'name': bank.name, 'currency': bank.currency},
            'start': start.isoformat(), 'end': end.isoformat(),
            'opening_balance': opening, 'rows': rows, 'closing_balance': running,
        }


class AssetRegisterView(ReportView):
    def build(self, request):
        """Fixed-asset movement schedule for a period: opening cost, additions,
        disposals, period depreciation charge, and closing accumulated/NBV as-at
        the period end (rebuilt from posted depreciation entries, not the live
        running field, so back-dated reports are correct)."""
        from apps.assets.models import Asset, DepreciationEntry

        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start'), today.replace(month=1, day=1))
        end = _parse_date(request.query_params.get('end'), today)

        accum_to_end = {
            row['asset_id']: row['total']
            for row in DepreciationEntry.objects.filter(
                run__status='posted', run__run_date__lte=end
            ).values('asset_id').annotate(total=Sum('amount'))
        }
        charge_in_period = {
            row['asset_id']: row['total']
            for row in DepreciationEntry.objects.filter(
                run__status='posted', run__run_date__gte=start, run__run_date__lte=end
            ).values('asset_id').annotate(total=Sum('amount'))
        }

        rows = []
        by_category = {}
        totals = {'opening_cost': ZERO, 'additions': ZERO, 'disposals': ZERO,
                  'closing_cost': ZERO, 'period_charge': ZERO, 'accumulated': ZERO, 'nbv': ZERO}
        for asset in Asset.objects.select_related('category').exclude(status='draft').filter(
            acquisition_date__lte=end
        ):
            disposed_by_end = asset.status in ('disposed', 'written_off') and \
                asset.disposal_date and asset.disposal_date <= end
            disposed_in_period = disposed_by_end and asset.disposal_date >= start
            is_addition = start <= asset.acquisition_date <= end
            accum = accum_to_end.get(asset.pk, ZERO)
            charge = charge_in_period.get(asset.pk, ZERO)
            closing_cost = ZERO if disposed_by_end else asset.cost_base
            closing_accum = ZERO if disposed_by_end else accum
            entry = {
                'id': asset.pk, 'code': asset.code, 'name': asset.name,
                'category': asset.category.name,
                'acquisition_date': asset.acquisition_date.isoformat(),
                'cost': asset.cost_base,
                'addition_in_period': asset.cost_base if is_addition else ZERO,
                'disposal_in_period': asset.cost_base if disposed_in_period else ZERO,
                'period_depreciation': charge,
                'accumulated_depreciation': closing_accum,
                'net_book_value': closing_cost - closing_accum,
                'status': asset.status,
            }
            if disposed_by_end and not disposed_in_period:
                continue  # disposed before the period — no longer on the register
            rows.append(entry)
            cat = by_category.setdefault(asset.category.name, {'cost': ZERO, 'accum': ZERO, 'nbv': ZERO})
            cat['cost'] += closing_cost
            cat['accum'] += closing_accum
            cat['nbv'] += closing_cost - closing_accum
            totals['opening_cost'] += ZERO if is_addition else asset.cost_base
            totals['additions'] += entry['addition_in_period']
            totals['disposals'] += entry['disposal_in_period']
            totals['closing_cost'] += closing_cost
            totals['period_charge'] += charge
            totals['accumulated'] += closing_accum
            totals['nbv'] += closing_cost - closing_accum
        return {
            'start': start.isoformat(), 'end': end.isoformat(),
            'rows': rows,
            'category_totals': by_category,
            'movement_totals': totals,
            # Back-compat keys used by existing screens
            'total_cost': totals['closing_cost'],
            'total_accumulated': totals['accumulated'],
            'total_nbv': totals['nbv'],
        }


class CashFlowView(ReportView):
    def build(self, request):
        """Direct-method cash flow: every GL movement on cash/bank accounts in
        the period, grouped by the journal type that produced it."""
        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start'), today.replace(month=1, day=1))
        end = _parse_date(request.query_params.get('end'), today)

        cash_filter = {'account__account_subtype': 'cash'}
        opening_agg = GeneralLedger.objects.filter(
            date__lt=start, **cash_filter
        ).aggregate(d=Sum('debit_base'), c=Sum('credit_base'))
        opening = (opening_agg['d'] or ZERO) - (opening_agg['c'] or ZERO)

        GROUP_LABELS = {
            'receipts': 'Fees and other income received',
            'payments': 'Payments to suppliers',
            'general': 'Other cash movements',
            'adjustment': 'Adjustments',
            'reversal': 'Reversals',
            'opening': 'Opening balances',
        }
        flows = (
            GeneralLedger.objects.filter(date__gte=start, date__lte=end, **cash_filter)
            .values(jtype=F('journal__journal_type'))
            .annotate(inflow=Sum('debit_base'), outflow=Sum('credit_base'))
            .order_by('jtype')
        )
        rows = [
            {
                'group': GROUP_LABELS.get(f['jtype'], f['jtype']),
                'journal_type': f['jtype'],
                'inflow': f['inflow'] or ZERO,
                'outflow': f['outflow'] or ZERO,
                'net': (f['inflow'] or ZERO) - (f['outflow'] or ZERO),
            }
            for f in flows
        ]
        net_movement = sum((r['net'] for r in rows), ZERO)
        return {
            'start': start.isoformat(), 'end': end.isoformat(),
            'opening_cash': opening,
            'rows': rows,
            'net_movement': net_movement,
            'closing_cash': opening + net_movement,
        }


class StockValuationView(ReportView):
    def build(self, request):
        from apps.inventory.models import StockLevel

        rows = []
        total = ZERO
        for level in StockLevel.objects.select_related('item__category', 'warehouse').filter(quantity__gt=0):
            value = (level.quantity * level.item.avg_cost).quantize(Decimal('0.01'))
            rows.append({
                'item_id': level.item_id, 'item_code': level.item.code, 'item_name': level.item.name,
                'category': level.item.category.name, 'warehouse': level.warehouse.name,
                'quantity': level.quantity, 'avg_cost': level.item.avg_cost, 'value': value,
            })
            total += value
        return {'rows': rows, 'total_value': total}


class DepartmentConsumptionView(ReportView):
    def build(self, request):
        """Stock consumption (issues) per department for a period, at the
        moving-average cost captured on each move."""
        from apps.inventory.models import StockMove

        today = timezone.localdate()
        start = _parse_date(request.query_params.get('start'), today.replace(month=1, day=1))
        end = _parse_date(request.query_params.get('end'), today)
        department = request.query_params.get('department')

        qs = StockMove.objects.filter(
            move_type='issue', status='posted', date__gte=start, date__lte=end
        )
        if department:
            qs = qs.filter(department_id=department)

        rows = [
            {
                'department_id': r['department_id'],
                'department_code': r['department_code'] or '',
                'department_name': r['department_name'] or 'Unassigned',
                'issue_count': r['issue_count'],
                'total_cost': r['total_cost'] or ZERO,
            }
            for r in qs.values(
                'department_id',
                department_code=F('department__code'),
                department_name=F('department__name'),
            )
            .annotate(issue_count=Count('id'), total_cost=Sum('total_cost_base'))
            .order_by('-total_cost')
        ]

        by_item = [
            {
                'department_name': r['department_name'] or 'Unassigned',
                'item_code': r['item_code'],
                'item_name': r['item_name'],
                'quantity': r['quantity'] or ZERO,
                'total_cost': r['total_cost'] or ZERO,
            }
            for r in qs.values(
                'department_id', 'item_id',
                department_name=F('department__name'),
                item_code=F('item__code'),
                item_name=F('item__name'),
            )
            .annotate(quantity=Sum('quantity'), total_cost=Sum('total_cost_base'))
            .order_by('-total_cost')[:50]
        ]

        return {
            'start': start.isoformat(), 'end': end.isoformat(),
            'rows': rows,
            'total_cost': sum((r['total_cost'] for r in rows), ZERO),
            'by_item': by_item,
        }


class FeeCollectionView(ReportView):
    def build(self, request):
        from apps.fees.models import FeeInvoiceLine, ReceiptAllocation

        term = request.query_params.get('term')
        line_qs = FeeInvoiceLine.objects.select_related('fee_category', 'invoice').exclude(
            invoice__status__in=['draft', 'cancelled']
        )
        if term:
            line_qs = line_qs.filter(invoice__term_id=term)
        by_category = {}
        for line in line_qs:
            entry = by_category.setdefault(line.fee_category.code, {
                'category': line.fee_category.code,
                'category_name': line.fee_category.name,
                'billed': ZERO, 'collected': ZERO,
            })
            entry['billed'] += line.amount - line.discount_amount
            entry['collected'] += line.allocated_amount
        rows = list(by_category.values())
        for row in rows:
            row['outstanding'] = row['billed'] - row['collected']
            row['collection_rate'] = (
                float(row['collected'] / row['billed'] * 100) if row['billed'] else 0.0
            )
        return {
            'term': term,
            'rows': rows,
            'total_billed': sum((r['billed'] for r in rows), ZERO),
            'total_collected': sum((r['collected'] for r in rows), ZERO),
        }


class DashboardView(ReportView):
    cache_seconds = 120

    def build(self, request):
        from apps.fees.models import FeeInvoice, Receipt
        from apps.students.models import Student, Term

        today = timezone.localdate()
        term = Term.objects.filter(is_current=True).select_related('academic_year').first()

        invoices = FeeInvoice.objects.exclude(status__in=['draft', 'cancelled'])
        term_invoices = invoices.filter(term=term) if term else invoices.none()
        billed = term_invoices.aggregate(t=Sum('total'))['t'] or ZERO
        collected = term_invoices.aggregate(p=Sum('amount_paid'))['p'] or ZERO
        outstanding_all = sum((i.balance for i in invoices.filter(status__in=['posted', 'partial'])), ZERO)
        overdue = sum(
            (i.balance for i in invoices.filter(status__in=['posted', 'partial'], due_date__lt=today)), ZERO
        )

        banks = [
            {'id': b.pk, 'name': b.name, 'currency': b.currency, 'balance': b.book_balance}
            for b in BankAccount.objects.filter(is_active=True)
        ]

        monthly = []
        if term:
            year_invoices = invoices.filter(term__academic_year=term.academic_year)
            by_month = {}
            for invoice in year_invoices:
                key = invoice.date.strftime('%Y-%m')
                by_month.setdefault(key, {'month': key, 'billed': ZERO, 'collected': ZERO})
                by_month[key]['billed'] += invoice.total
            for receipt in Receipt.objects.filter(status='posted', date__year=term.academic_year.start_date.year):
                key = receipt.date.strftime('%Y-%m')
                by_month.setdefault(key, {'month': key, 'billed': ZERO, 'collected': ZERO})
                by_month[key]['collected'] += receipt.amount
            monthly = sorted(by_month.values(), key=lambda r: r['month'])

        recent_receipts = [
            {
                'id': r.pk, 'number': r.number, 'date': r.date.isoformat(),
                'student_id': r.student_id, 'student_name': r.student.full_name,
                'amount': r.amount, 'currency': r.currency, 'method': r.payment_method,
            }
            for r in Receipt.objects.filter(status='posted').select_related('student').order_by('-date', '-id')[:10]
        ]

        return {
            'term': {'id': term.pk, 'name': str(term)} if term else None,
            'kpis': {
                'billed_this_term': billed,
                'collected_this_term': collected,
                'collection_rate': float(collected / billed * 100) if billed else 0.0,
                'outstanding_fees': outstanding_all,
                'overdue_fees': overdue,
                'active_students': Student.objects.filter(status='enrolled').count(),
            },
            'bank_balances': banks,
            'monthly_billed_vs_collected': monthly,
            'recent_receipts': recent_receipts,
        }
