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

from datetime import datetime
from inspect import isawaitable
from typing import Annotated, Any
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from dara.core.auth.base import BaseAuthConfig
from dara.core.auth.definitions import (
    BAD_REQUEST_ERROR,
    EXPIRED_TOKEN_ERROR,
    INVALID_TOKEN_ERROR,
    SESSION_ID,
    SESSION_TOKEN_COOKIE_NAME,
    USER,
    AuthError,
    SessionRequestBody,
    TokenData,
)
from dara.core.auth.request_logging import log_auth_exception, log_auth_request_rejection
from dara.core.auth.session import (
    create_auth_session,
    get_auth_session_cookie_expiration,
    get_stored_auth_session,
    refresh_auth_session,
    remove_auth_session,
    resolve_raw_auth_token,
    verify_auth_token,
    verify_raw_auth_token,
)
from dara.core.auth.utils import (
    set_cookie_from_expiration,
    set_cookie_from_token_expiration,
)

auth_router = APIRouter()


def _cache_session_auth_token(token_data: TokenData):
    """
    Store latest token data for websocket auth context refreshes.

    :param token_data: latest session token data
    """
    from dara.core.internal.registries import session_auth_token_registry, websocket_registry

    # Keep this registry websocket-only to avoid unbounded growth.
    if not websocket_registry.has(token_data.session_id) and not session_auth_token_registry.has(token_data.session_id):
        return

    session_auth_token_registry.set(token_data.session_id, token_data)


def _maybe_set_oidc_state_cookie(
    response: Response,
    auth_config: BaseAuthConfig,
    redirect_uri: str,
    existing_login_session_id: str | None = None,
):
    from dara.core.auth.oidc.config import OIDCAuthConfig
    from dara.core.auth.oidc.definitions import OIDC_LOGIN_SESSION_COOKIE_NAME
    from dara.core.auth.oidc.settings import get_oidc_settings
    from dara.core.auth.oidc.transaction_store import oidc_transaction_store

    if not isinstance(auth_config, OIDCAuthConfig):
        return

    state = parse_qs(urlparse(redirect_uri).query).get('state', [None])[0]
    if state is None:
        return

    login_session_id = existing_login_session_id or str(uuid4())

    if oidc_transaction_store.bind_login_session(state, login_session_id) is None:
        return

    response.set_cookie(
        key=OIDC_LOGIN_SESSION_COOKIE_NAME,
        value=login_session_id,
        httponly=True,
        max_age=get_oidc_settings().transaction_ttl_seconds,
        path='/',
        samesite='lax',
        secure=True,
    )


async def _clear_cached_session_auth_token(token: str):
    """
    Remove cached session data for the session associated with the provided token.

    :param token: session token
    """
    from dara.core.internal.registries import session_auth_token_registry

    stored_session = await remove_auth_session(token)
    if stored_session is not None and session_auth_token_registry.has(stored_session.token_data.session_id):
        session_auth_token_registry.remove(stored_session.token_data.session_id)


def _get_bearer_token(request: Request, *, error_message: str) -> str | None:
    """
    Extract bearer token from authorization header.

    :param request: incoming request
    :param error_message: error message used for invalid auth scheme
    """
    authorization = request.headers.get('Authorization')
    if authorization is None:
        return None

    parts = authorization.split(' ', maxsplit=1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR(error_message))

    scheme, token = parts
    if scheme != 'Bearer':
        raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR(error_message))

    return token


def _session_cookie_log_extra(session_cookie_token: str | None) -> dict[str, bool]:
    return {'has_session_cookie': session_cookie_token is not None}


def _get_auth_token(
    request: Request,
    session_cookie_token: str | None,
    *,
    missing_message: str,
    invalid_scheme_message: str,
) -> str:
    """
    Resolve an auth token from bearer header first, then session cookie.

    :param request: incoming request
    :param session_cookie_token: token stored in session cookie
    :param missing_message: error message when no token can be resolved
    :param invalid_scheme_message: error message for invalid auth header scheme
    """
    bearer_token = _get_bearer_token(request, error_message=invalid_scheme_message)

    if bearer_token is not None:
        return bearer_token

    if session_cookie_token is not None:
        return session_cookie_token

    raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR)


def _set_session_token_cookie(response: Response, token: str, exp: datetime | int | float | None = None):
    """
    Set the session token cookie.

    :param response: FastAPI response object
    :param token: session token value
    """
    if exp is None:
        set_cookie_from_token_expiration(response, SESSION_TOKEN_COOKIE_NAME, token)
        return

    set_cookie_from_expiration(response, SESSION_TOKEN_COOKIE_NAME, token, exp)


