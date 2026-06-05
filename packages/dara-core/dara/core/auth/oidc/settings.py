import os
from functools import lru_cache
from typing import Any, Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

OIDCClientAuthMode = Literal['client_secret_basic', 'pkce_public']
DEFAULT_ID_TOKEN_SIGNING_ALG = 'RS256'


class OIDCSettings(BaseSettings):
    """
    OIDC-specific settings, prefixed with SSO_.
    """

    # Required, using field with default=... to have pyright not complain about missing values
    client_id: str = Field(default=...)
    client_secret: str | None = None
    redirect_uri: str = Field(default=...)
    groups: str = Field(default=...)

    # Optional
    client_auth_mode: OIDCClientAuthMode = 'client_secret_basic'
    """Token endpoint client authentication mode."""
    issuer_url: str = 'https://login.causalens.com/api/authentication'
    jwks_lifespan: int = 86400  # 1 day
    # validation_alias bypasses env_prefix, so include full env names here.
    id_token_signed_response_alg: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            'SSO_ID_TOKEN_SIGNED_RESPONSE_ALG',
            'SSO_JWT_ALGO',
        ),
    )
    """JWS alg required for ID tokens issued to this client."""
    scopes: str = 'openid'
    group_claim_name: str = 'groups'
    """Name of the claim containing user groups in ID token or userinfo responses."""
    verify_audience: bool = False
    extra_audience: list[str] | None = None
    allowed_identity_id: str | None = None
    use_userinfo: bool = False
    """If True, require the userinfo endpoint during OIDC login and refresh."""
    discovery_request_timeout_seconds: float = Field(default=5.0, gt=0)
    """Timeout applied to each OIDC discovery HTTP request."""
    discovery_max_attempts: int = Field(default=3, ge=1)
    """Maximum number of attempts when fetching the OIDC discovery document."""
    transaction_ttl_seconds: int = Field(default=86400, ge=1)
    """TTL used to clean up abandoned OIDC login transactions."""
    transaction_max_entries: int = Field(default=10000, ge=1)
    """Maximum number of outstanding OIDC login transactions kept in memory."""

    model_config = SettingsConfigDict(env_file='.env', extra='allow', env_prefix='sso_', populate_by_name=True)

    @model_validator(mode='before')
    @classmethod
    def map_legacy_jwt_algo_constructor_alias(cls, data: Any):
        """
        Preserve constructor compatibility for jwt_algo without accepting unprefixed JWT_ALGO env vars.
        """
        if not isinstance(data, dict):
            return data

        if data.get('id_token_signed_response_alg') is None and data.get('jwt_algo') is not None:
            return {**data, 'id_token_signed_response_alg': data['jwt_algo']}

        return data

    @model_validator(mode='after')
    def apply_audience_env_overrides(self):
        """
        If SSO_AUDIENCE_CLIENT_ID and SSO_AUDIENCE_CLIENT_SECRET are set,
        override client_id/client_secret and enable verify_audience (unless explicitly disabled).
        """
        # Get directly from environment — pydantic doesn't automatically read arbitrary ones
        audience_id = os.getenv('SSO_AUDIENCE_CLIENT_ID')
        audience_secret = os.getenv('SSO_AUDIENCE_CLIENT_SECRET')
        verify_override = os.getenv('SSO_VERIFY_AUDIENCE')

        if audience_id and audience_secret and (verify_override is None or verify_override.lower() != 'false'):
            self.client_id = audience_id
            self.client_secret = audience_secret
            self.verify_audience = True

        return self

    @model_validator(mode='after')
    def validate_client_auth_mode(self):
        """
        Validate token endpoint authentication settings for the selected mode.
        """
        if self.client_auth_mode == 'client_secret_basic' and not self.client_secret:
            raise ValueError('SSO_CLIENT_SECRET is required when SSO_CLIENT_AUTH_MODE=client_secret_basic')

        return self

    @model_validator(mode='after')
    def validate_id_token_signing_alg(self):
        """
        Validate configured ID token signing algorithm settings.
        """
        # OpenID Connect Discovery 1.0 Section 3 permits "none" only for
        # response types that return no ID Token from the Authorization Endpoint.
        # Dara's OIDC verifier expects signed ID tokens and always validates them
        # with the issuer's JWKS, so do not allow an unsigned token policy.
        configured_alg = self.configured_id_token_signed_response_alg or ''
        if configured_alg.lower() == 'none':
            raise ValueError('OIDC ID token signing algorithm "none" is not supported')
        if configured_alg.upper().startswith('HS'):
            raise ValueError('OIDC ID token HMAC signing algorithms are not supported')

        return self

    @property
    def configured_id_token_signed_response_alg(self) -> str | None:
        """
        Resolve the explicitly configured ID token signing alg for this relying party.
        """
        return self.id_token_signed_response_alg

    @property
    def jwt_algo(self) -> str | None:
        """
        Deprecated compatibility alias for id_token_signed_response_alg.
        """
        return self.id_token_signed_response_alg

    @property
    def fallback_id_token_signed_response_alg(self) -> str:
        """
        Resolve the configured ID token signing alg or pre-startup fallback.

        Startup normally resolves verifier algorithms from discovery metadata.
        SSO_JWT_ALGO is kept as a compatibility alias.
        """
        return self.id_token_signed_response_alg or DEFAULT_ID_TOKEN_SIGNING_ALG


@lru_cache
def get_oidc_settings():
    """
    Get a cached instance of the OIDC settings, loading values from the .env if present.
    """
    # Test purposes - if DARA_TEST_FLAG is set then override env with .env.test
    if os.environ.get('DARA_TEST_FLAG', None) is not None:
        return OIDCSettings(_env_file='.env.test')  # type: ignore

    return OIDCSettings()
