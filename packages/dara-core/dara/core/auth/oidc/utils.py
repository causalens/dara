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
from threading import Lock
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import httpx
import jwt
from anyio import to_thread
from fastapi import HTTPException
from jwt import PyJWK, PyJWKClient
from opentelemetry.trace import SpanKind
from pydantic import BaseModel, ConfigDict

from dara.core.auth.definitions import OTHER_AUTH_ERROR
from dara.core.logging import dev_logger
from dara.core.telemetry import annotate_auth_observation, observe_auth

from .definitions import (
    ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY,
    JWK_CLIENT_REGISTRY_KEY,
    IdTokenClaims,
)
from .settings import get_oidc_settings

if TYPE_CHECKING:
    from .config import OIDCAuthConfig


class OIDCTokenResponse(BaseModel):
    """
    Token response from the OIDC token endpoint per OIDC Core 1.0 Section 3.1.3.3
    """

    id_token: str | None = None

    access_token: str | None = None
    """
    CONCESSION: Not used by Dara so accepting missing token here
    """

    refresh_token: str | None = None

    token_type: str | None = None
    """
    CONCESSION: Not provided by our internal IDP so marking as optional.
    Normally should be 'Bearer'
    """

    expires_in: int | None = None
    scope: str | None = None

    model_config = ConfigDict(extra='allow')


