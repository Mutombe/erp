from django.urls import path

from . import views
from .pdf import InvoicePdfView, ReceiptPdfView, ReportPdfView, StudentStatementPdfView

urlpatterns = [
    path('pdf/<str:report_key>/', ReportPdfView.as_view()),
    path('invoice-pdf/<int:pk>/', InvoicePdfView.as_view()),
    path('receipt-pdf/<int:pk>/', ReceiptPdfView.as_view()),
    path('student-statement/<int:student_id>/pdf/', StudentStatementPdfView.as_view()),
    path('trial-balance/', views.TrialBalanceView.as_view()),
    path('balance-sheet/', views.BalanceSheetView.as_view()),
    path('income-statement/', views.IncomeStatementView.as_view()),
    path('cash-flow/', views.CashFlowView.as_view()),
    path('aged-receivables/', views.AgedReceivablesView.as_view()),
    path('aged-payables/', views.AgedPayablesView.as_view()),
    path('student-statement/<int:student_id>/', views.StudentStatementView.as_view()),
    path('cashbook/', views.CashbookView.as_view()),
    path('asset-register/', views.AssetRegisterView.as_view()),
    path('stock-valuation/', views.StockValuationView.as_view()),
    path('department-consumption/', views.DepartmentConsumptionView.as_view()),
    path('fee-collection/', views.FeeCollectionView.as_view()),
    path('dashboard/', views.DashboardView.as_view()),
]
