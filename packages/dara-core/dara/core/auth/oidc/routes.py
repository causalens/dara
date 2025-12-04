"""
Copyright (c) 2023 by Impulse Innovations Ltd. Private and confidential. Part of the causaLens product.
"""

from typing import cast

import jwt
import requests
from fastapi import Body, Depends, HTTPException, Response

from dara.core.auth.definitions import (
    BAD_REQUEST_ERROR,
    EXPIRED_TOKEN_ERROR,
    INVALID_TOKEN_ERROR,
)
from dara.core.http import post
from dara.core.internal.settings import Settings, get_settings
from dara.core.logging import dev_logger

from .definitions import AuthCodeBody
from .utils import (
    get_token_from_idp,
    handle_idp_error,
    sign_jwt_from_idp,
)


@post('/auth/sso-callback', authenticated=False)
def sso_callback(body: AuthCodeBody, response: Response, settings: Settings = Depends(get_settings)):
    """
    Given an authorization code, exchange it for an ID token and refresh token from the identity provider.
    Issues a new session token and refresh token cookie.

    :param  body: request body containing the authorization code
    :param response: FastAPI response object
    :param settings: env settings object
    """
    from dara.core.internal.registries import auth_registry

    from .config import OIDCAuthConfig

    # If the app is not configured to use OIDC, this is not a valid request
    if not isinstance(auth_registry.get('auth_config'), OIDCAuthConfig):
        raise HTTPException(
            status_code=400,
            detail=BAD_REQUEST_ERROR('Cannot use sso-callback for non-oidc auth configuration'),
        )

    auth_config = cast(OIDCAuthConfig, auth_registry.get('auth_config'))

    # Exchange the authorization code provided for an id token and refresh token from the identity provider
    oidc_tokens = get_token_from_idp(
        auth_config,
        {
            'grant_type': 'authorization_code',
            'redirect_uri': settings.sso_redirect_uri,
            'code': body.auth_code,
        },
    )

    try:
        # Wrap data decoded from id_token in a session token
        session_token = sign_jwt_from_idp(oidc_tokens['id_token'], auth_config)

        # Using 'Strict' as it is only used for the refresh-token endpoint so cross-site requests are not expected
        response.set_cookie(
            key='dara_refresh_token',
            value=oidc_tokens['refresh_token'],
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
    except Exception as err:
        # Catch all - still make sure to print
        dev_logger.error('Auth Error', error=err)
        raise err


@post('/auth/verify-api-key', authenticated=False)
async def verify_api_key(user_id: str = Body(...), api_key: str = Body(...)):
    from dara.core.internal.registries import auth_registry

    if not isinstance(auth_registry.get('auth_config'), SSOAuthConfig):
        raise HTTPException(
            status_code=400,
            detail=BAD_REQUEST_ERROR('Cannot verify api key for non-sso auth configuration'),
        )

    auth_config = cast(SSOAuthConfig, auth_registry.get('auth_config'))

    api_verification_url = auth_config.get_api_verification_url()

    response = requests.post(
        url=api_verification_url,
        json={'id': user_id, 'key': api_key},
        headers={'Accept': 'application/json'},
        timeout=10,
    )

    if response.status_code >= 400:
        excpt = handle_idp_error(response)
        raise excpt

    oidc_tokens = response.json()
    id_token = oidc_tokens['id_token']

    try:
        session_token = sign_jwt_from_idp(id_token, auth_config)
        return {'token': session_token}
    except jwt.ExpiredSignatureError as e:
        dev_logger.error('Expired Token Signature', error=e)
        raise HTTPException(status_code=401, detail=EXPIRED_TOKEN_ERROR) from e
    except jwt.PyJWTError as e:
        dev_logger.error('Invalid Token', error=e)
        raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR) from e
    except Exception as err:
        # Catch all - still make sure to print
        dev_logger.error('Auth Error', error=err)
        raise err
