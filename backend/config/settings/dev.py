from .base import *  # noqa: F401,F403

DEBUG = True

ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'testserver']

# Console-friendly static storage in dev (no manifest requirement).
STORAGES['staticfiles'] = {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}  # noqa: F405

REST_FRAMEWORK = {**REST_FRAMEWORK}  # noqa: F405
