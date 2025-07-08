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

from inspect import iscoroutinefunction
from typing import Union, cast

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from dara.core.auth.base import BaseAuthConfig
from dara.core.auth.definitions import (
    BAD_REQUEST_ERROR,
    EXPIRED_TOKEN_ERROR,
    INVALID_TOKEN_ERROR,
    SESSION_ID,
    USER,
    AuthError,
    SessionRequestBody,
)
from dara.core.auth.utils import cached_refresh_token, decode_token
from dara.core.logging import dev_logger

auth_router = APIRouter()


@auth_router.post('/verify-session')
async def verify_session(
    req: Request,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False)),
):
    """
    Helper to verify whether the user has a valid session JWT in the request they made. The function should be applied
    as a dependency to any fast api routes that require session management

    :param credentials: the extracted credentials from the request
    """
    if credentials is not None:
        # Check scheme is correct
        if credentials.scheme != 'Bearer':
            raise HTTPException(
                status_code=400, detail=BAD_REQUEST_ERROR('Invalid authentication scheme, please use Bearer tokens')
            )
        # Try decoding the token and return a Session instance if successful
        try:
            from dara.core.internal.registries import auth_registry

            auth_config: BaseAuthConfig = auth_registry.get('auth_config')

            # Handle verify_token being async
            verifier = auth_config.verify_token

            if iscoroutinefunction(verifier):
                await verifier(credentials.credentials)
            else:
                verifier(credentials.credentials)

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
    raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR('No auth credentials passed'))


@auth_router.post('/revoke-session')
async def _revoke_session(response: Response, credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())):
    """
    Helper to revoke a session and its' associated token
    """
    if credentials is not None:
        # Check scheme is correct
        if credentials.scheme != 'Bearer':
            raise HTTPException(
                status_code=400, detail=BAD_REQUEST_ERROR('Invalid authentication scheme, please use Bearer tokens')
            )

        from dara.core.internal.registries import auth_registry

        auth_config: BaseAuthConfig = auth_registry.get('auth_config')

        return auth_config.revoke_token(credentials.credentials, response)
    raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR('No auth credentials passed'))


@auth_router.post('/refresh-token')
async def handle_refresh_token(
    response: Response,
    dara_refresh_token: Union[str, None] = Cookie(default=None),
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
):
    """
    Given a refresh token, issues a new session token and refresh token cookie.

    :param response: FastAPI response object
    :param dara_refresh_token: refresh token cookie
    :param settings: env settings object
    """
    if dara_refresh_token is None:
        raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR('No refresh token provided'))

    # Check scheme is correct
    if credentials.scheme != 'Bearer':
        raise HTTPException(
            status_code=400,
            detail=BAD_REQUEST_ERROR(
                'Invalid authentication scheme, previous Bearer token must be included in the refresh request'
            ),
        )

    from dara.core.internal.registries import auth_registry

    auth_config: BaseAuthConfig = auth_registry.get('auth_config')

    try:
        # decode the old token ignoring expiry date
        old_token_data = decode_token(credentials.credentials, options={'verify_exp': False})

        # Refresh logic up to implementation - passing in old token data so session_id can be preserved
        session_token, refresh_token = await cached_refresh_token(
            auth_config.refresh_token, old_token_data, dara_refresh_token
        )

        # Using 'Strict' as it is only used for the refresh-token endpoint so cross-site requests are not expected
        response.set_cookie(
            key='dara_refresh_token', value=refresh_token, secure=True, httponly=True, samesite='strict'
        )
        return {'token': session_token}
    except BaseException as e:
        # Regardless of exception type, clear the refresh token cookie
        response.delete_cookie('dara_refresh_token')
        headers = {'set-cookie': response.headers['set-cookie']}

        # If an explicit HTTPException was raised, re-raise it with the cookie header
        if isinstance(e, HTTPException):
            dev_logger.error('Auth Error', error=e)
            e.headers = headers
            raise e

        # Explicitly handle expired signature error
        if isinstance(e, jwt.ExpiredSignatureError):
            dev_logger.error('Expired Token Signature', error=e)
            raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR, headers=headers) from e

        # Otherwise show a generic invalid token error
        dev_logger.error('Invalid Token', error=cast(Exception, e))
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR, headers=headers) from e


# Request to retrieve a session token from the backend. The app does this on startup.
@auth_router.post('/session')
async def _get_session(body: SessionRequestBody):
    from dara.core.internal.registries import auth_registry

    auth_config: BaseAuthConfig = auth_registry.get('auth_config')

    return auth_config.get_token(body)


@auth_router.get('/user', dependencies=[Depends(verify_session)])
def _get_user():
    return USER.get()
