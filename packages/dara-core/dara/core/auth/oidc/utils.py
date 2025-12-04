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

from __future__ import annotations

from base64 import b64encode
from typing import TYPE_CHECKING

import httpx
import jwt
from fastapi import HTTPException
from pydantic import BaseModel

from dara.core.auth.definitions import OTHER_AUTH_ERROR
from dara.core.internal.settings import get_settings
from dara.core.logging import dev_logger

from .definitions import JWK_CLIENT_REGISTRY_KEY, IdTokenClaims

if TYPE_CHECKING:
    from .config import OIDCAuthConfig


class OIDCTokenResponse(BaseModel):
    """
    Token response from the OIDC token endpoint per RFC 6749 Section 5.1.
    """

    access_token: str
    token_type: str
    expires_in: int | None = None
    refresh_token: str | None = None
    scope: str | None = None
    id_token: str | None = None

    class Config:
        extra = 'allow'


def decode_id_token(id_token: str) -> IdTokenClaims:
    """
    Decode and verify a JWT ID token received from an OIDC provider.

    Uses the registered PyJWKClient to fetch the signing key and verify the signature.

    :param id_token: The raw JWT ID token string
    :return: Decoded and validated ID token claims
    :raises jwt.InvalidTokenError: If the token is invalid or signature verification fails
    """
    from dara.core.internal.registries import utils_registry

    jwks_client: jwt.PyJWKClient = utils_registry.get(JWK_CLIENT_REGISTRY_KEY)
    settings = get_settings()

    # Build audience list for verification if enabled
    audience = None
    if settings.sso_verify_audience:
        audience = [settings.sso_client_id]
        if settings.sso_extra_audience:
            audience.extend(settings.sso_extra_audience)

    # Decode and verify the token
    decoded = jwt.decode(
        id_token,
        jwks_client.get_signing_key_from_jwt(id_token).key,
        algorithms=[settings.sso_jwt_algo],
        audience=audience,
    )

    return IdTokenClaims.model_validate(decoded)


def handle_idp_error(response: httpx.Response) -> HTTPException:
    """
    Handle an error response from the IDP token endpoint.

    :param response: The HTTP response from the IDP
    :return: HTTPException to raise
    """
    exc = HTTPException(
        status_code=401,
        detail=OTHER_AUTH_ERROR('Identity provider authorization failed'),
    )
    try:
        content = response.json()
    except Exception:
        content = response.text
    dev_logger.error(
        'IDP authorization failed',
        exc,
        {'idp_response_content': content, 'idp_response_status': response.status_code},
    )
    return exc


async def get_token_from_idp(auth_config: OIDCAuthConfig, body: dict) -> OIDCTokenResponse:
    """
    Request tokens from the OIDC provider's token endpoint.

    Per RFC 6749 Section 4.1.3 (Authorization Code Grant) and Section 6 (Refreshing an Access Token),
    the token request is sent to the token_endpoint using POST with application/x-www-form-urlencoded.

    Client authentication uses HTTP Basic auth with client_id:client_secret per RFC 6749 Section 2.3.1.

    :param auth_config: Current OIDC auth config (used to get token_endpoint from discovery)
    :param body: Request body parameters (grant_type, code/refresh_token, redirect_uri, etc.)
    :return: Token response containing access_token, id_token, refresh_token, etc.
    :raises HTTPException: If the IDP returns an error
    """
    settings = get_settings()

    # Get token endpoint from discovery
    token_endpoint = auth_config.get_token_endpoint()

    # Build Basic auth header: base64(client_id:client_secret)
    credentials = f'{settings.sso_client_id}:{settings.sso_client_secret}'
    encoded_credentials = b64encode(credentials.encode()).decode()

    # Make the token request per RFC 6749
    # Note: Using application/x-www-form-urlencoded as required by spec
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url=token_endpoint,
            headers={
                'Accept': 'application/json',
                'Authorization': f'Basic {encoded_credentials}',
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data=body,  # httpx will encode as form data
            timeout=10,
        )

    if response.status_code >= 400:
        raise handle_idp_error(response)

    return OIDCTokenResponse.model_validate(response.json())
