"""Ingestion pipeline tests — all exercise the manual path (NO API key), so no
network is ever touched. They cover upload → edit → propose → approve for each
document type, plus the refusal and destroy guards."""
from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounting.models import BankAccount, ChartOfAccount
from apps.fees.models import Receipt
from apps.ingestion.models import IngestionItem
from apps.ingestion.services import approve_item, build_proposal, extract_item
from apps.procurement.models import VendorBill
from conftest import assert_gl_balanced

pytestmark = pytest.mark.django_db

D = Decimal


def _upload(doc_type='other', name='doc.pdf', content=b'%PDF-1.4 test'):
    return IngestionItem.objects.create(
        doc_type=doc_type,
        source='upload',
        file=SimpleUploadedFile(name, content, content_type='application/pdf'),
        original_filename=name,
        mime_type='application/pdf',
    )


# ------------------------------------------------------------------ upload / no key

def test_upload_without_key_lands_in_needs_review(seeded_db, settings):
    settings.ANTHROPIC_API_KEY = ''
    item = _upload(doc_type='vendor_bill')
    extract_item(item)
    item.refresh_from_db()
    assert item.status == 'needs_review'
    assert item.confidence == D('0')
    # Empty scaffolding matching the schema is present for manual entry.
    assert 'supplier_name' in item.extraction
    assert 'line_items' in item.extraction


# ------------------------------------------------------------------ vendor bill

def test_edit_extraction_builds_balanced_vendor_bill_proposal(seeded_db):
    item = _upload(doc_type='vendor_bill')
    item.extraction = {
        'supplier_name': {'value': 'Zesa Holdings', 'confidence': 0.9},
        'currency': {'value': 'USD', 'confidence': 0.95},
        'date': {'value': '15/02/2026', 'confidence': 0.9},
        'total': {'value': 'USD 150.00', 'confidence': 0.8},
        'line_items': [
            {'description': 'Electricity', 'quantity': 1, 'unit_price': 150, 'expense_hint': '5100'},
        ],
    }
    proposal = build_proposal(item)
    assert proposal['doc_type'] == 'vendor_bill'
    assert proposal['balanced'] is True
    assert proposal['gate_passed'] is True
    assert proposal['supplier_will_be_created'] is True
    assert proposal['total'] == '150.00'
    codes = {leg['account'] for leg in proposal['journal_preview']}
    assert '5100' in codes  # Utilities expense
    assert '2000' in codes  # AP control USD


def test_approve_vendor_bill_creates_and_posts_bill(seeded_db):
    item = _upload(doc_type='vendor_bill')
    item.extraction = {
        'supplier_name': {'value': 'Acme Cleaning Co', 'confidence': 0.9},
        'supplier_tax_number': {'value': 'TAX-999', 'confidence': 0.9},
        'currency': {'value': 'USD', 'confidence': 0.95},
        'date': {'value': '2026-02-15', 'confidence': 0.9},
        'line_items': [
            {'description': 'Office cleaning', 'quantity': 1, 'unit_price': 200, 'expense_hint': '5400'},
        ],
    }
    build_proposal(item)
    item.save()
    approve_item(item, user=None)
    item.refresh_from_db()

    assert item.status == 'posted'
    assert item.posted_document_type == 'procurement.VendorBill'
    bill = VendorBill.objects.get(pk=item.posted_document_id)
    assert bill.status == 'posted'
    assert bill.total == D('200.00')
    # Supplier auto-created and looked up by tax number.
    assert bill.supplier.tax_number == 'TAX-999'
    assert bill.supplier.name == 'Acme Cleaning Co'
    assert ChartOfAccount.objects.get(code='5400').current_balance == D('200.00')
    assert ChartOfAccount.objects.get(code='2000').current_balance == D('200.00')
    assert_gl_balanced()


# ------------------------------------------------------------------ fee receipt

