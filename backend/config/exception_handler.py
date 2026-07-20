import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import ProtectedError, RestrictedError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """Normalize Django-level errors into DRF-style responses."""
    if isinstance(exc, DjangoValidationError):
        detail = exc.message_dict if hasattr(exc, 'message_dict') else {'detail': exc.messages}
        exc = ValidationError(detail)

    response = exception_handler(exc, context)

    # on_delete=PROTECT guards master data that ledger rows reference. Answer
    # with what is actually blocking the delete rather than a bare conflict.
    # (Handled explicitly: ProtectedError subclasses IntegrityError, so relying
    # on the branch below would be incidental — and far less useful.)
    if response is None and isinstance(exc, (ProtectedError, RestrictedError)):
        blockers = getattr(exc, 'protected_objects', None) or getattr(exc, 'restricted_objects', None) or []
        blockers = list(blockers)[:5]
        labels = [f'{obj._meta.verbose_name}: {obj}' for obj in blockers]
        logger.warning('Blocked delete in %s: %s', context.get('view'), labels)
        return Response(
            {
                'detail': (
                    'This record is in use and cannot be deleted. '
                    'Deactivate it instead to keep historical records intact.'
                ),
                'blocked_by': labels,
            },
            status=status.HTTP_409_CONFLICT,
        )

    if response is None and isinstance(exc, IntegrityError):
        logger.warning('IntegrityError in %s: %s', context.get('view'), exc)
        return Response(
            {'detail': 'This operation conflicts with existing data.'},
            status=status.HTTP_409_CONFLICT,
        )

    return response
