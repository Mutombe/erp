from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('sessions', views.AttendanceSessionViewSet)
router.register('records', views.AttendanceRecordViewSet)

urlpatterns = router.urls
