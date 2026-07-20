"""PDF documents: fee invoice, receipt, student statement, and generic
financial-report exports (xhtml2pdf)."""
import io
import os
from decimal import Decimal

from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.exceptions import NotFound
from rest_framework.views import APIView
from xhtml2pdf import pisa

from apps.core.models import SchoolSettings


def _resolve_static(uri, rel):
    """Map /static/ and /media/ URLs in PDF templates to real file paths so
    xhtml2pdf can embed images (it has no HTTP fetcher)."""
    from django.conf import settings
    from django.contrib.staticfiles import finders

    if uri.startswith(settings.MEDIA_URL):
        path = os.path.join(settings.MEDIA_ROOT, uri.replace(settings.MEDIA_URL, '', 1))
        return path if os.path.exists(path) else uri
    static_url = settings.STATIC_URL if settings.STATIC_URL.startswith('/') else f'/{settings.STATIC_URL}'
    if uri.startswith(static_url):
        found = finders.find(uri.replace(static_url, '', 1))
        if found:
            return found
    return uri


def render_pdf(template, context, filename):
    context['school'] = SchoolSettings.get()
    context.setdefault('logo_url', '/static/brand/logo.png')
    html = render_to_string(template, context)
    buffer = io.BytesIO()
    result = pisa.CreatePDF(
        io.StringIO(html), dest=buffer, encoding='utf-8', link_callback=_resolve_static
    )
    if result.err:
        return HttpResponse('PDF generation failed', status=500)
    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    return response


class InvoicePdfView(APIView):
    def get(self, request, pk):
        from apps.fees.models import FeeInvoice

        try:
            invoice = FeeInvoice.objects.select_related('student', 'term').prefetch_related(
                'lines__fee_category'
            ).get(pk=pk)
        except FeeInvoice.DoesNotExist:
            raise NotFound
        return render_pdf('pdf/invoice.html', {'invoice': invoice}, f'{invoice.number}.pdf')


class ReceiptPdfView(APIView):
    def get(self, request, pk):
        from apps.fees.models import Receipt

        try:
            receipt = Receipt.objects.select_related('student', 'bank_account').prefetch_related(
                'allocations__invoice'
            ).get(pk=pk)
        except Receipt.DoesNotExist:
            raise NotFound
        return render_pdf('pdf/receipt.html', {'receipt': receipt}, f'{receipt.number}.pdf')


class StudentStatementPdfView(APIView):
    def get(self, request, student_id):
        from .views import StudentStatementView

        data = StudentStatementView().get(request, student_id).data
        return render_pdf('pdf/statement.html', {'stmt': data}, f'statement-{data["student"]["code"]}.pdf')


# ---------------------------------------------------------------------------
# Generic financial-report PDF export
# ---------------------------------------------------------------------------

def _fmt(value, blank_zero=False):
    """Format a money/number cell: thousands separators, 2dp. Optionally blank
    for zero (where the on-screen report leaves the cell empty)."""
    if value is None or value == '':
        return ''
    value = Decimal(str(value))
    if blank_zero and value == 0:
        return ''
    return f'{value:,.2f}'


def _group_label(key):
    return key.replace('_', ' ').title()


def _left(label):
    return {'label': label, 'align': 'left'}


def _right(label):
    return {'label': label, 'align': 'right'}


def _row(cells, style=''):
    return {'cells': [str(c) for c in cells], 'style': style}


def _flatten_trial_balance(data):
    if data.get('mode') == 'movements':
        columns = [_left('Code'), _left('Account'), _right('Opening'),
                   _right('Debits'), _right('Credits'), _right('Closing')]
        rows = [
            _row([r['code'], r['name'], _fmt(r['opening'], True), _fmt(r['debit'], True),
                  _fmt(r['credit'], True), _fmt(r['closing'], True)])
            for r in data['rows']
        ]
        t = data['totals']
        rows.append(_row(['', 'Total', _fmt(t['opening']), _fmt(t['debit']),
                          _fmt(t['credit']), _fmt(t['closing'])], 'total'))
        subtitle = f"Movements {data['start']} to {data['end']}"
        if not data['balanced']:
            subtitle += ' · OUT OF BALANCE'
        return {'title': 'Trial Balance', 'subtitle': subtitle,
                'columns': columns, 'rows': rows, 'landscape': True}

    columns = [_left('Code'), _left('Account'), _right('Debit'), _right('Credit')]
    rows = [
        _row([r['code'], r['name'], _fmt(r['debit'], True), _fmt(r['credit'], True)])
        for r in data['rows']
    ]
    rows.append(_row(['', 'Total', _fmt(data['total_debit']), _fmt(data['total_credit'])], 'total'))
    subtitle = f"As at {data['as_of_date']}"
    if not data['balanced']:
        subtitle += ' · OUT OF BALANCE'
    return {'title': 'Trial Balance', 'subtitle': subtitle,
            'columns': columns, 'rows': rows, 'landscape': False}


