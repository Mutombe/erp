from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('users', views.UserViewSet)
router.register('settings', views.SchoolSettingsViewSet, basename='school-settings')
router.register('sequences', views.DocumentSequenceViewSet)
router.register('audit-trail', views.AuditTrailViewSet)

urlpatterns = [
    path('auth/login/', views.login_view),
    path('auth/logout/', views.logout_view),
    path('auth/me/', views.me_view),
    path('', include(router.urls)),
]
