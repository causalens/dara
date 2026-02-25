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

from inspect import isawaitable
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from dara.core.auth.base import BaseAuthConfig
from dara.core.auth.definitions import (
    AUTH_COOKIE_KWARGS,
    BAD_REQUEST_ERROR,
    EXPIRED_TOKEN_ERROR,
    INVALID_TOKEN_ERROR,
    REFRESH_TOKEN_COOKIE_NAME,
    SESSION_ID,
    SESSION_TOKEN_COOKIE_NAME,
    USER,
    AuthError,
    SessionRequestBody,
    TokenData,
)
from dara.core.auth.utils import cached_refresh_token, decode_token, get_cookie_expiration_from_token
from dara.core.logging import dev_logger

auth_router = APIRouter()


def _cache_session_auth_token(session_token: str):
    """
    Store latest session token for websocket auth context refreshes.

    :param session_token: latest session token
    """
    from dara.core.internal.registries import session_auth_token_registry, websocket_registry

    decoded_token = decode_token(session_token, options={'verify_exp': False})

    # Keep this registry websocket-only to avoid unbounded growth.
    if not websocket_registry.has(decoded_token.session_id) and not session_auth_token_registry.has(decoded_token.session_id):
        return

    if decoded_token.id_token is None and session_auth_token_registry.has(decoded_token.session_id):
        cached_token = session_auth_token_registry.get(decoded_token.session_id)
        if cached_token.id_token is not None:
            decoded_token = decoded_token.model_copy(update={'id_token': cached_token.id_token})

    session_auth_token_registry.set(decoded_token.session_id, decoded_token)


async def _clear_cached_session_auth_token(token: str):
    """
    Remove cached session token for the session associated with the provided token.

    :param token: session token
    """
    from dara.core.auth.oidc.id_token_cache import oidc_id_token_cache
    from dara.core.internal.registries import session_auth_token_registry

    try:
        decoded = decode_token(token, options={'verify_exp': False})
    except BaseException as e:
        dev_logger.warning(
            'Unable to decode session token while clearing session auth cache',
            {'reason': str(e)},
        )
        return

    if session_auth_token_registry.has(decoded.session_id):
        session_auth_token_registry.remove(decoded.session_id)

    await oidc_id_token_cache.remove(decoded.session_id)


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

    raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR(missing_message))


def _set_session_token_cookie(response: Response, token: str):
    """
    Set the session token cookie.

    :param response: FastAPI response object
    :param token: session token value
    """
    expiration = get_cookie_expiration_from_token(token)
    if expiration is None:
        response.set_cookie(key=SESSION_TOKEN_COOKIE_NAME, value=token, **AUTH_COOKIE_KWARGS)
        return

    max_age, expires = expiration
    response.set_cookie(
        key=SESSION_TOKEN_COOKIE_NAME, value=token, max_age=max_age, expires=expires, **AUTH_COOKIE_KWARGS
    )


def _clear_auth_cookies(response: Response):
    """
    Clear both auth cookies.

    :param response: FastAPI response object
    """
    response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME)
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


def _should_attempt_session_refresh(
    auth_config: BaseAuthConfig,
    auth_error: AuthError,
    refresh_token: str | None,
) -> bool:
    """
    Determine whether verify-session should attempt a server-side refresh.

    We only attempt this for OIDC configurations with a refresh token cookie
    and invalid compact session tokens.
    """
    if refresh_token is None:
        return False

    if auth_error.code != 401 or auth_error.detail != INVALID_TOKEN_ERROR:
        return False

    from dara.core.auth.oidc.config import OIDCAuthConfig

    return isinstance(auth_config, OIDCAuthConfig)


async def _verify_auth_token(auth_config: BaseAuthConfig, token: str) -> TokenData:
    """
    Verify a token for auth configs with sync or async verifier implementations.
    """
    verified_token = auth_config.verify_token(token)
    if isawaitable(verified_token):
        return await verified_token
    return verified_token


async def _refresh_session(
    auth_config: BaseAuthConfig,
    token: str,
    refresh_token: str,
    response: Response,
) -> str:
    """
    Refresh a session and update auth cookies.

    :return: new session token
    """
    old_token_data = decode_token(token, options={'verify_exp': False})
    new_session_token, new_refresh_token = await cached_refresh_token(auth_config.refresh_token, old_token_data, refresh_token)
    _cache_session_auth_token(new_session_token)

    response.set_cookie(key=REFRESH_TOKEN_COOKIE_NAME, value=new_refresh_token, **AUTH_COOKIE_KWARGS)
    _set_session_token_cookie(response, new_session_token)
    return new_session_token


