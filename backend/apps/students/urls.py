from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('academic-years', views.AcademicYearViewSet)
router.register('terms', views.TermViewSet)
router.register('grades', views.GradeViewSet)
router.register('classes', views.ClassRoomViewSet)
router.register('students', views.StudentViewSet)
router.register('guardians', views.GuardianViewSet)
router.register('student-guardians', views.StudentGuardianViewSet)
router.register('enrollments', views.EnrollmentViewSet)

urlpatterns = router.urls
