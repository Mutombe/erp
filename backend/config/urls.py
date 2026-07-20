from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import HttpResponse, JsonResponse
from django.urls import include, path, re_path
from django.views.generic import TemplateView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(request):
    return JsonResponse({'status': 'ok'})


class SpaView(TemplateView):
    """Serve the built React app for every non-API route so client-side deep
    links (e.g. /app/students/3) survive a page refresh."""

    template_name = 'index.html'

    def get(self, request, *args, **kwargs):
        if not (settings.FRONTEND_DIST / 'index.html').exists():
            return HttpResponse(
                '<h1>Frontend not built</h1>'
                '<p>Run <code>npm run build</code> in <code>frontend/</code>, '
                'or use the Vite dev server for hot reload.</p>',
                status=503,
            )
        return super().get(request, *args, **kwargs)


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

# Catch-all LAST: anything not matched above is handed to the SPA.
urlpatterns += [re_path(r'^(?!api/|admin/|static/|media/|health/).*$', SpaView.as_view())]
