# ---- Stage 1: build the React SPA -------------------------------------------
FROM node:20-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Vite emits to /build/dist with base=/static/ (Django serves it).
RUN npm run build

# ---- Stage 2: Python runtime serving API + SPA ------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
# settings.FRONTEND_DIST resolves to BASE_DIR.parent/frontend/dist, so the
# built SPA must sit alongside backend/ exactly as it does in the repo.
COPY --from=frontend /build/dist /app/frontend/dist

WORKDIR /app/backend

# Collect static (SPA assets + brand + admin) into STATIC_ROOT at build time.
RUN SECRET_KEY=build-only-not-a-runtime-secret \
    DATABASE_URL=sqlite:///build.sqlite3 \
    SECURE_SSL_REDIRECT=False \
    python manage.py collectstatic --noinput \
    && rm -f build.sqlite3

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 10000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
