from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import RoleWritePermission

from .models import (
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
    IssueStockSerializer,
    ItemCategorySerializer,
    ItemSerializer,
    ReceiveStockSerializer,
    StockLevelSerializer,
    StockMoveSerializer,
    TransferStockSerializer,
    WarehouseSerializer,
)


class InventoryViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'inventory'


class ItemCategoryViewSet(InventoryViewSet):
    queryset = ItemCategory.objects.all()
    serializer_class = ItemCategorySerializer
    filterset_fields = ['is_active']
    search_fields = ['name']
    pagination_class = None


class ItemViewSet(InventoryViewSet):
    queryset = Item.objects.select_related('category').all()
    serializer_class = ItemSerializer
    filterset_fields = ['category', 'item_type', 'is_active']
    search_fields = ['code', 'name', 'barcode']
    ordering_fields = ['code', 'name', 'qty_on_hand']


class WarehouseViewSet(InventoryViewSet):
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    filterset_fields = ['is_active']
    search_fields = ['code', 'name']
    pagination_class = None


class StockLevelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockLevel.objects.select_related('item', 'warehouse').all()
    serializer_class = StockLevelSerializer
    filterset_fields = ['item', 'warehouse']
    search_fields = ['item__code', 'item__name']


class StockMoveViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockMove.objects.select_related(
        'item', 'warehouse_from', 'warehouse_to', 'journal'
    ).all()
    serializer_class = StockMoveSerializer
    filterset_fields = ['item', 'move_type', 'warehouse_from', 'warehouse_to']
    search_fields = ['number', 'item__code', 'item__name', 'department']
    ordering_fields = ['date', 'id']

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
