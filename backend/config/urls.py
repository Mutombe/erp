from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(request):
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', health),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/core/', include('apps.core.urls')),
    path('api/accounting/', include('apps.accounting.urls')),
    path('api/assets/', include('apps.assets.urls')),
    path('api/students/', include('apps.students.urls')),
    path('api/fees/', include('apps.fees.urls')),
    path('api/inventory/', include('apps.inventory.urls')),
    path('api/procurement/', include('apps.procurement.urls')),
    path('api/reports/', include('apps.reports.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
