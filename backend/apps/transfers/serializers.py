from rest_framework import serializers

from apps.accounting.models import BankAccount
from apps.students.models import ClassRoom, Student

from .models import InterSchoolTransfer


class InterSchoolTransferSerializer(serializers.ModelSerializer):
    from_school_name = serializers.CharField(source='from_school.name', read_only=True)
    to_school_name = serializers.CharField(source='to_school.name', read_only=True)
    from_student_code = serializers.CharField(source='from_student.code', read_only=True)
    to_student_code = serializers.CharField(source='to_student.code', read_only=True)
    from_student_name = serializers.CharField(source='from_student.full_name', read_only=True)
    from_journal_number = serializers.CharField(source='from_journal.number', read_only=True)
    to_journal_number = serializers.CharField(source='to_journal.number', read_only=True)

    class Meta:
        model = InterSchoolTransfer
        fields = [
            'id', 'number', 'kind', 'from_school', 'from_school_name', 'to_school', 'to_school_name',
            'date', 'currency', 'amount', 'status', 'note',
            'from_bank', 'to_bank', 'from_student', 'from_student_code', 'from_student_name',
            'to_student', 'to_student_code', 'from_journal', 'from_journal_number',
            'to_journal', 'to_journal_number', 'created_by', 'created_at',
        ]
        read_only_fields = fields


class FundTransferInput(serializers.Serializer):
    from_bank = serializers.PrimaryKeyRelatedField(queryset=BankAccount.objects.filter(is_active=True))
    to_bank = serializers.PrimaryKeyRelatedField(queryset=BankAccount.objects.filter(is_active=True))
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    date = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True, default='')


class StudentTransferInput(serializers.Serializer):
    from_student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all())
    to_class = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.all())
    date = serializers.DateField()
    note = serializers.CharField(required=False, allow_blank=True, default='')
