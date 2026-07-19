from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('categories', views.AssetCategoryViewSet)
router.register('assets', views.AssetViewSet)
router.register('depreciation-runs', views.DepreciationRunViewSet)

urlpatterns = router.urls