def test_approve_fee_receipt_against_demo_student(student):
    bank = BankAccount.objects.get(code='BANK-USD')
    item = _upload(doc_type='fee_receipt')
    item.extraction = {
        'student_code_or_name': {'value': student.code, 'confidence': 0.95},
        'amount': {'value': '120.00', 'confidence': 0.9},
        'date': {'value': '2026-02-20', 'confidence': 0.9},
        'currency': {'value': 'USD', 'confidence': 0.95},
        'method': {'value': 'bank transfer', 'confidence': 0.8},
        'reference': {'value': 'DEP-77', 'confidence': 0.9},
        'bank_hint': {'value': 'Main Bank', 'confidence': 0.7},
    }
    proposal = build_proposal(item)
    assert proposal['gate_passed'] is True
    assert proposal['student']['found'] is True
    item.save()

    approve_item(item, user=None)
    item.refresh_from_db()
    assert item.status == 'posted'
    assert item.posted_document_type == 'fees.Receipt'
    receipt = Receipt.objects.get(pk=item.posted_document_id)
    assert receipt.amount == D('120.00')
    assert receipt.payment_method == 'bank_transfer'
    assert receipt.bank_account_id == bank.pk
    assert_gl_balanced()


# ------------------------------------------------------------------ expense

def test_approve_expense_posts_journal(seeded_db):
    item = _upload(doc_type='expense')
    item.extraction = {
        'description': {'value': 'Fuel for school bus', 'confidence': 0.9},
        'amount': {'value': '80.00', 'confidence': 0.9},
        'date': {'value': '2026-02-18', 'confidence': 0.9},
        'currency': {'value': 'USD', 'confidence': 0.95},
        'expense_category_hint': {'value': '5300', 'confidence': 0.8},
        'bank_hint': {'value': 'Cash', 'confidence': 0.6},
    }
    build_proposal(item)
    item.save()
    approve_item(item, user=None)
    item.refresh_from_db()
    assert item.status == 'posted'
    assert item.posted_document_type == 'accounting.Journal'
    assert ChartOfAccount.objects.get(code='5300').current_balance == D('80.00')
    assert_gl_balanced()


# ------------------------------------------------------------------ refusals

def test_approve_refuses_when_student_not_found(seeded_db):
    bank = BankAccount.objects.get(code='BANK-USD')  # noqa: F841 (ensures a bank exists)
    item = _upload(doc_type='fee_receipt')
    item.extraction = {
        'student_code_or_name': {'value': 'Nobody Nowhere', 'confidence': 0.9},
        'amount': {'value': '50.00', 'confidence': 0.9},
        'currency': {'value': 'USD', 'confidence': 0.95},
    }
    item.save()
    with pytest.raises(ValidationError):
        approve_item(item, user=None)
    item.refresh_from_db()
    assert item.status != 'posted'


def test_approve_refuses_when_unbalanced(seeded_db):
    item = _upload(doc_type='expense')
    # Missing expense account and bank → no legs → not balanced.
    item.extraction = {
        'description': {'value': 'Mystery spend', 'confidence': 0.5},
        'amount': {'value': '0', 'confidence': 0.5},
    }
    item.save()
    with pytest.raises(ValidationError):
        approve_item(item, user=None)
    item.refresh_from_db()
    assert item.status != 'posted'


# ------------------------------------------------------------------ destroy guard

def test_destroy_blocked_once_posted(seeded_db):
    item = _upload(doc_type='expense')
    item.extraction = {
        'description': {'value': 'Bank charges', 'confidence': 0.9},
        'amount': {'value': '5.00', 'confidence': 0.9},
        'currency': {'value': 'USD', 'confidence': 0.95},
        'expense_category_hint': {'value': '5600', 'confidence': 0.9},
        'bank_hint': {'value': 'Main Bank', 'confidence': 0.6},
    }
    build_proposal(item)
    item.save()
    approve_item(item, user=None)
    item.refresh_from_db()
    assert item.status == 'posted'

    from apps.core.models import Roles, User
    from rest_framework.test import APIClient

    admin = User.objects.create_user(email='bursar@school.test', password='x', role=Roles.BURSAR)
    client = APIClient()
    client.force_authenticate(user=admin)
    resp = client.delete(f'/api/ingestion/items/{item.pk}/')
    assert resp.status_code == 400  # blocked because posted
    assert IngestionItem.objects.filter(pk=item.pk).exists()
