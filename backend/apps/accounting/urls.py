from rest_framework.routers import DefaultRouter

from . import views
from .reconciliation import BankReconciliationViewSet, BankStatementViewSet

router = DefaultRouter()
router.register('bank-statements', BankStatementViewSet)
router.register('bank-reconciliations', BankReconciliationViewSet)
router.register('accounts', views.ChartOfAccountViewSet)
router.register('journals', views.JournalViewSet)
router.register('general-ledger', views.GeneralLedgerViewSet)
router.register('sub-accounts', views.SubAccountViewSet)
router.register('bank-accounts', views.BankAccountViewSet)
router.register('exchange-rates', views.ExchangeRateViewSet)
router.register('fiscal-years', views.FiscalYearViewSet)
router.register('fiscal-periods', views.FiscalPeriodViewSet)
router.register('opening-balances', views.OpeningBalanceViewSet)
router.register('mappings', views.AccountMappingViewSet)

urlpatterns = router.urls
