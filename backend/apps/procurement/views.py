from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import RoleWritePermission

from .models import (
    GoodsReceivedNote,
    PurchaseOrder,
    Supplier,
    SupplierPayment,
    VendorBill,
    create_supplier_payment,
)
from .serializers import (
    GRNSerializer,
    PurchaseOrderSerializer,
    SupplierPaymentCreateSerializer,
    SupplierPaymentSerializer,
    SupplierSerializer,
    VendorBillSerializer,
)


class ProcurementViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'procurement'


class SupplierViewSet(ProcurementViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    filterset_fields = ['is_active', 'default_currency']
    search_fields = ['code', 'name', 'contact_person', 'phone', 'email']
    ordering_fields = ['name', 'code', 'created_at']


class PurchaseOrderViewSet(ProcurementViewSet):
    queryset = (
        PurchaseOrder.objects.select_related('supplier', 'approved_by', 'created_by')
        .prefetch_related('lines__item')
        .all()
    )
    serializer_class = PurchaseOrderSerializer
    filterset_fields = ['status', 'supplier', 'currency']
    search_fields = ['number', 'supplier__name']
    ordering_fields = ['date', 'number']

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        po = self.get_object()
        po.approve(user=request.user)
        return Response(self.get_serializer(po).data)


class GRNViewSet(ProcurementViewSet):
    queryset = (
        GoodsReceivedNote.objects.select_related('po__supplier', 'warehouse', 'journal')
        .prefetch_related('lines__po_line__item')
        .all()
    )
    serializer_class = GRNSerializer
    filterset_fields = ['po', 'warehouse', 'status']
    search_fields = ['number', 'po__number']

    @action(detail=True, methods=['post'], url_path='post')
    def post_grn(self, request, pk=None):
        grn = self.get_object()
        grn.post(user=request.user)
        return Response(self.get_serializer(grn).data)


class VendorBillViewSet(ProcurementViewSet):
    queryset = (
        VendorBill.objects.select_related('supplier', 'po', 'journal')
        .prefetch_related('lines__grn_line', 'lines__expense_account', 'lines__item')
        .all()
    )
    serializer_class = VendorBillSerializer
    filterset_fields = ['status', 'supplier', 'currency', 'po']
    search_fields = ['number', 'supplier_reference', 'supplier__name']
    ordering_fields = ['date', 'due_date', 'number', 'total']

    @action(detail=True, methods=['post'], url_path='post')
    def post_bill(self, request, pk=None):
        bill = self.get_object()
        bill.post(user=request.user)
        return Response(self.get_serializer(bill).data)


class SupplierPaymentViewSet(ProcurementViewSet):
    queryset = (
        SupplierPayment.objects.select_related('supplier', 'bank_account', 'journal')
        .prefetch_related('allocations__bill')
        .all()
    )
    serializer_class = SupplierPaymentSerializer
    filterset_fields = ['supplier', 'bank_account', 'currency', 'status']
    search_fields = ['number', 'reference', 'supplier__name']
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        serializer = SupplierPaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        allocations = data.get('allocations')
        payment = create_supplier_payment(
            supplier=data['supplier'],
            bank_account=data['bank_account'],
            amount=data['amount'],
            date=data['date'],
            reference=data.get('reference', ''),
            notes=data.get('notes', ''),
            explicit_allocations=(
                [(a['bill'].pk, a['amount']) for a in allocations] if allocations else None
            ),
            user=request.user,
        )
        return Response(SupplierPaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
