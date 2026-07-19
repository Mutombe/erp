from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('suppliers', views.SupplierViewSet)
router.register('purchase-orders', views.PurchaseOrderViewSet)
router.register('grns', views.GRNViewSet)
router.register('vendor-bills', views.VendorBillViewSet)
router.register('supplier-payments', views.SupplierPaymentViewSet)

urlpatterns = router.urls
