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
    StockMove,
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
    StockLevelSerializer,
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


class StockOpsViewSet(viewsets.ViewSet):
    """Stock operations: receive / issue / transfer."""

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
