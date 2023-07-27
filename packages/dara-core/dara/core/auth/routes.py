"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from inspect import iscoroutinefunction

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
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

auth_router = APIRouter()


@auth_router.post('/verify-session')
async def verify_session(
    req: Request,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
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
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR)
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR)
        except AuthError as err:
            raise HTTPException(status_code=err.code, detail=err.detail)
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


# Request to retrieve a session token from the backend. The app does this on startup.
@auth_router.post('/session')
async def _get_session(body: SessionRequestBody):
    from dara.core.internal.registries import auth_registry

    auth_config: BaseAuthConfig = auth_registry.get('auth_config')

    return auth_config.get_token(body)


@auth_router.get('/user', dependencies=[Depends(verify_session)])
def _get_user():
    return USER.get()
