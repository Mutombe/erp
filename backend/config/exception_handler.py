import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
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

    if response is None and isinstance(exc, IntegrityError):
        logger.warning('IntegrityError in %s: %s', context.get('view'), exc)
        return Response(
            {'detail': 'This operation conflicts with existing data.'},
            status=status.HTTP_409_CONFLICT,
        )

    return response