def _flatten_balance_sheet(data):
    compare = 'compare_date' in data
    columns = [_left('Code'), _left('Account'), _right(f"As at {data['as_of_date']}")]
    if compare:
        columns.append(_right(f"As at {data['compare_date']}"))

    rows = []

    def amounts(current, prev):
        cells = [_fmt(current)]
        if compare:
            cells.append(_fmt(prev))
        return cells

    def emit(heading, sections, total_label, total, prev_total):
        rows.append(_row([heading], 'section'))
        for sec in sections:
            if not sec['rows'] and sec['total'] == 0 and sec.get('prev_total', 0) == 0:
                continue
            rows.append(_row([_group_label(sec['group'])], 'section'))
            for r in sec['rows']:
                rows.append(_row([r['code'], r['name'],
                                  *amounts(r['balance'], r.get('prev_balance'))]))
            rows.append(_row(['', f"Total {_group_label(sec['group'])}",
                              *amounts(sec['total'], sec.get('prev_total'))], 'bold'))
        rows.append(_row(['', total_label, *amounts(total, prev_total)], 'total'))

    emit('ASSETS', data['assets'], 'TOTAL ASSETS',
         data['total_assets'], data.get('prev_total_assets'))
    emit('LIABILITIES', data['liabilities'], 'TOTAL LIABILITIES',
         data['total_liabilities'], data.get('prev_total_liabilities'))
    emit('EQUITY', data['equity'], 'TOTAL EQUITY',
         data['total_equity'], data.get('prev_total_equity'))
    prev_le = None
    if compare:
        prev_le = data['prev_total_liabilities'] + data['prev_total_equity']
    rows.append(_row(['', 'TOTAL LIABILITIES AND EQUITY',
                      *amounts(data['total_liabilities'] + data['total_equity'], prev_le)], 'total'))

    subtitle = f"As at {data['as_of_date']}"
    if compare:
        subtitle += f" · Comparative as at {data['compare_date']}"
    if not data['balanced']:
        subtitle += ' · OUT OF BALANCE'
    return {'title': 'Balance Sheet', 'subtitle': subtitle,
            'columns': columns, 'rows': rows, 'landscape': False}


def _income_statement_labels(layout):
    if layout == 'ie':
        return {'income': 'Income', 'expenses': 'Expenditure', 'result': 'Surplus/(Deficit)'}
    return {'income': 'Revenue', 'expenses': 'Expenses', 'result': 'Net Profit/(Loss)'}


def _flatten_income_statement(data):
    if data.get('mode') == 'monthly':
        return _flatten_income_statement_monthly(data)

    labels = data['labels']
    compare = 'compare' in data
    columns = [_left('Code'), _left('Account'), _right('This Period')]
    if compare:
        columns.append(_right('Prior Year' if data['compare'] == 'prior_year' else 'Prior Period'))

    rows = []

    def amounts(current, prev):
        cells = [_fmt(current)]
        if compare:
            cells.append(_fmt(prev))
        return cells

    def emit(heading, sections, total_label, total, prev_total):
        rows.append(_row([heading], 'section'))
        for sec in sections:
            rows.append(_row([_group_label(sec['group'])], 'section'))
            for r in sec['rows']:
                rows.append(_row([r['code'], r['name'],
                                  *amounts(r['amount'], r.get('prev_amount'))]))
            rows.append(_row(['', f"Total {_group_label(sec['group'])}",
                              *amounts(sec['total'], sec.get('prev_total'))], 'bold'))
        rows.append(_row(['', total_label, *amounts(total, prev_total)], 'total'))

    emit(labels['income'].upper(), data['income'], f"Total {labels['income']}",
         data['total_income'], data.get('prev_total_income'))
    emit(labels['expenses'].upper(), data['expenses'], f"Total {labels['expenses']}",
         data['total_expenses'], data.get('prev_total_expenses'))
    rows.append(_row(['', labels['result'], *amounts(data['result'], data.get('prev_result'))], 'total'))

    title = 'Income & Expenditure Statement' if data['layout'] == 'ie' else 'Income Statement'
    return {'title': title, 'subtitle': f"Period {data['start']} to {data['end']}",
            'columns': columns, 'rows': rows, 'landscape': False}


