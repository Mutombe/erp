from django.urls import path

from . import views

urlpatterns = [
    path('context/', views.context_view),
    path('payment-intents/', views.PaymentIntentPortalView.as_view()),
    path('students/<int:student_id>/statement/', views.StudentStatementView.as_view()),
    path('students/<int:student_id>/attendance/', views.StudentAttendanceView.as_view()),
]
