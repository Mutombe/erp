from django.db import transaction
from rest_framework import serializers

from apps.accounting.models import BankAccount
from apps.core.models import DocumentSequence
from apps.students.models import Guardian, Student

from .models import (
    BillingRun,
    BursaryAward,
    CreditNote,
    CreditNoteLine,
    FeeCategory,
    FeeInvoice,
    FeeInvoiceLine,
    FeeStructure,
    Receipt,
    ReceiptAllocation,
)


class FeeCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = FeeCategory
        fields = [
            'id', 'code', 'name', 'income_account', 'deferred_account',
            'pocket_order', 'is_active',
        ]


class FeeStructureSerializer(serializers.ModelSerializer):
    fee_category_code = serializers.CharField(source='fee_category.code', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)
    term_name = serializers.CharField(source='term.name', read_only=True)

    class Meta:
        model = FeeStructure
        fields = [
            'id', 'academic_year', 'term', 'term_name', 'grade', 'grade_name',
            'fee_category', 'fee_category_code', 'amount', 'currency', 'applies_to',
            'is_mandatory',
        ]


class BursaryAwardSerializer(serializers.ModelSerializer):
    student_code = serializers.CharField(source='student.code', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    fee_category_code = serializers.CharField(source='fee_category.code', read_only=True)

    class Meta:
        model = BursaryAward
        fields = [
            'id', 'student', 'student_code', 'student_name', 'fee_category',
            'fee_category_code', 'academic_year', 'term', 'award_type', 'value',
            'funder', 'notes', 'is_active',
        ]


class BillingRunSerializer(serializers.ModelSerializer):
    term_name = serializers.CharField(source='term.name', read_only=True)

    class Meta:
        model = BillingRun
        fields = [
            'id', 'number', 'term', 'term_name', 'currency', 'date', 'due_date',
            'grades', 'status', 'invoices_created', 'total_billed', 'error_message',
            'task_id', 'created_by', 'created_at',
        ]
        read_only_fields = [
            'number', 'status', 'invoices_created', 'total_billed', 'error_message',
            'task_id', 'created_by', 'created_at',
        ]

    def create(self, validated_data):
        validated_data['number'] = DocumentSequence.next_for('RUN')
        request = self.context.get('request')
        if request is not None:
            validated_data['created_by'] = request.user
        return super().create(validated_data)


class FeeInvoiceLineSerializer(serializers.ModelSerializer):
    fee_category_code = serializers.CharField(source='fee_category.code', read_only=True)

    class Meta:
        model = FeeInvoiceLine
        fields = [
            'id', 'fee_category', 'fee_category_code', 'description', 'amount',
            'bursary_award', 'discount_amount', 'allocated_amount',
        ]
        read_only_fields = ['allocated_amount']


class FeeInvoiceSerializer(serializers.ModelSerializer):
    lines = FeeInvoiceLineSerializer(many=True)
    balance = serializers.ReadOnlyField()
    student_code = serializers.CharField(source='student.code', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    journal_number = serializers.CharField(source='journal.number', read_only=True)

    class Meta:
        model = FeeInvoice
        fields = [
            'id', 'number', 'student', 'student_code', 'student_name', 'enrollment',
            'term', 'billing_run', 'date', 'due_date', 'currency', 'exchange_rate',
            'subtotal', 'discount_total', 'total', 'amount_paid', 'balance', 'status',
            'journal', 'journal_number', 'notes', 'custom_fields', 'lines',
            'created_by', 'created_at',
        ]
        read_only_fields = [
            'number', 'billing_run', 'exchange_rate', 'subtotal', 'discount_total',
            'total', 'amount_paid', 'status', 'journal', 'created_by', 'created_at',
        ]

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError('An invoice needs at least one line.')
        return lines

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        request = self.context.get('request')
        with transaction.atomic():
            invoice = FeeInvoice.objects.create(
                number=DocumentSequence.next_for('INV'),
                created_by=request.user if request is not None else None,
                **validated_data,
            )
            FeeInvoiceLine.objects.bulk_create(
                FeeInvoiceLine(invoice=invoice, **line) for line in lines
            )
            invoice.compute_totals()
            invoice.save(update_fields=['subtotal', 'discount_total', 'total'])
        return invoice

    def update(self, instance, validated_data):
        if instance.status != 'draft':
            raise serializers.ValidationError('Only draft invoices can be edited.')
        lines = validated_data.pop('lines', None)
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if lines is not None:
                instance.lines.all().delete()
                FeeInvoiceLine.objects.bulk_create(
                    FeeInvoiceLine(invoice=instance, **line) for line in lines
                )
            instance.compute_totals()
            instance.save(update_fields=['subtotal', 'discount_total', 'total'])
        return instance


class CreditNoteLineSerializer(serializers.ModelSerializer):
    fee_category_code = serializers.CharField(source='fee_category.code', read_only=True)

    class Meta:
        model = CreditNoteLine
        fields = ['id', 'fee_category', 'fee_category_code', 'amount']


class CreditNoteSerializer(serializers.ModelSerializer):
    lines = CreditNoteLineSerializer(many=True)
    student_code = serializers.CharField(source='student.code', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.number', read_only=True)
    journal_number = serializers.CharField(source='journal.number', read_only=True)

    class Meta:
        model = CreditNote
        fields = [
            'id', 'number', 'student', 'student_code', 'student_name', 'invoice',
            'invoice_number', 'date', 'currency', 'reason', 'total', 'status',
            'journal', 'journal_number', 'lines', 'created_by', 'created_at',
        ]
        read_only_fields = ['number', 'total', 'status', 'journal', 'created_by', 'created_at']

    def validate_lines(self, lines):
        if not lines:
            raise serializers.ValidationError('A credit note needs at least one line.')
        return lines

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        request = self.context.get('request')
        with transaction.atomic():
            credit_note = CreditNote.objects.create(
                number=DocumentSequence.next_for('CRN'),
                created_by=request.user if request is not None else None,
                **validated_data,
            )
            CreditNoteLine.objects.bulk_create(
                CreditNoteLine(credit_note=credit_note, **line) for line in lines
            )
        return credit_note

    def update(self, instance, validated_data):
        if instance.status != 'draft':
            raise serializers.ValidationError('Only draft credit notes can be edited.')
        lines = validated_data.pop('lines', None)
        with transaction.atomic():
            instance = super().update(instance, validated_data)
            if lines is not None:
                instance.lines.all().delete()
                CreditNoteLine.objects.bulk_create(
                    CreditNoteLine(credit_note=instance, **line) for line in lines
                )
        return instance


class ReceiptAllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.number', read_only=True)

    class Meta:
        model = ReceiptAllocation
        fields = ['id', 'invoice', 'invoice_number', 'amount', 'fx_difference_base']


class ReceiptSerializer(serializers.ModelSerializer):
    allocations = ReceiptAllocationSerializer(many=True, read_only=True)
    student_code = serializers.CharField(source='student.code', read_only=True)
    student_name = serializers.CharField(source='student.full_name', read_only=True)
    journal_number = serializers.CharField(source='journal.number', read_only=True)

    class Meta:
        model = Receipt
        fields = [
            'id', 'number', 'student', 'student_code', 'student_name', 'payer_guardian',
            'date', 'bank_account', 'currency', 'exchange_rate', 'amount',
            'payment_method', 'reference', 'status', 'journal', 'journal_number',
            'unallocated_amount', 'notes', 'allocations', 'created_by', 'created_at',
        ]
        read_only_fields = [
            'number', 'currency', 'exchange_rate', 'status', 'journal',
            'unallocated_amount', 'created_by', 'created_at',
        ]


class ReceiptAllocationInput(serializers.Serializer):
    invoice = serializers.PrimaryKeyRelatedField(queryset=FeeInvoice.objects.all())
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)


class ReceiptCreateSerializer(serializers.Serializer):
    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    bank_account = serializers.PrimaryKeyRelatedField(queryset=BankAccount.objects.filter(is_active=True))
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    date = serializers.DateField()
    payment_method = serializers.ChoiceField(choices=Receipt.METHODS, default='cash')
    payer_guardian = serializers.PrimaryKeyRelatedField(
        queryset=Guardian.objects.all(), required=False, allow_null=True
    )
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    allocations = ReceiptAllocationInput(many=True, required=False)
