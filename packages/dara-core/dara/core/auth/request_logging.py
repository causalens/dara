from typing import Any

from fastapi import Request

from dara.core.logging import dev_logger


def _detail_reason(detail: Any) -> str | None:
    if isinstance(detail, dict):
        reason = detail.get('reason')
        return str(reason) if reason is not None else None
    if isinstance(detail, str):
        return detail
    return None


def _detail_message(detail: Any) -> str | None:
    if isinstance(detail, dict):
        message = detail.get('message')
        return str(message) if message is not None else None
    if isinstance(detail, str):
        return detail
    return None


def auth_request_log_extra(
    request: Request,
    *,
    status_code: int,
    detail: Any,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build redacted auth request context for failure logs.

    The auth header value, session cookies, and token data are intentionally omitted.
    """
    authorization = request.headers.get('Authorization')
    auth_scheme = authorization.split(' ', maxsplit=1)[0] if authorization else None

    return {
        'method': request.method,
        'path': request.url.path,
        'status_code': status_code,
        'detail_reason': _detail_reason(detail),
        'detail_message': _detail_message(detail),
        'has_authorization_header': authorization is not None,
        'authorization_scheme': auth_scheme,
        **(extra or {}),
    }


def log_auth_request_rejection(
    title: str,
    request: Request,
    *,
    status_code: int,
    detail: Any,
    extra: dict[str, Any] | None = None,
):
    dev_logger.warning(
        title,
        extra=auth_request_log_extra(
            request,
            status_code=status_code,
            detail=detail,
            extra=extra,
        ),
    )


def log_auth_exception(
    title: str,
    request: Request,
    *,
    error: BaseException,
    status_code: int,
    detail: Any,
    extra: dict[str, Any] | None = None,
):
    dev_logger.error(
        title,
        error=error,
        extra=auth_request_log_extra(
            request,
            status_code=status_code,
            detail=detail,
            extra=extra,
        ),
    )
