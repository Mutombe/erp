from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.mixins import TenantScopedViewSet
from apps.core.permissions import RoleWritePermission

from .filters import (
    DepartmentFilter,
    ItemFilter,
    StockLevelFilter,
    StockMoveFilter,
    WarehouseFilter,
)
from .models import (
    Department,
    Item,
    ItemCategory,
    StockLevel,
    StockLot,
    StockMove,
    StockRequisition,
    Warehouse,
    issue_stock,
    receive_stock,
    transfer_stock,
)
from .serializers import (
    DepartmentSerializer,
    IssueStockSerializer,
    ItemCategorySerializer,
    ItemSerializer,
    ReceiveStockSerializer,
    RequisitionSerializer,
    StockLevelSerializer,
    StockLotSerializer,
    StockMoveSerializer,
    TransferStockSerializer,
    WarehouseSerializer,
)


class InventoryViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'inventory'


class ItemCategoryViewSet(InventoryViewSet):
    queryset = ItemCategory.objects.all()
    serializer_class = ItemCategorySerializer
    filterset_fields = ['is_active']
    search_fields = ['name']


class DepartmentViewSet(InventoryViewSet):
    queryset = Department.objects.select_related('expense_account').annotate(
        stock_move_count_annotated=Count('stock_moves')
    ).order_by('name')
    serializer_class = DepartmentSerializer
    filterset_class = DepartmentFilter
    search_fields = ['code', 'name']
    ordering_fields = '__all__'


class ItemViewSet(InventoryViewSet):
    queryset = Item.objects.select_related('category').all()
    serializer_class = ItemSerializer
    filterset_class = ItemFilter
    search_fields = ['code', 'name', 'barcode']
    ordering_fields = '__all__'

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        """Active items at or below their reorder level, with a suggested order
        quantity — the reorder worklist for the storekeeper."""
        from django.db.models import F

        qs = self.filter_queryset(self.get_queryset()).filter(
            is_active=True, reorder_level__gt=0, qty_on_hand__lte=F('reorder_level'),
        ).order_by('code')
        page = self.paginate_queryset(qs)
        data = self.get_serializer(page if page is not None else qs, many=True).data
        return self.get_paginated_response(data) if page is not None else Response(data)

    @action(detail=False, methods=['get'], url_path='by-barcode')
    def by_barcode(self, request):
        """Resolve a scanned barcode to an item within the active school scope."""
        barcode = (request.query_params.get('barcode') or '').strip()
        if not barcode:
            return Response({'detail': 'Provide a barcode.'}, status=status.HTTP_400_BAD_REQUEST)
        item = self.filter_queryset(self.get_queryset()).filter(barcode=barcode).first()
        if item is None:
            return Response({'detail': 'No item matches that barcode.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(item).data)


class WarehouseViewSet(InventoryViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    filterset_class = WarehouseFilter
    search_fields = ['code', 'name', 'location']
    ordering_fields = '__all__'


class StockLevelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockLevel.objects.select_related('item', 'warehouse').all()
    serializer_class = StockLevelSerializer
    filterset_class = StockLevelFilter
    search_fields = ['item__code', 'item__name', 'warehouse__code', 'warehouse__name']
    ordering_fields = '__all__'

    def get_queryset(self):
        # StockLevel derives its school from its item; scope the list accordingly.
        qs = super().get_queryset()
        active = getattr(self.request, 'school', None)
        if active is not None:
            return qs.filter(item__school=active)
        school_ids = getattr(self.request, 'school_ids', None)
        if school_ids is None:
            return qs
        return qs.filter(item__school_id__in=school_ids)


class StockMoveViewSet(TenantScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = StockMove.objects.select_related(
        'item', 'warehouse_from', 'warehouse_to', 'journal', 'department'
    ).all()
    serializer_class = StockMoveSerializer
    filterset_class = StockMoveFilter
    search_fields = ['number', 'item__code', 'item__name', 'department__name', 'department__code']
    ordering_fields = '__all__'

    def get_queryset(self):
        qs = super().get_queryset()
        start = self.request.query_params.get('from')
        end = self.request.query_params.get('to')
        if start:
            qs = qs.filter(date__gte=start)
        if end:
            qs = qs.filter(date__lte=end)
        return qs


class StockLotViewSet(TenantScopedViewSet, viewsets.ReadOnlyModelViewSet):
    queryset = StockLot.objects.select_related('item', 'warehouse').filter(quantity__gt=0)
    serializer_class = StockLotSerializer
    filterset_fields = ['item', 'warehouse']
    search_fields = ['lot_code', 'item__code', 'item__name']
    ordering_fields = '__all__'

    @action(detail=False, methods=['get'])
    def expiring(self, request):
        """Lots expiring on/before ?before=YYYY-MM-DD (default 90 days out).
        Feeds the expiry-watch report."""
        from datetime import timedelta

        from django.utils import timezone

        before = request.query_params.get('before')
        if not before:
            before = (timezone.localdate() + timedelta(days=90)).isoformat()
        qs = self.filter_queryset(self.get_queryset()).filter(
            expiry_date__isnull=False, expiry_date__lte=before,
        ).order_by('expiry_date')
        page = self.paginate_queryset(qs)
        data = self.get_serializer(page if page is not None else qs, many=True).data
        return self.get_paginated_response(data) if page is not None else Response(data)


class RequisitionViewSet(TenantScopedViewSet, viewsets.ModelViewSet):
    queryset = StockRequisition.objects.select_related(
        'warehouse', 'department', 'requested_by'
    ).prefetch_related('lines__item').all()
    serializer_class = RequisitionSerializer
    permission_classes = [RoleWritePermission]
    write_area = 'inventory'
    filterset_fields = ['status', 'warehouse', 'department']
    search_fields = ['number', 'note']
    ordering_fields = '__all__'
    # Approving/issuing a requisition is an 'approve'/'post'-grade action.
    action_permissions = {'approve': 'approve', 'issue': 'post', 'reject': 'approve'}

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        req = self.get_object()
        req.submit()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        req = self.get_object()
        req.approve(user=request.user, approvals=request.data.get('approvals'))
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        req = self.get_object()
        req.reject(reason=request.data.get('reason', ''), user=request.user)
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        req = self.get_object()
        req.issue(user=request.user)
        req.refresh_from_db()
        return Response(self.get_serializer(req).data)


class StockOpsViewSet(viewsets.ViewSet):
    """Stock operations: receive / issue / transfer / inter-school transfer."""

    permission_classes = [RoleWritePermission]
    write_area = 'inventory'

    @action(detail=False, methods=['post'])
    def receive(self, request):
        serializer = ReceiveStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        move = receive_stock(user=request.user, **serializer.validated_data)
        return Response(StockMoveSerializer(move).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def issue(self, request):
        serializer = IssueStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        move = issue_stock(user=request.user, **serializer.validated_data)
        return Response(StockMoveSerializer(move).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def transfer(self, request):
        serializer = TransferStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        move = transfer_stock(user=request.user, **serializer.validated_data)
        return Response(StockMoveSerializer(move).data, status=status.HTTP_201_CREATED)
