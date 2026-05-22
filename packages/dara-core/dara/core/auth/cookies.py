"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import Request
from starlette.responses import Response

from dara.core.auth.definitions import AUTH_COOKIE_KWARGS, SESSION_TOKEN_COOKIE_NAME
from dara.core.auth.utils import get_cookie_expiration_from_exp, get_cookie_expiration_from_token


@dataclass(frozen=True)
class TokenExpirationCookie:
    """Align the cookie expiry with the token exp claim when one exists."""


@dataclass(frozen=True)
class ExplicitExpirationCookie:
    """Align the cookie expiry with an explicit timestamp."""

    exp: datetime | int | float


@dataclass(frozen=True)
class MaxAgeCookie:
    """Set a cookie using a fixed max age."""

    max_age: int


AuthCookieExpiration = TokenExpirationCookie | ExplicitExpirationCookie | MaxAgeCookie


@dataclass(frozen=True)
class SetAuthCookie:
    """Auth cookie write staged during request processing."""

    key: str
    value: str
    expiration: AuthCookieExpiration
    cookie_kwargs: dict[str, Any]


@dataclass(frozen=True)
class DeleteAuthCookie:
    """Auth cookie deletion staged during request processing."""

    key: str


AuthCookieOperation = SetAuthCookie | DeleteAuthCookie

PENDING_AUTH_COOKIE_OPERATIONS = '_dara_pending_auth_cookie_operations'


def _get_pending_auth_cookie_operations(request: Request) -> list[AuthCookieOperation]:
    operations = getattr(request.state, PENDING_AUTH_COOKIE_OPERATIONS, None)
    if operations is None:
        operations = []
        setattr(request.state, PENDING_AUTH_COOKIE_OPERATIONS, operations)
    return operations


def stage_auth_cookie_set(
    request: Request,
    key: str,
    value: str,
    *,
    expiration: AuthCookieExpiration,
    cookie_kwargs: dict[str, Any] | None = None,
):
    """
    Stage an auth cookie update to be applied to the final response.

    FastAPI only merges cookies from dependency-injected Response objects into
    generated responses. Routes that return Response/StreamingResponse directly
    need cookie updates applied after the route handler has produced the final
    response object.
    """
    _get_pending_auth_cookie_operations(request).append(
        SetAuthCookie(
            key=key,
            value=value,
            expiration=expiration,
            cookie_kwargs=dict(AUTH_COOKIE_KWARGS) if cookie_kwargs is None else dict(cookie_kwargs),
        )
    )


def stage_auth_session_cookie(request: Request, token: str, exp: datetime | int | float | None = None):
    """
    Stage a session cookie update to be applied to the final response.

    :param request: current request
    :param token: opaque auth session handle
    :param exp: explicit session expiry, if already known
    """
    stage_auth_cookie_set(
        request,
        SESSION_TOKEN_COOKIE_NAME,
        token,
        expiration=TokenExpirationCookie() if exp is None else ExplicitExpirationCookie(exp),
    )


def stage_auth_cookie_delete(request: Request, key: str):
    """
    Stage an auth cookie deletion to be applied to the final response.
    """
    _get_pending_auth_cookie_operations(request).append(DeleteAuthCookie(key=key))


def _apply_auth_cookie_set(response: Response, cookie: SetAuthCookie):
    if isinstance(cookie.expiration, MaxAgeCookie):
        response.set_cookie(
            key=cookie.key, value=cookie.value, max_age=cookie.expiration.max_age, **cookie.cookie_kwargs
        )
        return

    if isinstance(cookie.expiration, ExplicitExpirationCookie):
        max_age, expires = get_cookie_expiration_from_exp(cookie.expiration.exp)
        response.set_cookie(
            key=cookie.key,
            value=cookie.value,
            max_age=max_age,
            expires=expires,
            **cookie.cookie_kwargs,
        )
        return

    expiration = get_cookie_expiration_from_token(cookie.value)
    if expiration is None:
        response.set_cookie(key=cookie.key, value=cookie.value, **cookie.cookie_kwargs)
        return

    max_age, expires = expiration
    response.set_cookie(key=cookie.key, value=cookie.value, max_age=max_age, expires=expires, **cookie.cookie_kwargs)


def apply_staged_auth_cookies(request: Request, response: Response):
    """
    Apply staged auth cookie updates to the final response, if present.
    """
    operations = getattr(request.state, PENDING_AUTH_COOKIE_OPERATIONS, ())

    for operation in operations:
        if isinstance(operation, SetAuthCookie):
            _apply_auth_cookie_set(response, operation)
            continue

        response.delete_cookie(operation.key)
