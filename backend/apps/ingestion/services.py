"""Ingestion pipeline: AI proposes → human reviews/edits → approve posts.

`extract_item` calls Claude Vision when a key is configured, but the whole
feature is fully functional without one: on a missing key or any SDK/network
failure the item drops to `needs_review` with empty scaffolding for a human to
fill in by hand. `approve_item` is the ONLY path to the ledger, and it always
goes through the existing document services — never a raw journal insert that
bypasses them.
"""
import base64
import json
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounting.models import AccountMapping, BankAccount, ChartOfAccount
from apps.accounting.services import LineSpec, build_and_post_journal
from apps.core.models import AuditTrail, DocumentSequence

TWO = Decimal('0.01')
ZERO = Decimal('0')

# Fallback expense account for unmapped vendor-bill / expense lines.
FALLBACK_EXPENSE_CODE = getattr(settings, 'INGESTION_FALLBACK_EXPENSE_ACCOUNT', '5400')

# Empty per-field scaffolding a human fills in when there is no AI extraction.
SCHEMAS = {
    'vendor_bill': [
        'supplier_name', 'supplier_tax_number', 'bill_number', 'date', 'due_date',
        'currency', 'subtotal', 'total',
    ],
    'fee_receipt': [
        'student_code_or_name', 'amount', 'date', 'currency', 'method', 'reference', 'bank_hint',
    ],
    'expense': [
        'description', 'amount', 'date', 'currency', 'expense_category_hint', 'bank_hint',
    ],
    'other': [],
}

# Required fields that drive the weakest-link score.
REQUIRED = {
    'vendor_bill': ['supplier_name', 'total'],
    'fee_receipt': ['student_code_or_name', 'amount'],
    'expense': ['description', 'amount'],
    'other': [],
}

RECEIPT_METHODS = {'cash', 'bank_transfer', 'ecocash', 'card', 'cheque'}


# --------------------------------------------------------------- field helpers

def _field(extraction, key):
    """Return the {value, confidence} pair for a field, tolerating human-edited
    plain values (a bare value is treated as confidence 1.0)."""
    raw = (extraction or {}).get(key)
    if isinstance(raw, dict) and ('value' in raw or 'confidence' in raw):
        return raw.get('value'), raw.get('confidence')
    if raw is None:
        return None, None
    return raw, 1.0


def _value(extraction, key):
    return _field(extraction, key)[0]


def empty_scaffold(doc_type):
    fields = SCHEMAS.get(doc_type, [])
    scaffold = {f: {'value': None, 'confidence': 0} for f in fields}
    if doc_type == 'vendor_bill':
        scaffold['line_items'] = []
    return scaffold


# --------------------------------------------------------------- normalization

