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

from typing import cast

import jwt
from fastapi import Depends, HTTPException, Response

from dara.core.auth.definitions import (
    BAD_REQUEST_ERROR,
    EXPIRED_TOKEN_ERROR,
    INVALID_TOKEN_ERROR,
)
from dara.core.auth.oidc.settings import OIDCSettings, get_oidc_settings
from dara.core.auth.utils import sign_jwt
from dara.core.http import post
from dara.core.logging import dev_logger

from .definitions import REFRESH_TOKEN_COOKIE_NAME, AuthCodeRequestBody
from .utils import decode_id_token, get_token_from_idp


@post('/auth/sso-callback', authenticated=False)
async def sso_callback(
    body: AuthCodeRequestBody, response: Response, oidc_settings: OIDCSettings = Depends(get_oidc_settings)
):
    """
    Handle the OIDC authorization callback.

    This endpoint is called after the user authenticates with the IDP. It:
    1. Validates the state parameter (CSRF protection) if provided
    2. Exchanges the authorization code for tokens at the IDP's token endpoint
    3. Verifies the ID token and extracts user information
    4. Issues a Dara session token and sets the refresh token cookie

    Per OpenID Connect Core 1.0 Section 3.1.2.5 (Authorization Code Flow).

    :param body: Request body containing auth_code and optional state
    :param response: FastAPI response object (for setting cookies)
    :param settings: Application settings
    :return: Token response containing the session token
    """
    from dara.core.internal.registries import auth_registry

    from .config import OIDCAuthConfig

    # Verify the app is configured for OIDC
    auth_config = auth_registry.get('auth_config')
    if not isinstance(auth_config, OIDCAuthConfig):
        raise HTTPException(
            status_code=400,
            detail=BAD_REQUEST_ERROR('Cannot use sso-callback for non-OIDC auth configuration'),
        )

    auth_config = cast(OIDCAuthConfig, auth_config)

    # Validate state parameter if provided (CSRF protection)
    if body.state:
        try:
            auth_config.verify_state(body.state)
        except jwt.ExpiredSignatureError as e:
            dev_logger.error('State parameter expired', error=e)
            raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR('State parameter expired')) from e
        except jwt.InvalidTokenError as e:
            dev_logger.error('Invalid state parameter', error=e)
            raise HTTPException(status_code=400, detail=BAD_REQUEST_ERROR('Invalid state parameter')) from e

    try:
        # Exchange authorization code for tokens per RFC 6749 Section 4.1.3
        oidc_tokens = await get_token_from_idp(
            auth_config,
            {
                'grant_type': 'authorization_code',
                'code': body.auth_code,
                'redirect_uri': oidc_settings.redirect_uri,
            },
        )

        # Ensure we received an ID token
        if not oidc_tokens.id_token:
            raise HTTPException(
                status_code=401,
                detail=INVALID_TOKEN_ERROR,
            )

        # Decode and verify the ID token
        claims = decode_id_token(oidc_tokens.id_token)

        # Fetch userinfo if enabled and we have an access token
        userinfo = None
        if oidc_settings.use_userinfo and oidc_tokens.access_token:
            userinfo = await auth_config.fetch_userinfo(oidc_tokens.access_token)

        # Extract user data from claims (handles both standard OIDC and Causalens identity claim)
        user_data = auth_config.extract_user_data(claims, userinfo=userinfo)

        # Verify user has access based on groups
        auth_config.verify_user_access(user_data)

        # Create a Dara session token wrapping the ID token data
        session_token = sign_jwt(
            identity_id=user_data.identity_id,
            identity_name=user_data.identity_name,
            identity_email=user_data.identity_email,
            groups=user_data.groups or [],
            id_token=oidc_tokens.id_token,
            exp=int(claims.exp),
        )

        # Set refresh token cookie if provided
        if oidc_tokens.refresh_token:
            response.set_cookie(
                key=REFRESH_TOKEN_COOKIE_NAME,
                value=oidc_tokens.refresh_token,
                secure=True,
                httponly=True,
                samesite='strict',
            )

        return {'token': session_token}

    except jwt.ExpiredSignatureError as e:
        dev_logger.error('Expired Token Signature', error=e)
        raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR) from e
    except jwt.PyJWTError as e:
        dev_logger.error('Invalid Token', error=e)
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR) from e
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as err:
        dev_logger.error('Auth Error', error=err)
        raise HTTPException(status_code=500, detail=BAD_REQUEST_ERROR('Authentication failed')) from err