def _clear_auth_cookies(response: Response):
    """
    Clear auth cookies.

    :param response: FastAPI response object
    """
    response.delete_cookie(SESSION_TOKEN_COOKIE_NAME)


def _build_auth_error_response(status_code: int, detail: Any):
    """
    Build an auth error response and clear all auth cookies.

    :param status_code: HTTP status code
    :param detail: error detail payload
    """
    error_response = JSONResponse(status_code=status_code, content={'detail': detail})
    _clear_auth_cookies(error_response)
    return error_response


def _should_clear_auth_cookies_on_verify_failure(status_code: int, detail: Any) -> bool:
    """
    Determine whether /verify-session should clear auth cookies for a terminal auth failure.
    """
    return status_code in (401, 403) or detail in (INVALID_TOKEN_ERROR, EXPIRED_TOKEN_ERROR)


def _should_attempt_session_refresh(
    auth_error: AuthError,
) -> bool:
    """
    Determine whether verify-session should attempt a server-side refresh.
    """
    return auth_error.code == 401 and auth_error.detail in (INVALID_TOKEN_ERROR, EXPIRED_TOKEN_ERROR)


async def _refresh_session(
    auth_config: BaseAuthConfig,
    token: str,
    response: Response,
) -> str:
    """
    Refresh a session and update auth cookies.

    :return: new session token
    """
    try:
        new_session_token, new_token_data, new_refresh_token = await refresh_auth_session(
            auth_config,
            token,
        )
    except (HTTPException, AuthError, jwt.ExpiredSignatureError):
        await _clear_cached_session_auth_token(token)
        raise

    _cache_session_auth_token(new_token_data)

    _set_session_token_cookie(
        response,
        new_session_token,
        exp=get_auth_session_cookie_expiration(new_token_data, new_refresh_token),
    )
    return new_session_token


@auth_router.post('/verify-session')
async def handle_verify_session(
    req: Request,
    response: Response,
    dara_session_token: Annotated[str | None, Cookie(alias=SESSION_TOKEN_COOKIE_NAME)] = None,
):
    """
    Verify the current session for client-side auth checks.

    Unlike the dependency version, this endpoint can clear stale auth cookies on terminal failures.
    """
    try:
        return await verify_session(req, response, dara_session_token)
    except HTTPException as err:
        if _should_clear_auth_cookies_on_verify_failure(err.status_code, err.detail):
            return _build_auth_error_response(err.status_code, err.detail)

        return JSONResponse(status_code=err.status_code, content={'detail': err.detail})


async def verify_session(
    req: Request,
    response: Response,
    dara_session_token: Annotated[str | None, Cookie(alias=SESSION_TOKEN_COOKIE_NAME)] = None,
):
    """
    Helper to verify whether the user has a valid session JWT in the request they made. The function should be applied
    as a dependency to any fast api routes that require session management

    :param dara_session_token: optional session token cookie
    """
    # Try decoding the token and return a Session instance if successful
    try:
        token = _get_auth_token(
            req,
            dara_session_token,
            missing_message='No auth credentials passed',
            invalid_scheme_message='Invalid authentication scheme, please use Bearer tokens',
        )

        from dara.core.internal.registries import auth_registry

        auth_config: BaseAuthConfig = auth_registry.get('auth_config')

        if (
            dara_session_token is not None
            and token == dara_session_token
            and await get_stored_auth_session(token) is None
        ):
            raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR)

        try:
            await verify_auth_token(auth_config, token)
        except AuthError as auth_error:
            if not _should_attempt_session_refresh(auth_error):
                raise

            stored_session = await get_stored_auth_session(token)
            if stored_session is None or stored_session.refresh_token is None:
                raise

            try:
                refreshed_token = await _refresh_session(auth_config, token, response)
            except Exception as refresh_error:
                if isinstance(refresh_error, HTTPException | AuthError):
                    raise

                if isinstance(refresh_error, jwt.ExpiredSignatureError):
                    raise AuthError(code=401, detail=EXPIRED_TOKEN_ERROR) from refresh_error

                log_auth_exception(
                    'Auth session refresh failed unexpectedly',
                    req,
                    error=refresh_error,
                    status_code=401,
                    detail=INVALID_TOKEN_ERROR,
                    extra=_session_cookie_log_extra(dara_session_token),
                )
                raise AuthError(code=401, detail=INVALID_TOKEN_ERROR) from refresh_error

            await verify_auth_token(auth_config, refreshed_token)

        # Attach session_id to the request so it can be accessed in the middleware
        # Because contextvars don't work in middlewares
        req.state.session_id = SESSION_ID.get()
        return SESSION_ID.get()
    except HTTPException as err:
        log_auth_request_rejection(
            'Auth session verification rejected',
            req,
            status_code=err.status_code,
            detail=err.detail,
            extra=_session_cookie_log_extra(dara_session_token),
        )
        raise
    except jwt.ExpiredSignatureError as e:
        log_auth_exception(
            'Expired Token Signature',
            req,
            error=e,
            status_code=401,
            detail=EXPIRED_TOKEN_ERROR,
            extra=_session_cookie_log_extra(dara_session_token),
        )
        raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR) from e
    except jwt.PyJWTError as e:
        log_auth_exception(
            'Invalid Token',
            req,
            error=e,
            status_code=401,
            detail=INVALID_TOKEN_ERROR,
            extra=_session_cookie_log_extra(dara_session_token),
        )
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR) from e
    except AuthError as err:
        log_auth_exception(
            'Auth session verification failed',
            req,
            error=err,
            status_code=err.code,
            detail=err.detail,
            extra=_session_cookie_log_extra(dara_session_token),
        )
        raise HTTPException(status_code=err.code, detail=err.detail) from err


