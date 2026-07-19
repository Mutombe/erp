from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('categories', views.ItemCategoryViewSet)
router.register('items', views.ItemViewSet)
router.register('warehouses', views.WarehouseViewSet)
router.register('stock-levels', views.StockLevelViewSet)
router.register('stock-moves', views.StockMoveViewSet)
router.register('stock-ops', views.StockOpsViewSet, basename='stock-ops')

urlpatterns = router.urls
