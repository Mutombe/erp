from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('items', views.IngestionItemViewSet)

urlpatterns = router.urls
