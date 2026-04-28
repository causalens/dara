import os
from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

OIDCClientAuthMode = Literal['client_secret_basic', 'pkce_public']


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
    jwt_algo: str = 'ES256'
    scopes: str = 'openid'
    verify_audience: bool = False
    extra_audience: list[str] | None = None
    allowed_identity_id: str | None = None
    use_userinfo: bool = False
    """If True, fetch additional claims from the userinfo endpoint when an access token is available."""
    discovery_request_timeout_seconds: float = Field(default=5.0, gt=0)
    """Timeout applied to each OIDC discovery HTTP request."""
    discovery_max_attempts: int = Field(default=3, ge=1)
    """Maximum number of attempts when fetching the OIDC discovery document."""
    transaction_ttl_seconds: int = Field(default=86400, ge=1)
    """TTL used to clean up abandoned OIDC login transactions."""
    transaction_max_entries: int = Field(default=10000, ge=1)
    """Maximum number of outstanding OIDC login transactions kept in memory."""
    id_token_cache_idle_ttl_seconds: int = Field(default=1800, ge=1)
    """Sliding TTL for cached OIDC id_tokens used to hydrate compact session tokens."""
    id_token_cache_max_entries: int = Field(default=10000, ge=1)
    """Maximum number of cached OIDC id_tokens kept in memory."""

    model_config = SettingsConfigDict(env_file='.env', extra='allow', env_prefix='sso_')

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


@lru_cache
def get_oidc_settings():
    """
    Get a cached instance of the OIDC settings, loading values from the .env if present.
    """
    # Test purposes - if DARA_TEST_FLAG is set then override env with .env.test
    if os.environ.get('DARA_TEST_FLAG', None) is not None:
        return OIDCSettings(_env_file='.env.test')  # type: ignore

    return OIDCSettings()