class InstrumentedPyJWKClient(PyJWKClient):
    """
    PyJWT signing-key client with scoped telemetry around real JWKS fetches.

    Production async callers execute resolution in a worker thread. The lock
    prevents concurrent cache misses from issuing duplicate provider requests.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._resolution_lock = Lock()
        self._fetch_count = 0

    def fetch_data(self):
        """Fetch the configured JWKS document within a client-kind span."""
        parsed_uri = urlparse(self.uri)
        attributes: dict[str, str | int] = {
            'http.request.method': 'GET',
            'server.address': parsed_uri.hostname or 'unknown',
            'url.scheme': parsed_uri.scheme,
        }
        if parsed_uri.port is not None:
            attributes['server.port'] = parsed_uri.port

        with observe_auth(
            'oidc.jwks.fetch',
            system='oidc',
            attributes=attributes,
            span_kind=SpanKind.CLIENT,
        ):
            data = super().fetch_data()
        self._fetch_count += 1
        return data

    def get_signing_key_with_cache_result(self, token: str) -> tuple[PyJWK, str]:
        """
        Resolve the signing key and return a bounded cache result.

        :param token: encoded ID token; never attached to telemetry
        :return: signing key and ``hit``, ``miss``, or ``refresh``
        """
        with self._resolution_lock:
            cache_was_warm = self.jwk_set_cache is not None and self.jwk_set_cache.get() is not None
            fetch_count = self._fetch_count
            signing_key = super().get_signing_key_from_jwt(token)
            fetched = self._fetch_count != fetch_count
            cache_result = 'refresh' if cache_was_warm and fetched else 'miss' if fetched else 'hit'
            return signing_key, cache_result


def _get_id_token_verification_options(id_token: str) -> tuple[str, list[str], list[str] | None]:
    """Resolve bounded verifier policy for an ID token."""
    from dara.core.internal.registries import utils_registry

    oidc_settings = get_oidc_settings()
    id_token_signing_algs = (
        utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY)
        if utils_registry.has(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY)
        else [oidc_settings.fallback_id_token_signed_response_alg]
    )
    token_alg = jwt.get_unverified_header(id_token).get('alg')

    if not isinstance(token_alg, str):
        raise jwt.InvalidAlgorithmError('OIDC ID token signing algorithm is missing')

    if token_alg.upper().startswith('HS'):
        raise jwt.InvalidAlgorithmError('OIDC ID token HMAC signing algorithms are not supported')

    # The JOSE header is attacker-controlled input, so it is not trusted as
    # policy. It only states the algorithm the token claims was used. RFC 8725
    # Section 3.1 requires checking that claimed algorithm against a
    # caller-controlled allow-list; our allow-list comes from explicit env
    # policy or validated OIDC discovery metadata resolved during startup.
    if token_alg not in id_token_signing_algs:
        raise jwt.InvalidAlgorithmError(
            'OIDC ID token signing algorithm is not allowed: '
            f'token alg {token_alg}, allowed algs {id_token_signing_algs}'
        )

    # Build audience list for verification if enabled
    audience = None
    if oidc_settings.verify_audience:
        audience = [oidc_settings.client_id]
        if oidc_settings.extra_audience:
            audience.extend(oidc_settings.extra_audience)

    return token_alg, id_token_signing_algs, audience


def _decode_with_signing_key(
    id_token: str,
    signing_key: PyJWK,
    token_alg: str,
    audience: list[str] | None,
) -> IdTokenClaims:
    """Decode an ID token after its signing key and algorithm policy are resolved."""
    key_alg = getattr(signing_key, '_jwk_data', {}).get('alg')

    # The JWK "alg" member is optional. When the OP publishes it, treat it as a
    # trusted key-level constraint from the issuer's jwks_uri and require it to
    # match the token's claimed operation. When it is omitted, do not use
    # PyJWT's algorithm_name as policy: PyJWT supplies key-type defaults such
    # as RS256 for RSA keys, which would incorrectly reject valid PS256/RS384
    # tokens that were allowed by env/discovery and signed by the selected key.
    if isinstance(key_alg, str) and key_alg != token_alg:
        raise jwt.InvalidAlgorithmError(f'OIDC ID token JWK alg {key_alg} does not match token alg {token_alg}')

    oidc_settings = get_oidc_settings()
    decoded = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=[token_alg],
        audience=audience,
        issuer=oidc_settings.issuer_url,
        options={'verify_aud': oidc_settings.verify_audience},
    )
    return IdTokenClaims.model_validate(decoded)


def _id_token_failure_reason(error: BaseException) -> str:
    """Return a bounded classification for a rejected ID token."""
    if isinstance(error, jwt.ExpiredSignatureError):
        return 'token_expired'
    if isinstance(error, jwt.InvalidAlgorithmError):
        return 'algorithm_rejected'
    if isinstance(error, jwt.DecodeError):
        return 'malformed_token'
    return 'invalid_token'


def decode_id_token(id_token: str) -> IdTokenClaims:
    """
    Decode and verify a JWT ID token received from an OIDC provider.

    Uses the registered PyJWKClient to fetch the signing key and verify the signature.

    :param id_token: The raw JWT ID token string
    :return: Decoded and validated ID token claims
    :raises jwt.InvalidTokenError: If the token is invalid or signature verification fails
    """
    from dara.core.internal.registries import utils_registry

    jwks_client: InstrumentedPyJWKClient = utils_registry.get(JWK_CLIENT_REGISTRY_KEY)
    with observe_auth('oidc.id_token.verify', system='oidc') as observation:
        try:
            token_alg, _, audience = _get_id_token_verification_options(id_token)
            annotate_auth_observation(
                observation,
                attributes={'dara.auth.oidc.id_token.algorithm': token_alg},
            )
            signing_key, cache_result = jwks_client.get_signing_key_with_cache_result(id_token)
            annotate_auth_observation(
                observation,
                attributes={'dara.auth.oidc.jwks.cache.result': cache_result},
            )
            return _decode_with_signing_key(id_token, signing_key, token_alg, audience)
        except (jwt.PyJWTError, ValueError) as error:
            annotate_auth_observation(
                observation,
                outcome='denied',
                failure_reason=_id_token_failure_reason(error),
            )
            raise


async def decode_id_token_async(id_token: str) -> IdTokenClaims:
    """
    Decode and verify an ID token through Dara's non-blocking JWKS resolver.

    :param id_token: encoded ID token; never attached to telemetry
    """
    from dara.core.internal.registries import utils_registry

    jwks_client: InstrumentedPyJWKClient = utils_registry.get(JWK_CLIENT_REGISTRY_KEY)
    with observe_auth('oidc.id_token.verify', system='oidc') as observation:
        try:
            token_alg, _, audience = _get_id_token_verification_options(id_token)
            annotate_auth_observation(
                observation,
                attributes={'dara.auth.oidc.id_token.algorithm': token_alg},
            )
            signing_key, cache_result = await to_thread.run_sync(
                jwks_client.get_signing_key_with_cache_result,
                id_token,
            )
            annotate_auth_observation(
                observation,
                attributes={'dara.auth.oidc.jwks.cache.result': cache_result},
            )
            return _decode_with_signing_key(id_token, signing_key, token_alg, audience)
        except (jwt.PyJWTError, ValueError) as error:
            annotate_auth_observation(
                observation,
                outcome='denied',
                failure_reason=_id_token_failure_reason(error),
            )
            raise


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


async def get_token_from_idp(
    auth_config: OIDCAuthConfig,
    body: dict,
) -> OIDCTokenResponse:
    """
    Request tokens from the OIDC provider's token endpoint.

    Per RFC 6749 Section 4.1.3 (Authorization Code Grant) and Section 6 (Refreshing an Access Token),
    the token request is sent to the token_endpoint using POST with application/x-www-form-urlencoded.

    Client authentication uses the configured OIDC client auth mode. The default is HTTP Basic auth with
    client_id:client_secret per RFC 6749 Section 2.3.1. Public clients send client_id in the form body
    and rely on PKCE for the authorization code exchange.

    :param auth_config: Current OIDC auth config (used to get token_endpoint from discovery)
    :param body: Request body parameters (grant_type, code/refresh_token, redirect_uri, etc.)
    :return: Token response containing access_token, id_token, refresh_token, etc.
    :raises HTTPException: If the IDP returns an error
    """
    oidc_settings = get_oidc_settings()

    grant_type = str(body.get('grant_type', 'unknown'))
    with observe_auth(
        'oidc.token_exchange',
        system='oidc',
        attributes={
            'dara.auth.oidc.grant.type': grant_type,
            'dara.auth.oidc.client.mode': oidc_settings.client_auth_mode,
            'dara.auth.oidc.pkce.enabled': 'code_verifier' in body,
        },
    ) as observation:
        # Get token endpoint from discovery
        token_endpoint = auth_config.get_token_endpoint()

        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        data = body

        if oidc_settings.client_auth_mode == 'client_secret_basic':
            # Build Basic auth header: base64(client_id:client_secret)
            credentials = f'{oidc_settings.client_id}:{oidc_settings.client_secret}'
            encoded_credentials = b64encode(credentials.encode()).decode()
            headers['Authorization'] = f'Basic {encoded_credentials}'
        else:
            data = {**body, 'client_id': oidc_settings.client_id}

        # Make the token request per RFC 6749.
        # Using application/x-www-form-urlencoded is required by the specification.
        # Headers and bodies are excluded from the scoped HTTPX instrumentation.
        response = await auth_config.client.post(
            url=token_endpoint,
            headers=headers,
            data=data,
            timeout=10,
        )
        annotate_auth_observation(
            observation,
            attributes={'http.response.status_code': response.status_code},
        )

        if response.status_code >= 400:
            annotate_auth_observation(
                observation,
                outcome='denied',
                failure_reason='provider_http_error',
            )
            raise handle_idp_error(response)

        try:
            return OIDCTokenResponse.model_validate(response.json())
        except (ValueError, TypeError) as error:
            observation.record_exception(error)
            annotate_auth_observation(
                observation,
                outcome='error',
                failure_reason='invalid_provider_response',
            )
            raise HTTPException(
                status_code=401, detail=OTHER_AUTH_ERROR('Identity provider response was invalid')
            ) from error