@auth_router.post('/revoke-session')
async def _revoke_session(
    request: Request,
    response: Response,
    dara_session_token: Annotated[str | None, Cookie(alias=SESSION_TOKEN_COOKIE_NAME)] = None,
):
    """
    Helper to revoke a session and its' associated token
    """
    token: str | None = None

    try:
        token = _get_auth_token(
            request,
            dara_session_token,
            missing_message='No auth credentials passed',
            invalid_scheme_message='Invalid authentication scheme, please use Bearer tokens',
        )

        from dara.core.internal.registries import auth_registry

        auth_config: BaseAuthConfig = auth_registry.get('auth_config')
        raw_token = await resolve_raw_auth_token(auth_config, token)

        result = auth_config.revoke_token(raw_token, response)
        if isawaitable(result):
            result = await result

        return result
    except HTTPException as err:
        log_auth_request_rejection(
            'Auth session revoke rejected',
            request,
            status_code=err.status_code,
            detail=err.detail,
            extra=_session_cookie_log_extra(dara_session_token),
        )
        return _build_auth_error_response(err.status_code, err.detail)
    except AuthError as err:
        log_auth_exception(
            'Auth session revoke failed',
            request,
            error=err,
            status_code=err.code,
            detail=err.detail,
            extra=_session_cookie_log_extra(dara_session_token),
        )
        return _build_auth_error_response(err.code, err.detail)
    finally:
        if token is not None:
            await _clear_cached_session_auth_token(token)

        _clear_auth_cookies(response)


# Request to retrieve a session token from the backend. The app does this on startup.
@auth_router.post('/session')
async def _get_session(body: SessionRequestBody, request: Request, response: Response):
    try:
        from dara.core.auth.oidc.definitions import OIDC_LOGIN_SESSION_COOKIE_NAME
        from dara.core.internal.registries import auth_registry

        auth_config: BaseAuthConfig = auth_registry.get('auth_config')
        existing_login_session_id = request.cookies.get(OIDC_LOGIN_SESSION_COOKIE_NAME)

        session_response = auth_config.get_token(body)
        if 'token' in session_response:
            token_data = await verify_raw_auth_token(auth_config, session_response['token'])
            session_token = await create_auth_session(session_response['token'], token_data)
            _set_session_token_cookie(
                response,
                session_token,
                exp=get_auth_session_cookie_expiration(token_data, refresh_token=None),
            )
            return {'success': True}
        _maybe_set_oidc_state_cookie(
            response,
            auth_config,
            session_response['redirect_uri'],
            existing_login_session_id=existing_login_session_id,
        )
        return session_response
    except HTTPException as err:
        log_auth_request_rejection(
            'Auth session creation rejected',
            request,
            status_code=err.status_code,
            detail=err.detail,
            extra=_session_cookie_log_extra(None),
        )
        raise
    except AuthError as err:
        log_auth_exception(
            'Auth session creation failed',
            request,
            error=err,
            status_code=err.code,
            detail=err.detail,
            extra=_session_cookie_log_extra(None),
        )
        raise HTTPException(status_code=err.code, detail=err.detail) from err
    except Exception as err:
        log_auth_exception(
            'Auth session creation failed unexpectedly',
            request,
            error=err,
            status_code=500,
            detail=BAD_REQUEST_ERROR('Authentication failed'),
            extra=_session_cookie_log_extra(None),
        )
        raise


@auth_router.get('/user', dependencies=[Depends(verify_session)])
def _get_user():
    return USER.get()