def _flatten_income_statement_monthly(data):
    labels = _income_statement_labels(data.get('layout', 'pnl'))
    months = data['months']
    columns = [_left('Code'), _left('Account')] + [_right(m) for m in months] + [_right('Total')]

    rows = []

    def emit(heading, source, month_totals, total_label, total):
        rows.append(_row([heading], 'section'))
        for r in source:
            rows.append(_row(
                [r['code'], r['name']]
                + [_fmt(r['months'].get(m), True) for m in months]
                + [_fmt(r['total'])]
            ))
        rows.append(_row(['', total_label] + [_fmt(month_totals.get(m)) for m in months]
                         + [_fmt(total)], 'total'))

    emit(labels['income'].upper(), data['income_rows'], data['income_month_totals'],
         f"Total {labels['income']}", data['total_income'])
    emit(labels['expenses'].upper(), data['expense_rows'], data['expense_month_totals'],
         f"Total {labels['expenses']}", data['total_expenses'])
    rows.append(_row(['', labels['result']]
                     + [_fmt(data['result_by_month'].get(m)) for m in months]
                     + [_fmt(data['total_income'] - data['total_expenses'])], 'total'))

    title = 'Income & Expenditure Statement' if data.get('layout') == 'ie' else 'Income Statement'
    return {'title': f'{title} (Monthly)',
            'subtitle': f"Period {data['start']} to {data['end']}",
            'columns': columns, 'rows': rows, 'landscape': True}


def _flatten_aged_receivables(data):
    buckets = data['bucket_labels']
    columns = ([_left('Code'), _left('Student'), _left('Grade'), _left('Currency')]
               + [_right(b) for b in buckets] + [_right('Total')])
    rows = [
        _row([r['student_code'], r['student_name'], r['grade'], r['currency']]
             + [_fmt(b, True) for b in r['buckets']] + [_fmt(r['total'])])
        for r in data['rows']
    ]
    rows.append(_row(['', 'Total', '', ''] + [_fmt(b) for b in data['bucket_totals']]
                     + [_fmt(data['grand_total'])], 'total'))
    return {'title': 'Aged Receivables', 'subtitle': f"As at {data['as_of_date']}",
            'columns': columns, 'rows': rows, 'landscape': True}


def _flatten_aged_payables(data):
    buckets = data['bucket_labels']
    columns = ([_left('Code'), _left('Supplier'), _left('Currency')]
               + [_right(b) for b in buckets] + [_right('Total')])
    rows = [
        _row([r['supplier_code'], r['supplier_name'], r['currency']]
             + [_fmt(b, True) for b in r['buckets']] + [_fmt(r['total'])])
        for r in data['rows']
    ]
    rows.append(_row(['', 'Total', ''] + [_fmt(b) for b in data['bucket_totals']]
                     + [_fmt(data['grand_total'])], 'total'))
    return {'title': 'Aged Payables', 'subtitle': f"As at {data['as_of_date']}",
            'columns': columns, 'rows': rows, 'landscape': True}


def _flatten_cashbook(data):
    bank = data['bank_account']
    columns = [_left('Date'), _left('Journal'), _left('Reference'), _left('Description'),
               _right('Received'), _right('Paid'), _right('Balance')]
    rows = [_row(['', '', '', 'Opening balance', '', '', _fmt(data['opening_balance'])], 'bold')]
    for r in data['rows']:
        rows.append(_row([r['date'], r['journal_number'], r['reference'],
                          (r['description'] or '')[:60],
                          _fmt(r['received'], True), _fmt(r['paid'], True), _fmt(r['balance'])]))
    rows.append(_row(['', '', '', 'Closing balance', '', '', _fmt(data['closing_balance'])], 'total'))
    return {'title': 'Cashbook',
            'subtitle': f"{bank['name']} ({bank['currency']}) · {data['start']} to {data['end']}",
            'columns': columns, 'rows': rows, 'landscape': False}


def _flatten_cash_flow(data):
    columns = [_left('Category'), _right('Inflows'), _right('Outflows'), _right('Net')]
    rows = [_row(['Opening cash', '', '', _fmt(data['opening_cash'])], 'bold')]
    for r in data['rows']:
        rows.append(_row([r['group'], _fmt(r['inflow'], True), _fmt(r['outflow'], True),
                          _fmt(r['net'])]))
    rows.append(_row(['Net cash movement', '', '', _fmt(data['net_movement'])], 'total'))
    rows.append(_row(['Closing cash', '', '', _fmt(data['closing_cash'])], 'total'))
    return {'title': 'Cash Flow Statement',
            'subtitle': f"Period {data['start']} to {data['end']}",
            'columns': columns, 'rows': rows, 'landscape': False}