def parse_date(value):
    """Coerce dd/mm/yyyy, iso and a few common shapes to an ISO date string."""
    if value in (None, ''):
        return None
    if isinstance(value, (date, datetime)):
        return value.strftime('%Y-%m-%d')
    text = str(value).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y', '%d.%m.%Y', '%d %b %Y', '%d %B %Y'):
        try:
            return datetime.strptime(text, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def parse_money(value):
    """"USD 1,150.00" / "$1.150,00"-ish → Decimal, or None if unparseable."""
    if value in (None, ''):
        return None
    if isinstance(value, (int, float, Decimal)):
        try:
            return Decimal(str(value)).quantize(TWO)
        except InvalidOperation:
            return None
    text = str(value)
    # Strip currency codes/symbols and spaces, keep digits/.,-
    text = re.sub(r'[^0-9.,-]', '', text)
    if not text:
        return None
    # If both separators present, assume the last one is the decimal point.
    if ',' in text and '.' in text:
        if text.rfind(',') > text.rfind('.'):
            text = text.replace('.', '').replace(',', '.')
        else:
            text = text.replace(',', '')
    else:
        text = text.replace(',', '')
    try:
        return Decimal(text).quantize(TWO)
    except InvalidOperation:
        return None


def normalize_currency(value):
    if value in (None, ''):
        return None
    text = str(value).strip().upper()
    if text in ('ZIG', 'ZWL'):
        return 'ZWG'
    return text[:3] if text else None


def _normalize_value(key, value):
    low = key.lower()
    if 'date' in low:
        return parse_date(value) or value
    if low == 'currency':
        return normalize_currency(value) or value
    if any(t in low for t in ('amount', 'total', 'subtotal', 'price')):
        money = parse_money(value)
        return str(money) if money is not None else value
    return value


def normalize(extraction):
    """Coerce dates/money/currency in-place-style, preserving confidences."""
    result = {}
    for key, raw in (extraction or {}).items():
        if key == 'line_items' and isinstance(raw, list):
            result[key] = [
                {**item, **{k: _normalize_value(k, v) for k, v in item.items()}}
                for item in raw
            ]
            continue
        value, conf = _field(extraction, key)
        norm = _normalize_value(key, value)
        result[key] = {'value': norm, 'confidence': conf if conf is not None else 0}
    return result


def score(extraction):
    """Weakest-link: min confidence across present required fields (0..1)."""
    # Infer doc type from which required set best fits the present keys.
    best = ZERO
    for doc_type, req in REQUIRED.items():
        if not req:
            continue
        confs = []
        for key in req:
            value, conf = _field(extraction, key)
            if value in (None, ''):
                continue
            confs.append(Decimal(str(conf if conf is not None else 0)))
        if len(confs) == len(req) and confs:
            best = max(best, min(confs))
    return best


# --------------------------------------------------------------- AI extraction

def _schema_prompt(doc_type):
    if doc_type == 'vendor_bill':
        return (
            'supplier_name, supplier_tax_number, bill_number, date, due_date, currency, '
            'line_items (array of {description, quantity, unit_price, expense_hint}), '
            'subtotal, total'
        )
    if doc_type == 'fee_receipt':
        return 'student_code_or_name, amount, date, currency, method, reference, bank_hint'
    if doc_type == 'expense':
        return 'description, amount, date, currency, expense_category_hint, bank_hint'
    return 'description'


def _build_prompt(doc_type):
    if doc_type in ('other', '', None):
        classify = (
            'First classify this document as one of: vendor_bill, fee_receipt, expense, other. '
            'Then extract fields for that type.'
        )
        fields = (
            'For vendor_bill: ' + _schema_prompt('vendor_bill') + '. '
            'For fee_receipt: ' + _schema_prompt('fee_receipt') + '. '
            'For expense: ' + _schema_prompt('expense') + '.'
        )
    else:
        classify = f'This document is a {doc_type}.'
        fields = 'Extract these fields: ' + _schema_prompt(doc_type) + '.'
    return (
        f'{classify} {fields} '
        'Return ONLY a JSON object of the form '
        '{"doc_type": "...", "fields": {"<name>": {"value": <value>, "confidence": <0..1>}}}. '
        'For line_items, "value" is an array of objects. '
        'Use null for a value you cannot read, with confidence 0. Do not invent values.'
    )


def extract_item(item):
    """Run Claude Vision extraction when configured; otherwise leave empty
    scaffolding for manual entry. NEVER crashes on a missing key or SDK error."""
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', '')
    model = getattr(settings, 'AI_MODEL', 'claude-sonnet-4-5')

    if not api_key or not item.file:
        _fallback(item)
        return item

    try:
        import anthropic  # lazy import: app must load even if not installed

        content_block = _file_block(item)
        if content_block is None:
            _fallback(item)
            return item

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=model,
            max_tokens=2048,
            messages=[{
                'role': 'user',
                'content': [content_block, {'type': 'text', 'text': _build_prompt(item.doc_type)}],
            }],
        )
        text = ''.join(getattr(b, 'text', '') for b in message.content)
        payload = _parse_json(text)
        if payload is None:
            _fallback(item)
            return item

        detected = payload.get('doc_type')
        if detected in dict(item.DOC_TYPES) and item.doc_type in ('other', ''):
            item.doc_type = detected
        fields = payload.get('fields', payload)
        item.extraction = normalize(fields)
        item.raw_text = item.raw_text or text
        item.confidence = score(item.extraction)
        build_proposal(item)
        item.status = 'extracted' if item.proposed.get('gate_passed') else 'needs_review'
        item.save()
        return item
    except Exception as exc:  # missing SDK, network, API error — degrade gracefully
        _fallback(item, note=f'AI extraction unavailable: {exc}')
        return item


