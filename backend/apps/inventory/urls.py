from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('categories', views.ItemCategoryViewSet)
router.register('departments', views.DepartmentViewSet)
router.register('items', views.ItemViewSet)
router.register('warehouses', views.WarehouseViewSet)
router.register('stock-levels', views.StockLevelViewSet)
router.register('stock-lots', views.StockLotViewSet)
router.register('stock-moves', views.StockMoveViewSet)
router.register('requisitions', views.RequisitionViewSet)
router.register('stock-ops', views.StockOpsViewSet, basename='stock-ops')

urlpatterns = router.urls
