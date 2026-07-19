from django.db import transaction
from rest_framework import serializers

from apps.accounting.models import BankAccount
from apps.core.models import DocumentSequence

from .models import (
    GoodsReceivedNote,
    GRNLine,
    PaymentAllocation,
    POLine,
    PurchaseOrder,
    Supplier,
    SupplierPayment,
    VendorBill,
    VendorBillLine,
)


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            'id', 'code', 'name', 'contact_person', 'phone', 'email', 'address',
            'tax_number', 'default_currency', 'payment_terms_days', 'is_active',
            'custom_fields', 'created_at',
        ]
        extra_kwargs = {'code': {'required': False}}

    def create(self, validated_data):
        if not validated_data.get('code'):
            validated_data['code'] = DocumentSequence.next_for('SUP')
        return super().create(validated_data)


class POLineSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='item.code', read_only=True)

    class Meta:
        model = POLine
        fields = [
            'id', 'item', 'item_code', 'description', 'expense_account',
            'quantity', 'unit_price', 'qty_received',
        ]
        read_only_fields = ['qty_received']

    def validate(self, attrs):
        if not attrs.get('item') and not attrs.get('expense_account'):
            raise serializers.ValidationError('A PO line needs an item or an expense account.')
        return attrs


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = POLineSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    total = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'number', 'supplier', 'supplier_name', 'date', 'expected_date',
            'currency', 'status', 'total', 'notes', 'lines', 'approved_by',
            'approved_at', 'created_by', 'created_at',
        ]
        read_only_fields = [
            'number', 'status', 'approved_by', 'approved_at', 'created_by', 'created_at',
        ]

    def get_total(self, obj):
        return obj.total

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError('A purchase order needs at least one line.')
        return lines

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        request = self.context.get('request')
        with transaction.atomic():
            po = PurchaseOrder.objects.create(
                number=DocumentSequence.next_for('PO'),
                created_by=request.user if request is not None else None,
                **validated_data,
            )
            POLine.objects.bulk_create(POLine(po=po, **line) for line in lines)
        return po

    def update(self, instance, validated_data):
        if instance.status != 'draft':
            raise serializers.ValidationError('Only draft purchase orders can be edited.')
        lines = validated_data.pop('lines', None)
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if lines is not None:
                instance.lines.all().delete()
                POLine.objects.bulk_create(POLine(po=instance, **line) for line in lines)
        return instance


class GRNLineSerializer(serializers.ModelSerializer):
    item_code = serializers.CharField(source='po_line.item.code', read_only=True)

    class Meta:
        model = GRNLine
        fields = ['id', 'po_line', 'item_code', 'quantity', 'unit_cost', 'unit_cost_base']
        read_only_fields = ['unit_cost_base']


class GRNSerializer(serializers.ModelSerializer):
    lines = GRNLineSerializer(many=True)
    po_number = serializers.CharField(source='po.number', read_only=True)
    warehouse_code = serializers.CharField(source='warehouse.code', read_only=True)
    journal_number = serializers.CharField(source='journal.number', read_only=True)

    class Meta:
        model = GoodsReceivedNote
        fields = [
            'id', 'number', 'po', 'po_number', 'warehouse', 'warehouse_code', 'date',
            'received_by', 'status', 'journal', 'journal_number', 'lines', 'created_at',
        ]
        read_only_fields = ['number', 'received_by', 'status', 'journal', 'created_at']

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError('A GRN needs at least one line.')
        return lines

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        request = self.context.get('request')
        with transaction.atomic():
            grn = GoodsReceivedNote.objects.create(
                number=DocumentSequence.next_for('GRN'),
                received_by=request.user if request is not None else None,
                **validated_data,
            )
            GRNLine.objects.bulk_create(GRNLine(grn=grn, **line) for line in lines)
        return grn

    def update(self, instance, validated_data):
        if instance.status != 'draft':
            raise serializers.ValidationError('Only draft GRNs can be edited.')
        lines = validated_data.pop('lines', None)
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if lines is not None:
                instance.lines.all().delete()
                GRNLine.objects.bulk_create(GRNLine(grn=instance, **line) for line in lines)
        return instance


class VendorBillLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = VendorBillLine
        fields = [
            'id', 'grn_line', 'expense_account', 'item', 'description',
            'quantity', 'unit_price',
        ]

    def validate(self, attrs):
        if not attrs.get('grn_line') and not attrs.get('expense_account'):
            raise serializers.ValidationError('A bill line needs a GRN line or an expense account.')
        return attrs


class VendorBillSerializer(serializers.ModelSerializer):
    lines = VendorBillLineSerializer(many=True)
    balance = serializers.ReadOnlyField()
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    po_number = serializers.CharField(source='po.number', read_only=True)
    journal_number = serializers.CharField(source='journal.number', read_only=True)

    class Meta:
        model = VendorBill
        fields = [
            'id', 'number', 'supplier', 'supplier_name', 'supplier_reference', 'po',
            'po_number', 'date', 'due_date', 'currency', 'exchange_rate', 'total',
            'amount_paid', 'balance', 'status', 'journal', 'journal_number',
            'ocr_payload', 'attachment', 'notes', 'lines', 'created_by', 'created_at',
        ]
        read_only_fields = [
            'number', 'exchange_rate', 'total', 'amount_paid', 'status', 'journal',
            'created_by', 'created_at',
        ]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError('A bill needs at least one line.')
        return lines

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        request = self.context.get('request')
        with transaction.atomic():
            bill = VendorBill.objects.create(
                number=DocumentSequence.next_for('BIL'),
                created_by=request.user if request is not None else None,
                **validated_data,
            )
            VendorBillLine.objects.bulk_create(VendorBillLine(bill=bill, **line) for line in lines)
        return bill

    def update(self, instance, validated_data):
        if instance.status != 'draft':
            raise serializers.ValidationError('Only draft bills can be edited.')
        lines = validated_data.pop('lines', None)
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if lines is not None:
                instance.lines.all().delete()
                VendorBillLine.objects.bulk_create(
                    VendorBillLine(bill=instance, **line) for line in lines
                )
        return instance


class PaymentAllocationSerializer(serializers.ModelSerializer):
    bill_number = serializers.CharField(source='bill.number', read_only=True)

    class Meta:
        model = PaymentAllocation
        fields = ['id', 'bill', 'bill_number', 'amount', 'fx_difference_base']


class SupplierPaymentSerializer(serializers.ModelSerializer):
    allocations = PaymentAllocationSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    journal_number = serializers.CharField(source='journal.number', read_only=True)

    class Meta:
        model = SupplierPayment
        fields = [
            'id', 'number', 'supplier', 'supplier_name', 'bank_account', 'date',
            'currency', 'exchange_rate', 'amount', 'reference', 'status', 'journal',
            'journal_number', 'notes', 'allocations', 'created_by', 'created_at',
        ]
        read_only_fields = [
            'number', 'currency', 'exchange_rate', 'status', 'journal',
            'created_by', 'created_at',
        ]


class PaymentAllocationInput(serializers.Serializer):
    bill = serializers.PrimaryKeyRelatedField(queryset=VendorBill.objects.all())
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)


class SupplierPaymentCreateSerializer(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.all())
    bank_account = serializers.PrimaryKeyRelatedField(queryset=BankAccount.objects.filter(is_active=True))
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    date = serializers.DateField()
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    allocations = PaymentAllocationInput(many=True, required=False)
