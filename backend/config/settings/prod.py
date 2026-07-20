from decouple import config

from .base import *  # noqa: F401,F403

DEBUG = False

SECRET_KEY = config('SECRET_KEY')  # required in prod

# Render (and most PaaS) terminate TLS at the edge and forward the real scheme.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# The SPA is served by Django itself, so requests are same-origin and no CORS
# grant is needed. CSRF still needs the deployed origin(s) declared — kept
# independent of CORS so a wildcard host pattern can be used safely.
CORS_ALLOWED_ORIGINS = []
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='https://*.onrender.com',
    cast=lambda v: [s.strip() for s in v.split(',') if s.strip()],
)