def _flatten_asset_register(data):
    columns = [_left('Code'), _left('Asset'), _left('Category'), _left('Acquired'),
               _right('Cost'), _right('Additions'), _right('Disposals'),
               _right('Depreciation'), _right('Accum. Dep.'), _right('NBV')]
    rows = [
        _row([r['code'], r['name'], r['category'], r['acquisition_date'],
              _fmt(r['cost']), _fmt(r['addition_in_period'], True),
              _fmt(r['disposal_in_period'], True), _fmt(r['period_depreciation'], True),
              _fmt(r['accumulated_depreciation']), _fmt(r['net_book_value'])])
        for r in data['rows']
    ]
    t = data['movement_totals']
    rows.append(_row(['', 'Total', '', '', _fmt(t['closing_cost']), _fmt(t['additions']),
                      _fmt(t['disposals']), _fmt(t['period_charge']),
                      _fmt(t['accumulated']), _fmt(t['nbv'])], 'total'))
    return {'title': 'Fixed Asset Register',
            'subtitle': f"Period {data['start']} to {data['end']}",
            'columns': columns, 'rows': rows, 'landscape': True}


def _flatten_stock_valuation(data):
    columns = [_left('Code'), _left('Item'), _left('Category'), _left('Warehouse'),
               _right('Quantity'), _right('Avg Cost'), _right('Value')]
    rows = [
        _row([r['item_code'], r['item_name'], r['category'], r['warehouse'],
              _fmt(r['quantity']), _fmt(r['avg_cost']), _fmt(r['value'])])
        for r in data['rows']
    ]
    rows.append(_row(['', 'Total', '', '', '', '', _fmt(data['total_value'])], 'total'))
    return {'title': 'Stock Valuation',
            'subtitle': f"As at {timezone.localdate().isoformat()}",
            'columns': columns, 'rows': rows, 'landscape': False}


def _flatten_department_consumption(data):
    columns = [_left('Department'), _right('Issues'), _right('Total Cost')]
    rows = [
        _row([f"{r['department_code']} {r['department_name']}".strip(),
              str(r['issue_count']), _fmt(r['total_cost'])])
        for r in data['rows']
    ]
    rows.append(_row(['Total', '', _fmt(data['total_cost'])], 'total'))
    return {'title': 'Stock Consumption by Department',
            'subtitle': f"Period {data['start']} to {data['end']}",
            'columns': columns, 'rows': rows, 'landscape': False}


def _flatten_fee_collection(data):
    columns = [_left('Code'), _left('Category'), _right('Billed'), _right('Collected'),
               _right('Outstanding'), _right('Collection %')]
    rows = [
        _row([r['category'], r['category_name'], _fmt(r['billed']), _fmt(r['collected']),
              _fmt(r['outstanding']), f"{r['collection_rate']:.1f}%"])
        for r in data['rows']
    ]
    billed, collected = data['total_billed'], data['total_collected']
    rate = float(collected / billed * 100) if billed else 0.0
    rows.append(_row(['', 'Total', _fmt(billed), _fmt(collected),
                      _fmt(billed - collected), f'{rate:.1f}%'], 'total'))
    subtitle = f"Term {data['term']}" if data['term'] else 'All terms'
    return {'title': 'Fee Collection Report', 'subtitle': subtitle,
            'columns': columns, 'rows': rows, 'landscape': False}


def _report_specs():
    from . import views

    return {
        'trial-balance': (views.TrialBalanceView, _flatten_trial_balance),
        'balance-sheet': (views.BalanceSheetView, _flatten_balance_sheet),
        'income-statement': (views.IncomeStatementView, _flatten_income_statement),
        'aged-receivables': (views.AgedReceivablesView, _flatten_aged_receivables),
        'aged-payables': (views.AgedPayablesView, _flatten_aged_payables),
        'cashbook': (views.CashbookView, _flatten_cashbook),
        'cash-flow': (views.CashFlowView, _flatten_cash_flow),
        'asset-register': (views.AssetRegisterView, _flatten_asset_register),
        'stock-valuation': (views.StockValuationView, _flatten_stock_valuation),
        'department-consumption': (views.DepartmentConsumptionView, _flatten_department_consumption),
        'fee-collection': (views.FeeCollectionView, _flatten_fee_collection),
    }


class ReportPdfView(APIView):
    """Generic PDF export: /api/reports/pdf/<report_key>/ with the same query
    params as the underlying JSON report view."""

    def get(self, request, report_key):
        specs = _report_specs()
        if report_key not in specs:
            raise NotFound(f'Unknown report: {report_key}')
        view_class, flatten = specs[report_key]
        data = view_class().build(request)
        if isinstance(data, dict) and data.get('error'):
            return JsonResponse({'error': data['error']}, status=400)
        flat = flatten(data)
        columns = flat['columns']
        for row in flat['rows']:
            if row['style'] != 'section':
                row['cells'] = [
                    {'text': text, 'align': columns[i]['align']}
                    for i, text in enumerate(row['cells'])
                ]
        return render_pdf('pdf/report.html', flat, f'{report_key}.pdf')
