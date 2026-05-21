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

from typing import Any
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, Request, Response

from dara.core.auth.definitions import (
    BAD_REQUEST_ERROR,
    EXPIRED_TOKEN_ERROR,
    INVALID_TOKEN_ERROR,
    SESSION_TOKEN_COOKIE_NAME,
    TokenData,
)
from dara.core.auth.oidc.settings import OIDCSettings, get_oidc_settings
from dara.core.auth.request_logging import auth_request_log_extra, log_auth_exception, log_auth_request_rejection
from dara.core.auth.session import create_auth_session, get_auth_session_cookie_expiration
from dara.core.auth.utils import set_cookie_from_expiration, sign_jwt
from dara.core.http import post
from dara.core.logging import dev_logger

from .definitions import OIDC_LOGIN_SESSION_COOKIE_NAME, AuthCodeRequestBody
from .transaction_store import oidc_transaction_store
from .utils import decode_id_token, get_token_from_idp


def _oidc_login_cookie_log_extra(request: Request) -> dict[str, bool]:
    return {'has_login_session_cookie': OIDC_LOGIN_SESSION_COOKIE_NAME in request.cookies}


def _oidc_callback_log_extra(
    request: Request,
    *,
    status_code: int,
    detail: Any,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return auth_request_log_extra(
        request,
        status_code=status_code,
        detail=detail,
        extra={
            **_oidc_login_cookie_log_extra(request),
            **(extra or {}),
        },
    )


@post('/auth/sso-callback', authenticated=False)
async def sso_callback(
    body: AuthCodeRequestBody,
    request: Request,
    response: Response,
    oidc_settings: OIDCSettings = Depends(get_oidc_settings),
):
    """
    Handle the OIDC authorization callback.

    This endpoint is called after the user authenticates with the IDP. It:
    1. Validates the state parameter (CSRF protection) if provided
    2. Exchanges the authorization code for tokens at the IDP's token endpoint
    3. Verifies the ID token and extracts user information
    4. Stores auth token material server-side and sets an opaque session cookie

    Per OpenID Connect Core 1.0 Section 3.1.2.5 (Authorization Code Flow).

    :param body: Request body containing auth_code and optional state
    :param response: FastAPI response object (for setting cookies)
    :param settings: Application settings
    :return: success response
    """
    from dara.core.internal.registries import auth_registry

    from .config import OIDCAuthConfig

    # Verify the app is configured for OIDC
    auth_config = auth_registry.get('auth_config')
    if not isinstance(auth_config, OIDCAuthConfig):
        detail = BAD_REQUEST_ERROR('Cannot use sso-callback for non-OIDC auth configuration')
        log_auth_request_rejection(
            'OIDC callback rejected',
            request,
            status_code=400,
            detail=detail,
            extra=_oidc_login_cookie_log_extra(request),
        )
        raise HTTPException(
            status_code=400,
            detail=detail,
        )

    login_session_id = request.cookies.get(OIDC_LOGIN_SESSION_COOKIE_NAME)
    transaction = oidc_transaction_store.take_if_login_session_matches(body.state, login_session_id)
    if transaction is None:
        detail = BAD_REQUEST_ERROR('Invalid state parameter')
        dev_logger.error(
            'Invalid state parameter',
            error=Exception('state cookie mismatch'),
            extra=_oidc_callback_log_extra(request, status_code=400, detail=detail),
        )
        raise HTTPException(status_code=400, detail=detail)

    try:
        # Exchange authorization code for tokens per RFC 6749 Section 4.1.3
        oidc_tokens = await get_token_from_idp(
            auth_config,
            {
                'grant_type': 'authorization_code',
                'code': body.auth_code,
                'redirect_uri': oidc_settings.redirect_uri,
                **({'code_verifier': transaction.code_verifier} if transaction.code_verifier is not None else {}),
            },
        )

        # Ensure we received an ID token
        if not oidc_tokens.id_token:
            log_auth_request_rejection(
                'OIDC callback missing ID token',
                request,
                status_code=401,
                detail=INVALID_TOKEN_ERROR,
                extra=_oidc_login_cookie_log_extra(request),
            )
            raise HTTPException(
                status_code=401,
                detail=INVALID_TOKEN_ERROR,
            )

        # Decode and verify the ID token
        claims = decode_id_token(oidc_tokens.id_token)
        if claims.nonce is None or claims.nonce != transaction.nonce:
            dev_logger.error(
                'Invalid OIDC nonce',
                error=Exception('nonce mismatch'),
                extra=_oidc_callback_log_extra(request, status_code=401, detail=INVALID_TOKEN_ERROR),
            )
            raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR)

        # Fetch userinfo if enabled and we have an access token
        userinfo = None
        if oidc_settings.use_userinfo and oidc_tokens.access_token:
            userinfo = await auth_config.fetch_userinfo(oidc_tokens.access_token)

        # Extract user data from claims (handles both standard OIDC and Causalens identity claim)
        user_data = auth_config.extract_user_data(claims, userinfo=userinfo)

        # Verify user has access based on groups
        auth_config.verify_user_access(user_data)

        session_id = str(uuid4())

        # Create an internal Dara session token. The browser only receives an opaque handle for it.
        raw_session_token = sign_jwt(
            exp=int(claims.exp),
            identity_id=user_data.identity_id,
            identity_name=user_data.identity_name,
            identity_email=user_data.identity_email,
            groups=user_data.groups or [],
            id_token=oidc_tokens.id_token,
            session_id=session_id,
        )
        token_data = TokenData(
            session_id=session_id,
            exp=int(claims.exp),
            identity_id=user_data.identity_id,
            identity_name=user_data.identity_name,
            identity_email=user_data.identity_email,
            groups=user_data.groups or [],
            id_token=oidc_tokens.id_token,
        )
        session_token = await create_auth_session(
            raw_session_token,
            token_data,
            refresh_token=oidc_tokens.refresh_token,
        )

        session_expires_at = get_auth_session_cookie_expiration(token_data, oidc_tokens.refresh_token)
        set_cookie_from_expiration(response, SESSION_TOKEN_COOKIE_NAME, session_token, session_expires_at)
        response.delete_cookie(OIDC_LOGIN_SESSION_COOKIE_NAME)

        return {'success': True, 'redirect_to': transaction.redirect_to}

    except jwt.ExpiredSignatureError as e:
        log_auth_exception(
            'Expired Token Signature',
            request,
            error=e,
            status_code=401,
            detail=EXPIRED_TOKEN_ERROR,
            extra=_oidc_login_cookie_log_extra(request),
        )
        raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR) from e
    except jwt.PyJWTError as e:
        log_auth_exception(
            'Invalid Token',
            request,
            error=e,
            status_code=401,
            detail=INVALID_TOKEN_ERROR,
            extra=_oidc_login_cookie_log_extra(request),
        )
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR) from e
    except HTTPException as err:
        log_auth_request_rejection(
            'OIDC callback rejected',
            request,
            status_code=err.status_code,
            detail=err.detail,
            extra=_oidc_login_cookie_log_extra(request),
        )
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as err:
        detail = BAD_REQUEST_ERROR('Authentication failed')
        log_auth_exception(
            'OIDC callback failed unexpectedly',
            request,
            error=err,
            status_code=500,
            detail=detail,
            extra=_oidc_login_cookie_log_extra(request),
        )
        raise HTTPException(status_code=500, detail=detail) from err
