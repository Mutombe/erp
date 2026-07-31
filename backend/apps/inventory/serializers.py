from rest_framework import serializers

from .models import (
    Department,
    Item,
    ItemCategory,
    StockLevel,
    StockLot,
    StockMove,
    StockRequisition,
    StockRequisitionLine,
    Warehouse,
)


class ItemCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ItemCategory
        fields = ['id', 'name', 'inventory_account', 'consumption_expense_account', 'is_active']


class DepartmentSerializer(serializers.ModelSerializer):
    expense_account_code = serializers.CharField(source='expense_account.code', read_only=True)
    expense_account_name = serializers.CharField(source='expense_account.name', read_only=True)
    stock_move_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            'id', 'code', 'name', 'description', 'expense_account',
            'expense_account_code', 'expense_account_name', 'head_name',
            'is_active', 'stock_move_count', 'created_at',
        ]
        read_only_fields = ['created_at']

    def get_stock_move_count(self, obj):
        # Annotated by the viewset; fall back to a query for ad-hoc use.
        count = getattr(obj, 'stock_move_count_annotated', None)
        return count if count is not None else obj.stock_moves.count()


class ItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    is_low_stock = serializers.ReadOnlyField()
    suggested_order_qty = serializers.ReadOnlyField()

    class Meta:
        model = Item
        fields = [
            'id', 'school', 'code', 'name', 'category', 'category_name', 'uom', 'item_type',
            'avg_cost', 'qty_on_hand', 'reorder_level', 'reorder_qty', 'track_lots',
            'barcode', 'is_low_stock', 'suggested_order_qty', 'is_active', 'created_at',
        ]
        read_only_fields = ['school', 'avg_cost', 'qty_on_hand', 'created_at']


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ['id', 'school', 'code', 'name', 'location', 'storekeeper', 'is_active']
        read_only_fields = ['school']


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
    department_name = serializers.CharField(source='department.name', read_only=True)
    department_code = serializers.CharField(source='department.code', read_only=True)

    class Meta:
        model = StockMove
        fields = [
            'id', 'number', 'move_type', 'item', 'item_code', 'item_name',
            'warehouse_from', 'warehouse_from_code', 'warehouse_to', 'warehouse_to_code',
            'quantity', 'unit_cost', 'total_cost_base', 'date',
            'department', 'department_name', 'department_code', 'reason',
            'source_type', 'source_id', 'journal', 'journal_number', 'status',
            'created_by', 'created_at',
        ]


class StockLotSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)

    class Meta:
        model = StockLot
        fields = [
            'id', 'item', 'item_code', 'item_name', 'warehouse', 'warehouse_code',
            'lot_code', 'expiry_date', 'quantity', 'received_date', 'created_at',
        ]
        read_only_fields = fields


class RequisitionLineSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='item.code', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)

    class Meta:
        model = StockRequisitionLine
        fields = ['id', 'item', 'item_code', 'item_name', 'qty_requested', 'qty_approved', 'qty_issued']
        read_only_fields = ['qty_approved', 'qty_issued']


class RequisitionSerializer(serializers.ModelSerializer):
    lines = RequisitionLineSerializer(many=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    requested_by_email = serializers.CharField(source='requested_by.email', read_only=True)

    class Meta:
        model = StockRequisition
        fields = [
            'id', 'number', 'warehouse', 'warehouse_code', 'department', 'department_name',
            'date', 'status', 'note', 'review_note', 'requested_by', 'requested_by_email',
            'reviewed_by', 'reviewed_at', 'lines', 'created_at',
        ]
        read_only_fields = [
            'number', 'status', 'review_note', 'requested_by', 'reviewed_by',
            'reviewed_at', 'created_at',
        ]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError('A requisition needs at least one line.')
        return lines

    def create(self, validated_data):
        from apps.core.models import DocumentSequence

        lines = validated_data.pop('lines')
        request = self.context.get('request')
        school = validated_data['warehouse'].school
        validated_data['school'] = school
        validated_data['number'] = DocumentSequence.next_for('REQ', school)
        if request is not None:
            validated_data['requested_by'] = request.user
        requisition = StockRequisition.objects.create(**validated_data)
        for line in lines:
            StockRequisitionLine.objects.create(requisition=requisition, **line)
        return requisition

    def update(self, instance, validated_data):
        if instance.status != 'draft':
            raise serializers.ValidationError('Only draft requisitions can be edited.')
        lines = validated_data.pop('lines', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if lines is not None:
            instance.lines.all().delete()
            for line in lines:
                StockRequisitionLine.objects.create(requisition=instance, **line)
        return instance


class ReceiveStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.filter(is_active=True))
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(is_active=True))
    quantity = serializers.DecimalField(max_digits=18, decimal_places=2)
    unit_cost_base = serializers.DecimalField(max_digits=18, decimal_places=4)
    date = serializers.DateField()
    lot_code = serializers.CharField(max_length=60, required=False, allow_blank=True, default='')
    expiry_date = serializers.DateField(required=False, allow_null=True, default=None)


class IssueStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.filter(is_active=True))
    warehouse = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(is_active=True))
    quantity = serializers.DecimalField(max_digits=18, decimal_places=2)
    date = serializers.DateField()
    department = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.filter(is_active=True), required=False, allow_null=True, default=None
    )
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')


class TransferStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=Item.objects.filter(is_active=True))
    warehouse_from = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(is_active=True))
    warehouse_to = serializers.PrimaryKeyRelatedField(queryset=Warehouse.objects.filter(is_active=True))
    quantity = serializers.DecimalField(max_digits=18, decimal_places=2)
    date = serializers.DateField()
