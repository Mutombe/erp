"""Document-ingestion landing zone.

An IngestionItem is an inbox row: a raw document (upload/email/api) that the AI
proposes a structured document for, a human reviews and edits, and — only on
explicit approval — is turned into a real posted document through the existing
services (VendorBill.post, create_receipt, build_and_post_journal). The ledger
is never written from here; approval delegates to the proven posting pathway.
"""
from django.db import models


class IngestionItem(models.Model):
    DOC_TYPES = [
        ('vendor_bill', 'Vendor bill'),
        ('fee_receipt', 'Fee receipt'),
        ('expense', 'Expense'),
        ('other', 'Other / unknown'),
    ]
    SOURCES = [
        ('upload', 'Upload'),
        ('email', 'Email'),
        ('api', 'API'),
    ]
    STATUS = [
        ('received', 'Received'),
        ('extracted', 'Extracted'),
        ('needs_review', 'Needs review'),
        ('approved', 'Approved'),
        ('posted', 'Posted'),
        ('rejected', 'Rejected'),
    ]

    doc_type = models.CharField(max_length=20, choices=DOC_TYPES, default='other', db_index=True)
    source = models.CharField(max_length=10, choices=SOURCES, default='upload')
    status = models.CharField(max_length=15, choices=STATUS, default='received', db_index=True)

    file = models.FileField(upload_to='ingestion/', null=True, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    raw_text = models.TextField(blank=True)

    # Per-field AI output: {field: {"value": ..., "confidence": 0..1}}.
    extraction = models.JSONField(default=dict, blank=True)
    # Normalized proposed document + a preview of the journal legs, plus
    # balanced / problems / gate_passed decision flags.
    proposed = models.JSONField(default=dict, blank=True)
    # Weakest-link score across present required fields (0..1, scaled here to 0..100 not required).
    confidence = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    notes = models.TextField(blank=True)
    target_currency = models.CharField(max_length=3, default='USD')

    # Lineage to the created & posted document (VendorBill / Receipt / Journal).
    posted_document_type = models.CharField(max_length=50, blank=True)
    posted_document_id = models.CharField(max_length=50, blank=True)
    rejection_reason = models.TextField(blank=True)

    created_by = models.ForeignKey(
        'core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='ingestion_items'
    )
    reviewed_by = models.ForeignKey(
        'core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'doc_type'])]

    def __str__(self):
        return f'{self.get_doc_type_display()} · {self.original_filename or self.pk} ({self.status})'
