"""Thread-local capture of the current request's user and metadata for audit logging."""
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
        try:
            return self.get_response(request)
        finally:
            _locals.user = None
            _locals.meta = None
