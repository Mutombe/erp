#!/bin/sh
# Release tasks then serve. Every step here is idempotent, so it is safe to run
# on each deploy and on container restarts.
set -e

echo "==> Applying migrations"
python manage.py migrate --noinput

echo "==> Seeding chart of accounts, calendar and sequences (idempotent)"
python manage.py seed_school

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "==> Ensuring admin user $ADMIN_EMAIL"
  python manage.py shell -c "
from django.contrib.auth import get_user_model
import os
User = get_user_model()
email = os.environ['ADMIN_EMAIL']
user, created = User.objects.get_or_create(
    email=email,
    defaults={'is_staff': True, 'is_superuser': True, 'role': 'admin',
              'first_name': 'System', 'last_name': 'Administrator'},
)
if created:
    user.set_password(os.environ['ADMIN_PASSWORD'])
    user.save()
    print('created admin', email)
else:
    print('admin already exists', email)
"
fi

# One-shot demo seeding, run in-datacenter (low latency to the DB). Set the
# SEED_DEMO env var to "reset" to rebuild demo data on the next deploy, then
# REMOVE the var so ordinary restarts don't wipe it. Runs in the background so
# the web service binds its port and passes health checks immediately.
if [ "$SEED_DEMO" = "reset" ]; then
  echo "==> SEED_DEMO=reset — rebuilding demo data in the background"
  ( python manage.py seed_demo --reset && echo "==> seed_demo finished" \
    || echo "==> seed_demo FAILED" ) &
fi

echo "==> Starting gunicorn on port ${PORT:-10000}"
exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT:-10000}" \
  --workers "${WEB_CONCURRENCY:-2}" \
  --threads 4 \
  --timeout 120 \
  --access-logfile - \
  --error-logfile -
