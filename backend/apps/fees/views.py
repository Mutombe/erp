from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import RoleWritePermission

from . import services
from .models import (
    BillingRun,
    BursaryAward,
    CreditNote,
    FeeCategory,
    FeeInvoice,
    FeeStructure,
    Receipt,
)
from .serializers import (
    BillingRunSerializer,
    BursaryAwardSerializer,
    CreditNoteSerializer,
    FeeCategorySerializer,
    FeeInvoiceSerializer,
    FeeStructureSerializer,
    ReceiptCreateSerializer,
    ReceiptSerializer,
)


class FeesViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'fees'


class FeeCategoryViewSet(FeesViewSet):
    queryset = FeeCategory.objects.all()
    serializer_class = FeeCategorySerializer
    filterset_fields = ['is_active']
    search_fields = ['code', 'name']
    pagination_class = None


class FeeStructureViewSet(FeesViewSet):
    queryset = FeeStructure.objects.select_related('academic_year', 'term', 'grade', 'fee_category').all()
    serializer_class = FeeStructureSerializer
    filterset_fields = ['academic_year', 'term', 'grade', 'fee_category', 'currency', 'applies_to']


class BursaryAwardViewSet(FeesViewSet):
    queryset = BursaryAward.objects.select_related('student', 'fee_category', 'academic_year', 'term').all()
    serializer_class = BursaryAwardSerializer
    filterset_fields = ['student', 'fee_category', 'academic_year', 'term', 'award_type', 'is_active']
    search_fields = ['student__code', 'student__first_name', 'student__last_name', 'funder']


class BillingRunViewSet(FeesViewSet):
    queryset = BillingRun.objects.select_related('term', 'created_by').prefetch_related('grades').all()
    serializer_class = BillingRunSerializer
    filterset_fields = ['term', 'currency', 'status']
    search_fields = ['number']
    throttle_scope = 'billing_run'

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        run = self.get_object()
        return Response(services.preview_billing_run(run))

    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        run = self.get_object()
        run = services.execute_billing_run(run.pk, user_id=request.user.pk)
        return Response(BillingRunSerializer(run).data)


class FeeInvoiceViewSet(FeesViewSet):
    queryset = (
        FeeInvoice.objects.select_related('student', 'term', 'billing_run', 'journal')
        .prefetch_related('lines__fee_category')
        .all()
    )
    serializer_class = FeeInvoiceSerializer
    filterset_fields = ['status', 'term', 'student', 'currency', 'billing_run']
    search_fields = ['number', 'student__code', 'student__first_name', 'student__last_name']
    ordering_fields = ['date', 'due_date', 'number', 'total']

    @action(detail=True, methods=['post'], url_path='post')
    def post_invoice(self, request, pk=None):
        invoice = self.get_object()
        invoice.post(user=request.user)
        return Response(self.get_serializer(invoice).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        invoice.cancel(reason=request.data.get('reason', ''), user=request.user)
        invoice.refresh_from_db()
        return Response(self.get_serializer(invoice).data)


class CreditNoteViewSet(FeesViewSet):
    queryset = (
        CreditNote.objects.select_related('student', 'invoice', 'journal')
        .prefetch_related('lines__fee_category')
        .all()
    )
    serializer_class = CreditNoteSerializer
    filterset_fields = ['status', 'student', 'invoice', 'currency']
    search_fields = ['number', 'student__code', 'student__first_name', 'student__last_name']

    @action(detail=True, methods=['post'], url_path='post')
    def post_credit_note(self, request, pk=None):
        credit_note = self.get_object()
        credit_note.post(user=request.user)
        return Response(self.get_serializer(credit_note).data)


class ReceiptViewSet(FeesViewSet):
    queryset = (
        Receipt.objects.select_related('student', 'payer_guardian', 'bank_account', 'journal')
        .prefetch_related('allocations__invoice')
        .all()
    )
    serializer_class = ReceiptSerializer
    filterset_fields = ['student', 'bank_account', 'currency', 'status', 'payment_method']
    search_fields = ['number', 'reference', 'student__code', 'student__first_name', 'student__last_name']
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        serializer = ReceiptCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        allocations = data.get('allocations')
        receipt = services.create_receipt(
            student=data['student'],
            bank_account=data['bank_account'],
            amount=data['amount'],
            date=data['date'],
            payment_method=data.get('payment_method', 'cash'),
            payer_guardian=data.get('payer_guardian'),
            reference=data.get('reference', ''),
            notes=data.get('notes', ''),
            explicit_allocations=(
                [(a['invoice'].pk, a['amount']) for a in allocations] if allocations else None
            ),
            user=request.user,
        )
        return Response(ReceiptSerializer(receipt).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        receipt = self.get_object()
        services.reverse_receipt(receipt, reason=request.data.get('reason', ''), user=request.user)
        receipt.refresh_from_db()
        return Response(self.get_serializer(receipt).data)
