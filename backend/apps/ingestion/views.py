from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.core.permissions import RoleWritePermission

from .filters import IngestionItemFilter
from .models import IngestionItem
from .serializers import (
    ExtractionUpdateSerializer,
    IngestionItemSerializer,
    RejectSerializer,
)
from .services import approve_item, build_proposal, extract_item, normalize


class IngestionItemViewSet(viewsets.ModelViewSet):
    """Inbox for AI-proposed documents: upload → review/edit → approve posts."""

    queryset = IngestionItem.objects.select_related('created_by', 'reviewed_by').all()
    serializer_class = IngestionItemSerializer
    permission_classes = [RoleWritePermission]
    write_area = 'procurement'
    filterset_class = IngestionItemFilter
    search_fields = ['original_filename', 'raw_text', 'notes']
    ordering_fields = ['created_at', 'updated_at', 'status', 'doc_type', 'confidence']

    def get_throttles(self):
        # Throttle only the upload endpoint, under the 'uploads' scope.
        if getattr(self, 'action', None) == 'upload':
            self.throttle_scope = 'uploads'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def destroy(self, request, *args, **kwargs):
        item = self.get_object()
        if item.status == 'posted':
            raise DRFValidationError('Cannot delete a posted ingestion item.')
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def upload(self, request):
        """multipart: file + doc_type (+ optional currency) → create item and
        best-effort extract it."""
        file = request.FILES.get('file')
        if not file:
            raise DRFValidationError('A file is required.')
        doc_type = request.data.get('doc_type') or 'other'
        if doc_type not in dict(IngestionItem.DOC_TYPES):
            raise DRFValidationError(f'Invalid doc_type "{doc_type}".')
        item = IngestionItem.objects.create(
            doc_type=doc_type,
            source='upload',
            file=file,
            original_filename=getattr(file, 'name', ''),
            mime_type=getattr(file, 'content_type', '') or '',
            target_currency=(request.data.get('currency') or 'USD').upper()[:3],
            created_by=request.user if request.user.is_authenticated else None,
        )
        extract_item(item)  # guarded; never crashes without a key
        item.refresh_from_db()
        return Response(self.get_serializer(item).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def extract(self, request, pk=None):
        item = self.get_object()
        extract_item(item)
        item.refresh_from_db()
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=['patch'], url_path='extraction')
    def edit_extraction(self, request, pk=None):
        """Save human-edited extraction fields → re-normalize + rebuild proposal."""
        item = self.get_object()
        serializer = ExtractionUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data.get('doc_type'):
            item.doc_type = data['doc_type']
        if data.get('target_currency'):
            item.target_currency = data['target_currency'].upper()[:3]
        item.extraction = normalize(data['extraction'])
        build_proposal(item)
        if item.status in ('received', 'extracted', 'needs_review'):
            item.status = 'extracted' if item.proposed.get('gate_passed') else 'needs_review'
        item.save()
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        item = self.get_object()
        try:
            approve_item(item, request.user if request.user.is_authenticated else None)
        except DjangoValidationError as exc:
            raise DRFValidationError(exc.messages if hasattr(exc, 'messages') else str(exc))
        item.refresh_from_db()
        return Response({
            **self.get_serializer(item).data,
            'lineage': {
                'posted_document_type': item.posted_document_type,
                'posted_document_id': item.posted_document_id,
            },
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        item = self.get_object()
        if item.status == 'posted':
            raise DRFValidationError('Cannot reject a posted item.')
        serializer = RejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item.status = 'rejected'
        item.rejection_reason = serializer.validated_data.get('reason', '')
        item.reviewed_by = request.user if request.user.is_authenticated else None
        from django.utils import timezone
        item.reviewed_at = timezone.now()
        item.save(update_fields=['status', 'rejection_reason', 'reviewed_by', 'reviewed_at'])
        return Response(self.get_serializer(item).data)