def _fallback(item, note=''):
    doc_type = item.doc_type if item.doc_type != 'other' else 'other'
    if not item.extraction:
        item.extraction = empty_scaffold(doc_type)
    item.confidence = ZERO
    item.status = 'needs_review'
    if note:
        item.notes = (item.notes + '\n' + note).strip() if item.notes else note
    item.save()


def _file_block(item):
    """Build an image or PDF content block from the uploaded file."""
    mime = (item.mime_type or '').lower()
    try:
        item.file.open('rb')
        data = item.file.read()
    finally:
        try:
            item.file.close()
        except Exception:
            pass
    b64 = base64.standard_b64encode(data).decode('ascii')
    if 'pdf' in mime or (item.original_filename or '').lower().endswith('.pdf'):
        return {
            'type': 'document',
            'source': {'type': 'base64', 'media_type': 'application/pdf', 'data': b64},
        }
    if mime.startswith('image/'):
        return {'type': 'image', 'source': {'type': 'base64', 'media_type': mime, 'data': b64}}
    return None


def _parse_json(text):
    text = (text or '').strip()
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except (ValueError, TypeError):
        return None


# --------------------------------------------------------------- proposal build

def _guess_expense_account(hint):
    """Map a free-text expense hint to a ChartOfAccount, else the fallback."""
    if hint:
        text = str(hint).strip()
        code_match = re.match(r'^(\d{4})', text)
        if code_match:
            acct = ChartOfAccount.objects.filter(code=code_match.group(1), account_type='expense').first()
            if acct:
                return acct
        acct = ChartOfAccount.objects.filter(
            account_type='expense', is_active=True, name__icontains=text[:20]
        ).first()
        if acct:
            return acct
    return ChartOfAccount.objects.filter(code=FALLBACK_EXPENSE_CODE).first()


def _resolve_bank(bank_hint, currency):
    if bank_hint:
        text = str(bank_hint).strip()
        bank = BankAccount.objects.filter(
            currency=currency, is_active=True, name__icontains=text[:20]
        ).first()
        if bank:
            return bank
    return (
        BankAccount.objects.filter(currency=currency, is_active=True, is_default=True).first()
        or BankAccount.objects.filter(currency=currency, is_active=True).first()
    )


def _resolve_student(code_or_name):
    from apps.students.models import Student

    if not code_or_name:
        return None, False
    text = str(code_or_name).strip()
    student = Student.objects.filter(code__iexact=text).first()
    if student:
        return student, False
    matches = Student.objects.filter(
        models_q_name(text)
    )[:3]
    matches = list(matches)
    if len(matches) == 1:
        return matches[0], False
    if len(matches) > 1:
        return None, True  # ambiguous
    return None, False


def models_q_name(text):
    from django.db.models import Q

    q = Q()
    for part in text.split():
        q |= Q(first_name__icontains=part) | Q(last_name__icontains=part)
    return q


def _account_exists(code):
    return ChartOfAccount.objects.filter(code=code).exists()


