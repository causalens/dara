from typing import ClassVar
from urllib.parse import quote

import httpx
from fastapi import HTTPException, Response
from jwt import PyJWKClient

from dara.core.internal.settings import get_settings

from ..base import AuthComponent, AuthComponentConfig, BaseAuthConfig
from ..definitions import RedirectResponse, SessionRequestBody, SuccessResponse, TokenData, TokenResponse, UserGroup
from .definitions import OIDCDiscoveryMetadata

JWK_CLIENT_REGISTRY_KEY = 'PyJWKClient'

OIDCAuthLogin = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthLogin')

OIDCAuthLogout = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthLogout')

OIDCAuthSSOCallback = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthSSOCallback')


class OIDCAuthConfig(BaseAuthConfig):
    """
    Generic OIDC auth config
    """

    # TODO: required routes, move definitions here

    component_config: ClassVar[AuthComponentConfig] = AuthComponentConfig(
        login=OIDCAuthLogin,
        logout=OIDCAuthLogout,
        extra={
            'sso-callback': OIDCAuthSSOCallback,
        },
    )

    # Populated during startup_hook
    _discovery: OIDCDiscoveryMetadata | None = None

    @property
    def discovery(self) -> OIDCDiscoveryMetadata:
        """Get the OIDC discovery metadata. Raises if not initialized."""
        if self._discovery is None:
            raise RuntimeError('OIDC discovery metadata not initialized. Ensure startup_hook has been called.')
        return self._discovery

    @property
    def allowed_groups(self):
        # initialise user groups from ENV
        env_groups = get_settings().sso_groups
        parsed_groups = env_groups.split(',')
        return {group.strip(): UserGroup(name=group.strip()) for group in parsed_groups}

    def get_discovery_url(self) -> str:
        issuer_url = get_settings().sso_issuer_url
        return f'{issuer_url}/.well-known/openid-configuration'

    async def startup_hook(self) -> None:
        # Enforce SSO env vars are set
        settings = get_settings()
        for k, v in settings:
            if k.startswith('sso_') and (v in (None, '')) and k != 'sso_extra_audience':
                raise ValueError(f'SSO Auth module requires {k.upper()} .env key to be a non-empty string')

        # Fetch OIDC discovery document
        discovery_url = self.get_discovery_url()
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(discovery_url)
                response.raise_for_status()
            except httpx.HTTPStatusError as e:
                raise RuntimeError(
                    f'Failed to fetch OIDC discovery document from {discovery_url}: HTTP {e.response.status_code}'
                ) from e
            except httpx.RequestError as e:
                raise RuntimeError(f'Failed to fetch OIDC discovery document from {discovery_url}: {e}') from e

            try:
                self._discovery = OIDCDiscoveryMetadata.model_validate(response.json())
            except Exception as e:
                raise RuntimeError(f'Failed to parse OIDC discovery document from {discovery_url}: {e}') from e

        # Register a PyJWKClient instance bound to the jwks_uri from discovery
        from dara.core.internal.registries import utils_registry

        py_jwk_client = PyJWKClient(self.discovery.jwks_uri, lifespan=86400)
        utils_registry.register(JWK_CLIENT_REGISTRY_KEY, py_jwk_client)

    def get_redirect_url(self):
        client_id = get_settings().sso_client_id
        redirect_uri = get_settings().sso_redirect_uri
        issuer_url = get_settings().sso_issuer_url

        # TODO: use discovered
        return f'{issuer_url}/authenticate?client_id={client_id}&response_type=code&scope=openid&redirect_uri={quote(redirect_uri)}'

    def get_token(self, body: SessionRequestBody) -> TokenResponse | RedirectResponse:
        """
        Get token from the IDP - redirect to the redirect url
        """
        return RedirectResponse(redirect_uri=self.get_redirect_url())

    def verify_token(self, token: str) -> TokenData:
        """
        Verify a session token.

        Should set SESSION_ID and USER context variables

        Returns token data

        :param token: encoded token
        """

    def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
        """
        Create a new session token and refresh token from a refresh token.

        Note: the new issued session token should include the same session_id as the old token

        :param old_token: old session token data
        :param refresh_token: encoded refresh token
        :return: new session token, new refresh token
        """
        raise HTTPException(400, f'Auth config {self.__class__.__name__} does not support token refresh')

    def revoke_token(self, token: str, response: Response) -> SuccessResponse | RedirectResponse:
        """
        Revoke a session token.

        :param token: encoded token
        :param response: response object
        """
        return {'success': True}
