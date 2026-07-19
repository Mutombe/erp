from rest_framework import serializers

from .models import Item, ItemCategory, StockLevel, StockMove, Warehouse


class ItemCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCategory
        fields = ['id', 'name', 'inventory_account', 'consumption_expense_account', 'is_active']


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Item
        fields = [
            'id', 'code', 'name', 'category', 'category_name', 'uom', 'item_type',
            'avg_cost', 'qty_on_hand', 'reorder_level', 'barcode', 'is_active',
            'created_at',
        ]
        read_only_fields = ['avg_cost', 'qty_on_hand', 'created_at']


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ['id', 'code', 'name', 'location', 'storekeeper', 'is_active']


class StockLevelSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)

    class Meta:
        model = StockLevel
        fields = ['id', 'item', 'item_code', 'item_name', 'warehouse', 'warehouse_code', 'quantity']


class StockMoveSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_from_code = serializers.CharField(source='warehouse_from.code', read_only=True)
    warehouse_to_code = serializers.CharField(source='warehouse_to.code', read_only=True)
    journal_number = serializers.CharField(source='journal.number', read_only=True)

    class Meta:
        model = StockMove
        fields = [
            'id', 'number', 'move_type', 'item', 'item_code', 'item_name',
            'warehouse_from', 'warehouse_from_code', 'warehouse_to', 'warehouse_to_code',
            'quantity', 'unit_cost', 'total_cost_base', 'date', 'department', 'reason',
            'source_type', 'source_id', 'journal', 'journal_number', 'status',
            'created_by', 'created_at',
        ]


class ReceiveStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.filter(is_active=True))
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(is_active=True))
    quantity = serializers.DecimalField(max_digits=18, decimal_places=2)
    unit_cost_base = serializers.DecimalField(max_digits=18, decimal_places=4)
    date = serializers.DateField()


class IssueStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.filter(is_active=True))
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(is_active=True))
    quantity = serializers.DecimalField(max_digits=18, decimal_places=2)
    date = serializers.DateField()
    department = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')


class TransferStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.filter(is_active=True))
    warehouse_from = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(is_active=True))
    warehouse_to = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(is_active=True))
    quantity = serializers.DecimalField(max_digits=18, decimal_places=2)
    date = serializers.DateField()