def build_proposal(item):
    """Turn the (possibly human-edited) extraction into item.proposed with a
    journal-leg preview and balanced/problems/gate decision flags."""
    ex = item.extraction or {}
    currency = normalize_currency(_value(ex, 'currency')) or item.target_currency or 'USD'
    problems = []

    if item.doc_type == 'vendor_bill':
        proposed = _build_vendor_bill(item, ex, currency, problems)
    elif item.doc_type == 'fee_receipt':
        proposed = _build_fee_receipt(item, ex, currency, problems)
    elif item.doc_type == 'expense':
        proposed = _build_expense(item, ex, currency, problems)
    else:
        proposed = {'doc_type': 'other', 'problems': ['Unsupported document type for posting.']}
        problems = proposed['problems']

    legs = proposed.get('journal_preview', [])
    dr = sum((Decimal(l.get('dr', '0')) for l in legs), ZERO)
    cr = sum((Decimal(l.get('cr', '0')) for l in legs), ZERO)
    balanced = bool(legs) and dr.quantize(TWO) == cr.quantize(TWO)
    if legs and not balanced:
        problems.append(f'Journal not balanced: Dr {dr} vs Cr {cr}.')

    proposed['balanced'] = balanced
    proposed['problems'] = problems
    proposed['gate_passed'] = balanced and not problems
    item.proposed = proposed
    item.confidence = score(ex)
    return proposed


def _build_vendor_bill(item, ex, currency, problems):
    tax = _value(ex, 'supplier_tax_number')
    name = _value(ex, 'supplier_name')
    from apps.procurement.models import Supplier

    supplier = None
    if tax:
        supplier = Supplier.objects.filter(tax_number=str(tax).strip()).first()
    if supplier is None and name:
        supplier = Supplier.objects.filter(name__iexact=str(name).strip()).first()
    will_create = supplier is None
    if will_create and not name:
        problems.append('Supplier name missing; cannot create a supplier.')

    raw_lines = _value(ex, 'line_items') or []
    lines = []
    total = ZERO
    for raw in raw_lines:
        desc = raw.get('description') or ''
        qty = parse_money(raw.get('quantity')) or Decimal('1')
        unit = parse_money(raw.get('unit_price')) or ZERO
        amount = (qty * unit).quantize(TWO)
        total += amount
        acct = _guess_expense_account(raw.get('expense_hint'))
        if acct is None:
            problems.append(f'No expense account for line "{desc}".')
        lines.append({
            'description': desc,
            'quantity': str(qty),
            'unit_price': str(unit),
            'amount': str(amount),
            'expense_account_code': acct.code if acct else None,
            'expense_account_id': acct.pk if acct else None,
        })

    if not lines:
        # Fall back to a single line from the stated total.
        total = parse_money(_value(ex, 'total')) or ZERO
        acct = _guess_expense_account(None)
        if total > 0 and acct is not None:
            lines.append({
                'description': str(name or 'Vendor bill'),
                'quantity': '1', 'unit_price': str(total), 'amount': str(total),
                'expense_account_code': acct.code, 'expense_account_id': acct.pk,
            })
        else:
            problems.append('No line items and no usable total.')

    ap_code = _ap_code(currency, problems)
    legs = [
        {'account': l['expense_account_code'], 'dr': l['amount'], 'cr': '0'}
        for l in lines if l['expense_account_code']
    ]
    if total > 0 and ap_code:
        legs.append({'account': ap_code, 'dr': '0', 'cr': str(total.quantize(TWO))})

    return {
        'doc_type': 'vendor_bill',
        'supplier': {
            'id': supplier.pk if supplier else None,
            'name': str(name) if name else '',
            'tax_number': str(tax) if tax else '',
            'will_be_created': will_create,
        },
        'supplier_will_be_created': will_create,
        'date': parse_date(_value(ex, 'date')) or str(timezone.localdate()),
        'due_date': parse_date(_value(ex, 'due_date')) or parse_date(_value(ex, 'date')) or str(timezone.localdate()),
        'currency': currency,
        'supplier_reference': str(_value(ex, 'bill_number') or ''),
        'lines': lines,
        'total': str(total.quantize(TWO)),
        'journal_preview': legs,
    }


