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
            raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR)
        except jwt.PyJWTError as e:
            dev_logger.error('Invalid Token', error=e)
            raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR)
        except AuthError as err:
            dev_logger.error('Auth Error', error=err)
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
