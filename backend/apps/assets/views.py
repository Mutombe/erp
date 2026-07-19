from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import RoleWritePermission

from .models import Asset, AssetCategory, DepreciationRun
from .serializers import (
    AssetCategorySerializer,
    AssetDisposeSerializer,
    AssetSerializer,
    DepreciationRunInputSerializer,
    DepreciationRunSerializer,
)
from .services import reverse_depreciation_run, run_depreciation


class AssetsViewSet(viewsets.ModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'assets'


class AssetCategoryViewSet(AssetsViewSet):
    queryset = AssetCategory.objects.all()
    serializer_class = AssetCategorySerializer
    search_fields = ['code', 'name']
    pagination_class = None


class AssetViewSet(AssetsViewSet):
    queryset = Asset.objects.select_related('category', 'disposal_journal').all()
    serializer_class = AssetSerializer
    filterset_fields = ['status', 'category']
    search_fields = ['code', 'name', 'serial_number', 'location', 'custodian']
    ordering_fields = ['code', 'name', 'acquisition_date', 'cost_base']

    @action(detail=True, methods=['post'])
    def dispose(self, request, pk=None):
        asset = self.get_object()
        serializer = AssetDisposeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        asset.dispose(
            date=data['date'],
            proceeds=data['proceeds'],
            bank_account=data.get('bank_account'),
            user=request.user,
        )
        asset.refresh_from_db()
        return Response(self.get_serializer(asset).data)


class DepreciationRunViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [RoleWritePermission]
    write_area = 'assets'
    queryset = (
        DepreciationRun.objects.select_related('period__fiscal_year', 'journal', 'created_by')
        .prefetch_related('entries__asset')
        .all()
    )
    serializer_class = DepreciationRunSerializer
    filterset_fields = ['status', 'period']

    @action(detail=False, methods=['post'])
    def run(self, request):
        serializer = DepreciationRunInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        run = run_depreciation(serializer.validated_data['period'], user=request.user)
        return Response(DepreciationRunSerializer(run).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        run = self.get_object()
        run = reverse_depreciation_run(run, reason=request.data.get('reason', ''), user=request.user)
        return Response(DepreciationRunSerializer(run).data)