def _build_fee_receipt(item, ex, currency, problems):
    student, ambiguous = _resolve_student(_value(ex, 'student_code_or_name'))
    if ambiguous:
        problems.append('Student name is ambiguous; pick the exact student.')
    elif student is None:
        problems.append('Student not found.')

    amount = parse_money(_value(ex, 'amount')) or ZERO
    if amount <= 0:
        problems.append('Receipt amount must be positive.')

    bank = _resolve_bank(_value(ex, 'bank_hint'), currency)
    if bank is None:
        problems.append(f'No bank account for {currency}.')
    else:
        currency = bank.currency  # receipt currency follows the bank

    method = str(_value(ex, 'method') or 'cash').strip().lower().replace(' ', '_')
    if method not in RECEIPT_METHODS:
        method = 'cash'

    ar_code = _ar_code(currency, problems)
    legs = []
    if bank and amount > 0:
        legs.append({'account': bank.gl_account.code, 'dr': str(amount), 'cr': '0'})
    if ar_code and amount > 0:
        legs.append({'account': ar_code, 'dr': '0', 'cr': str(amount)})

    return {
        'doc_type': 'fee_receipt',
        'student': {
            'id': student.pk if student else None,
            'code': student.code if student else None,
            'name': student.full_name if student else str(_value(ex, 'student_code_or_name') or ''),
            'found': student is not None,
            'ambiguous': ambiguous,
        },
        'bank_account_id': bank.pk if bank else None,
        'bank_account_code': bank.code if bank else None,
        'amount': str(amount),
        'date': parse_date(_value(ex, 'date')) or str(timezone.localdate()),
        'currency': currency,
        'method': method,
        'reference': str(_value(ex, 'reference') or ''),
        'journal_preview': legs,
    }


def _build_expense(item, ex, currency, problems):
    amount = parse_money(_value(ex, 'amount')) or ZERO
    if amount <= 0:
        problems.append('Expense amount must be positive.')

    acct = _guess_expense_account(_value(ex, 'expense_category_hint'))
    if acct is None:
        problems.append('No expense account resolved.')

    bank = _resolve_bank(_value(ex, 'bank_hint'), currency)
    if bank is None:
        problems.append(f'No bank account for {currency}.')
    else:
        currency = bank.currency

    legs = []
    if acct and amount > 0:
        legs.append({'account': acct.code, 'dr': str(amount), 'cr': '0'})
    if bank and amount > 0:
        legs.append({'account': bank.gl_account.code, 'dr': '0', 'cr': str(amount)})

    return {
        'doc_type': 'expense',
        'description': str(_value(ex, 'description') or 'Expense'),
        'amount': str(amount),
        'date': parse_date(_value(ex, 'date')) or str(timezone.localdate()),
        'currency': currency,
        'expense_account_code': acct.code if acct else None,
        'expense_account_id': acct.pk if acct else None,
        'bank_account_id': bank.pk if bank else None,
        'bank_account_code': bank.code if bank else None,
        'journal_preview': legs,
    }


def _ap_code(currency, problems):
    try:
        return AccountMapping.resolve('ap_control', currency).code
    except ValidationError:
        problems.append(f'No AP control account mapped for {currency}.')
        return None


def _ar_code(currency, problems):
    try:
        return AccountMapping.resolve('ar_control', currency).code
    except ValidationError:
        problems.append(f'No AR control account mapped for {currency}.')
        return None


# --------------------------------------------------------------- approval

