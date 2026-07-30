from rest_framework import serializers

from .models import IngestionItem


class IngestionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = IngestionItem
        fields = [
            'id', 'doc_type', 'source', 'status', 'file', 'original_filename',
            'mime_type', 'raw_text', 'extraction', 'proposed', 'confidence',
            'notes', 'target_currency', 'posted_document_type', 'posted_document_id',
            'rejection_reason', 'created_by', 'reviewed_by', 'reviewed_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'status', 'proposed', 'confidence', 'posted_document_type',
            'posted_document_id', 'rejection_reason', 'created_by', 'reviewed_by',
            'reviewed_at', 'created_at', 'updated_at',
        ]


class ExtractionUpdateSerializer(serializers.Serializer):
    """Human-edited per-field extraction; triggers re-normalize + re-propose."""
    extraction = serializers.JSONField()
    doc_type = serializers.ChoiceField(
        choices=IngestionItem.DOC_TYPES, required=False
    )
    target_currency = serializers.CharField(max_length=3, required=False)


class RejectSerializer(serializers.Serializer):
    reason = serializers.CharField(allow_blank=True, required=False, default='')
