from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import services
from .models import InterSchoolTransfer
from .serializers import (
    FundTransferInput,
    InterSchoolTransferSerializer,
    StudentTransferInput,
)


class IsHQ(BasePermission):
    """Inter-school transfers cross the tenant boundary, so only Golden Knot HQ
    (or a superuser) may create or view them."""

    message = 'Inter-school transfers are managed by Golden Knot HQ.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or user.is_hq))


class InterSchoolTransferViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        InterSchoolTransfer.objects.select_related(
            'from_school', 'to_school', 'from_student', 'to_student', 'from_journal', 'to_journal'
        ).all()
    )
    serializer_class = InterSchoolTransferSerializer
    permission_classes = [IsHQ]
    filterset_fields = ['kind', 'status', 'from_school', 'to_school', 'currency']
    search_fields = ['number', 'note', 'from_student__code']
    ordering_fields = '__all__'

    @action(detail=False, methods=['post'])
    def funds(self, request):
        payload = FundTransferInput(data=request.data)
        payload.is_valid(raise_exception=True)
        d = payload.validated_data
        transfer = services.execute_fund_transfer(
            from_bank=d['from_bank'], to_bank=d['to_bank'], amount=d['amount'],
            date=d['date'], note=d['note'], user=request.user,
        )
        return Response(self.get_serializer(transfer).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def student(self, request):
        payload = StudentTransferInput(data=request.data)
        payload.is_valid(raise_exception=True)
        d = payload.validated_data
        transfer = services.execute_student_transfer(
            from_student=d['from_student'], to_class=d['to_class'],
            date=d['date'], note=d['note'], user=request.user,
        )
        return Response(self.get_serializer(transfer).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='student-preview')
    def student_preview(self, request):
        """Net balance a pupil would carry across, per currency — shown before
        confirming a student transfer."""
        student_id = request.query_params.get('student')
        from apps.students.models import Student

        student = Student.objects.filter(pk=student_id).first()
        if student is None:
            return Response({'detail': 'Student not found.'}, status=status.HTTP_404_NOT_FOUND)
        balances = services._student_balance_by_currency(student)
        return Response({
            'student': student.id,
            'student_name': student.full_name,
            'school': student.school_id,
            'balances': [{'currency': c, 'amount': b} for c, b in sorted(balances.items())],
        })
