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

import jwt

from dara.core.internal.settings import get_settings

from .definitions import JWK_CLIENT_REGISTRY_KEY, IdTokenClaims


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
