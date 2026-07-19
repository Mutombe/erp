from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('categories', views.FeeCategoryViewSet)
router.register('structures', views.FeeStructureViewSet)
router.register('bursaries', views.BursaryAwardViewSet)
router.register('billing-runs', views.BillingRunViewSet)
router.register('invoices', views.FeeInvoiceViewSet)
router.register('credit-notes', views.CreditNoteViewSet)
router.register('receipts', views.ReceiptViewSet)

urlpatterns = router.urls
