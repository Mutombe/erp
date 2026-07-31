"""Family portal API: guardian + student self-service, strictly self-scoped.

Read endpoints expose only the logged-in user's own students. The one write
path (declaring a payment) creates a PaymentIntent that a bursar must confirm
before any receipt posts, so the portal never touches the ledger directly.
"""
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.serializers import SchoolSummarySerializer
from apps.fees.models import PaymentIntent
from apps.fees.serializers import PaymentIntentSerializer

from . import services
from .permissions import IsPortalUser


def _require_student(user, student_id):
    if not services.can_view_student(user, student_id):
        raise PermissionDenied("You don't have access to this student.")
    from apps.students.models import Student

    return Student.objects.select_related('school').get(pk=student_id)


@api_view(['GET'])
@permission_classes([IsPortalUser])
def context_view(request):
    """Everything the portal shell needs on load: who the user is, their school
    (for branding) and the cards for each student they can see."""
    kind, profile = services.portal_profile(request.user)
    if kind is None:
        return Response(
            {'detail': 'No portal profile is linked to your account yet.'},
            status=status.HTTP_403_FORBIDDEN,
        )
    students = services.accessible_students(request.user).select_related('school')
    return Response({
        'kind': kind,
        'profile': {
            'id': profile.id,
            'name': profile.full_name,
            'code': getattr(profile, 'code', None),
            'email': getattr(profile, 'email', '') or request.user.email,
            'phone': getattr(profile, 'phone', ''),
        },
        'school': SchoolSummarySerializer(profile.school, context={'request': request}).data,
        'students': [services.student_card(s) for s in students],
    })


class StudentStatementView(APIView):
    permission_classes = [IsPortalUser]

    def get(self, request, student_id):
        student = _require_student(request.user, student_id)
        data = services.student_statement(student)
        data['student'] = services.student_card(student)
        return Response(data)


class StudentAttendanceView(APIView):
    permission_classes = [IsPortalUser]

    def get(self, request, student_id):
        student = _require_student(request.user, student_id)
        summary = services.attendance_summary(
            student,
            start=request.query_params.get('start') or None,
            end=request.query_params.get('end') or None,
        )
        summary['student'] = services.student_card(student)
        return Response(summary)


class PaymentIntentInput(serializers.Serializer):
    student = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal('0.01'))
    currency = serializers.CharField(max_length=3)
    payment_method = serializers.ChoiceField(choices=PaymentIntent.METHODS, default='bank_transfer')
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    note = serializers.CharField(required=False, allow_blank=True, default='')


class PaymentIntentPortalView(APIView):
    """GET own declared payments; POST to declare a new one for a linked child."""

    permission_classes = [IsPortalUser]

    def get(self, request):
        student_ids = list(services.accessible_students(request.user).values_list('id', flat=True))
        intents = PaymentIntent.objects.filter(student_id__in=student_ids).select_related(
            'student', 'guardian', 'receipt'
        )
        return Response(PaymentIntentSerializer(intents, many=True).data)

    def post(self, request):
        payload = PaymentIntentInput(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        student = _require_student(request.user, data['student'])

        kind, profile = services.portal_profile(request.user)
        guardian = profile if kind == 'guardian' else None
        intent = PaymentIntent.objects.create(
            school=student.school,
            student=student,
            guardian=guardian,
            date=timezone.localdate(),
            currency=data['currency'].upper(),
            amount=data['amount'],
            payment_method=data['payment_method'],
            reference=data['reference'],
            note=data['note'],
            submitted_by=request.user,
        )
        return Response(PaymentIntentSerializer(intent).data, status=status.HTTP_201_CREATED)