@auth_router.post('/verify-session')
async def verify_session(
    req: Request,
    response: Response,
    dara_session_token: Annotated[str | None, Cookie(alias=SESSION_TOKEN_COOKIE_NAME)] = None,
    dara_refresh_token: Annotated[str | None, Cookie(alias=REFRESH_TOKEN_COOKIE_NAME)] = None,
):
    """
    Helper to verify whether the user has a valid session JWT in the request they made. The function should be applied
    as a dependency to any fast api routes that require session management

    :param dara_session_token: optional session token cookie
    """
    token = _get_auth_token(
        req,
        dara_session_token,
        missing_message='No auth credentials passed',
        invalid_scheme_message='Invalid authentication scheme, please use Bearer tokens',
    )

    # Try decoding the token and return a Session instance if successful
    try:
        from dara.core.internal.registries import auth_registry

        auth_config: BaseAuthConfig = auth_registry.get('auth_config')

        try:
            await _verify_auth_token(auth_config, token)
        except AuthError as auth_error:
            if not _should_attempt_session_refresh(auth_config, auth_error, dara_refresh_token):
                raise

            if dara_refresh_token is None:
                raise

            refreshed_token = await _refresh_session(auth_config, token, dara_refresh_token, response)
            await _verify_auth_token(auth_config, refreshed_token)

        # Attach session_id to the request so it can be accessed in the middleware
        # Because contextvars don't work in middlewares
        req.state.session_id = SESSION_ID.get()
        return SESSION_ID.get()
    except jwt.ExpiredSignatureError as e:
        dev_logger.error('Expired Token Signature', error=e)
        raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR) from e
    except jwt.PyJWTError as e:
        dev_logger.error('Invalid Token', error=e)
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR) from e
    except AuthError as err:
        dev_logger.error('Auth Error', error=err)
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
    token = _get_auth_token(
        request,
        dara_session_token,
        missing_message='No auth credentials passed',
        invalid_scheme_message='Invalid authentication scheme, please use Bearer tokens',
    )

    from dara.core.internal.registries import auth_registry

    auth_config: BaseAuthConfig = auth_registry.get('auth_config')

    result = auth_config.revoke_token(token, response)
    if isawaitable(result):
        result = await result

    await _clear_cached_session_auth_token(token)
    _clear_auth_cookies(response)
    return result


@auth_router.post('/refresh-token')
async def handle_refresh_token(
    request: Request,
    response: Response,
    dara_session_token: Annotated[str | None, Cookie(alias=SESSION_TOKEN_COOKIE_NAME)] = None,
    dara_refresh_token: Annotated[str | None, Cookie(alias=REFRESH_TOKEN_COOKIE_NAME)] = None,
):
    """
    Given a refresh token, issues a new session token and refresh token cookie.

    :param response: FastAPI response object
    :param dara_refresh_token: refresh token cookie
    :param settings: env settings object
    """
    if dara_refresh_token is None:
        raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR('No refresh token provided'))

    token = _get_auth_token(
        request,
        dara_session_token,
        missing_message='No session token provided',
        invalid_scheme_message='Invalid authentication scheme, previous Bearer token must be included in the refresh request',
    )

    from dara.core.internal.registries import auth_registry

    auth_config: BaseAuthConfig = auth_registry.get('auth_config')

    try:
        await _refresh_session(auth_config, token, dara_refresh_token, response)
        return {'success': True}
    except BaseException as e:
        # If an explicit HTTPException was raised, preserve status and error payload.
        if isinstance(e, HTTPException):
            dev_logger.error('Auth Error', error=e)
            return _build_auth_error_response(e.status_code, e.detail)

        # Explicitly handle expired signature error
        if isinstance(e, jwt.ExpiredSignatureError):
            dev_logger.error('Expired Token Signature', error=e)
            return _build_auth_error_response(status_code=401, detail=EXPIRED_TOKEN_ERROR)

        # Otherwise show a generic invalid token error
        dev_logger.error('Invalid Token', error=e)
        return _build_auth_error_response(status_code=401, detail=INVALID_TOKEN_ERROR)


# Request to retrieve a session token from the backend. The app does this on startup.
@auth_router.post('/session')
async def _get_session(body: SessionRequestBody, response: Response):
    from dara.core.internal.registries import auth_registry

    auth_config: BaseAuthConfig = auth_registry.get('auth_config')

    session_response = auth_config.get_token(body)
    if 'token' in session_response:
        _set_session_token_cookie(response, session_response['token'])
        return {'success': True}
    return session_response


@auth_router.get('/user', dependencies=[Depends(verify_session)])
def _get_user():
    return USER.get()
