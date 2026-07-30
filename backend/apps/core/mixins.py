"""Row-level multi-tenant scoping for DRF viewsets.

Models carry a `school` FK; `TenantScopedViewSet` filters querysets to the
schools the current user may see and stamps new rows with the active school.
"""


def active_school(request):
    """Return the School to stamp on new records for this request.

    Priority: an explicitly-activated school (session `active_school_id`,
    exposed as request.school) → the user's home school → the default school.
    """
    from .models import School

    school = getattr(request, 'school', None)
    if school is not None:
        return school
    user = getattr(request, 'user', None)
    home = getattr(user, 'home_school', None)
    if home is not None:
        return home
    return School.get_default()


class TenantScopedViewSet:
    """Mixin for ModelViewSet/ReadOnlyModelViewSet.

    - get_queryset(): if the model has a `school` field, restrict to the
      schools the user may see. When an active school is set, narrow to it.
      HQ users with no active school see everything they can access.
    - perform_create(): stamp `school` = active_school(request).
    """

    def _model_has_school(self):
        model = self.queryset.model if getattr(self, 'queryset', None) is not None else self.get_serializer_class().Meta.model
        return any(f.name == 'school' for f in model._meta.get_fields())

    def get_queryset(self):
        qs = super().get_queryset()
        if not self._model_has_school():
            return qs
        request = self.request
        # A session-activated school always wins: strict isolation to that tenant.
        active = getattr(request, 'school', None)
        if active is not None:
            return qs.filter(school=active)
        # Otherwise scope to the schools the (DRF-authenticated) user may see.
        # HQ/superusers — and, during the single-tenant transition, users with no
        # school assignment yet — see everything they can access.
        user = getattr(request, 'user', None)
        if user is None or not getattr(user, 'is_authenticated', False):
            return qs
        if getattr(user, 'is_hq', False) or getattr(user, 'is_superuser', False):
            return qs
        school_ids = set(user.accessible_schools.values_list('id', flat=True))
        if not school_ids:
            return qs
        return qs.filter(school_id__in=school_ids)

    def perform_create(self, serializer):
        if self._model_has_school() and 'school' not in serializer.validated_data:
            serializer.save(school=active_school(self.request))
        else:
            serializer.save()
