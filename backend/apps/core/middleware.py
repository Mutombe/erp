"""Thread-local capture of the current request's user and metadata for audit
logging, plus per-request tenancy resolution (request.school / school_ids)."""
import threading

_locals = threading.local()


def get_current_user():
    return getattr(_locals, 'user', None)


def get_current_request_meta():
    return getattr(_locals, 'meta', None)


class RequestAuditMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _locals.user = getattr(request, 'user', None)
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
        _locals.meta = {
            'ip_address': ip,
            'user_agent': request.META.get('HTTP_USER_AGENT', ''),
        }
        self._resolve_tenancy(request)
        try:
            return self.get_response(request)
        finally:
            _locals.user = None
            _locals.meta = None

    @staticmethod
    def _resolve_tenancy(request):
        """Populate request.school (the active school for the session, if any)
        and request.school_ids (the set of school ids the user may see).

        The active school id is set at login in a later wave; for now we read
        the session key if present, otherwise leave it None."""
        from .models import School

        user = getattr(request, 'user', None)
        school_ids = set()
        if user is not None and getattr(user, 'is_authenticated', False):
            school_ids = set(user.accessible_schools.values_list('id', flat=True))
        request.school_ids = school_ids

        active_id = None
        try:
            active_id = request.session.get('active_school_id')
        except Exception:
            active_id = None

        request.school = None
        if active_id:
            request.school = School.objects.filter(id=active_id, is_active=True).first()