def approve_item(item, user):
    """The ONLY path to the ledger. Rebuilds the proposal from the current
    extraction, refuses unless balanced with no blocking problems, then creates
    and posts the real document through the existing services."""
    if item.status == 'posted':
        raise ValidationError('This item is already posted.')

    proposed = build_proposal(item)
    item.save(update_fields=['proposed', 'confidence'])

    if not proposed.get('balanced'):
        raise ValidationError('Proposal is not balanced; cannot approve.')
    if proposed.get('problems'):
        raise ValidationError('Blocking problems remain: ' + '; '.join(proposed['problems']))

    with transaction.atomic():
        if item.doc_type == 'vendor_bill':
            posted_type, posted_id = _post_vendor_bill(item, proposed, user)
        elif item.doc_type == 'fee_receipt':
            posted_type, posted_id = _post_fee_receipt(item, proposed, user)
        elif item.doc_type == 'expense':
            posted_type, posted_id = _post_expense(item, proposed, user)
        else:
            raise ValidationError(f'Cannot post a {item.doc_type} document.')

        item.status = 'posted'
        item.posted_document_type = posted_type
        item.posted_document_id = str(posted_id)
        item.reviewed_by = user
        item.reviewed_at = timezone.now()
        item.save(update_fields=[
            'status', 'posted_document_type', 'posted_document_id', 'reviewed_by', 'reviewed_at',
        ])
        AuditTrail.log('post', item, user=user, changes={
            'posted_document_type': posted_type, 'posted_document_id': str(posted_id),
        })
    return item


def _post_vendor_bill(item, proposed, user):
    from apps.procurement.models import Supplier, VendorBill, VendorBillLine

    sup = proposed['supplier']
    supplier = None
    if sup.get('id'):
        supplier = Supplier.objects.filter(pk=sup['id']).first()
    if supplier is None and sup.get('tax_number'):
        supplier = Supplier.objects.filter(tax_number=sup['tax_number']).first()
    if supplier is None:
        supplier = Supplier.objects.filter(name__iexact=sup['name']).first()
    if supplier is None:
        supplier = Supplier.objects.create(
            code=DocumentSequence.next_for('SUP'),
            name=sup['name'],
            tax_number=sup.get('tax_number') or '',
            default_currency=proposed['currency'],
        )

    bill = VendorBill.objects.create(
        number=DocumentSequence.next_for('BIL'),
        supplier=supplier,
        supplier_reference=proposed.get('supplier_reference', ''),
        date=proposed['date'],
        due_date=proposed['due_date'],
        currency=proposed['currency'],
        ocr_payload={'ingestion_item': item.pk, 'extraction': item.extraction},
        created_by=user,
    )
    for line in proposed['lines']:
        VendorBillLine.objects.create(
            bill=bill,
            expense_account=ChartOfAccount.objects.get(pk=line['expense_account_id']),
            description=line['description'],
            quantity=Decimal(line['quantity']),
            unit_price=Decimal(line['unit_price']),
        )
    bill.post(user=user)
    return 'procurement.VendorBill', bill.pk


def _post_fee_receipt(item, proposed, user):
    from apps.fees.services import create_receipt
    from apps.students.models import Student

    student = Student.objects.get(pk=proposed['student']['id'])
    bank = BankAccount.objects.get(pk=proposed['bank_account_id'])
    receipt = create_receipt(
        student=student,
        bank_account=bank,
        amount=Decimal(proposed['amount']),
        date=proposed['date'],
        payment_method=proposed['method'],
        reference=proposed.get('reference', ''),
        user=user,
    )
    return 'fees.Receipt', receipt.pk


def _post_expense(item, proposed, user):
    expense_acct = ChartOfAccount.objects.get(pk=proposed['expense_account_id'])
    bank = BankAccount.objects.get(pk=proposed['bank_account_id'])
    amount = Decimal(proposed['amount'])
    journal = build_and_post_journal(
        'payments',
        proposed['date'],
        proposed['currency'],
        proposed.get('description', 'Expense'),
        [
            LineSpec(account=expense_acct, debit=amount, description=proposed.get('description', 'Expense')),
            LineSpec(account=bank.gl_account, credit=amount, bank_account=bank,
                     description=proposed.get('description', 'Expense')),
        ],
        reference=f'INGEST-{item.pk}',
        user=user,
        source=('ingestion.IngestionItem', item.pk, f'INGEST-{item.pk}'),
    )
    return 'accounting.Journal', journal.pk
