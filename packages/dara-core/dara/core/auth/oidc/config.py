from typing import ClassVar

from fastapi import Response
from jwt import PyJWKClient
from pydantic import BaseModel

from dara.core.internal.settings import get_settings

from ..base import AuthComponent, AuthComponentConfig, BaseAuthConfig
from ..definitions import RedirectResponse, SessionRequestBody, SuccessResponse, TokenData, TokenResponse, UserGroup

JWK_CLIENT_REGISTRY_KEY = 'PyJWKClient'

OIDCAuthLogin = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthLogin')

OIDCAuthLogout = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthLogout')

OIDCAuthSSOCallback = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthSSOCallback')


class OIDCDiscoveryMetadata(BaseModel):
    issuer: str
    """
    REQUIRED. URL using the https scheme with no query or fragment components that the OP asserts as its Issuer Identifier. If Issuer discovery is supported (see Section 2), this value MUST be identical to the issuer value returned by WebFinger. This also MUST be identical to the iss Claim value in ID Tokens issued from this Issuer.
    """


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

    @property
    def allowed_groups(self):
        # initialise user groups from ENV
        env_groups = get_settings().sso_groups
        parsed_groups = env_groups.split(',')
        return {group.strip(): UserGroup(name=group.strip()) for group in parsed_groups}

    async def startup_hook(self) -> None:
        # Enforce SSO env vars are set
        settings = get_settings()
        for k, v in settings:
            if k.startswith('sso_') and (v in (None, '')) and k != 'sso_extra_audience':
                raise ValueError(f'SSO Auth module requires {k.upper()} .env key to be a non-empty string')

        # Register a PyJWKClient instance bound to the url; this caches the JWKS based on `kid` requested
        from dara.core.internal.registries import auth_registry, utils_registry

        # TODO: do discovery here and get url
        # Register a shared instance of JWKS client bound to the url; this caches the JWKS based on `kid` requested
        jwks_url = ''
        py_jwk_client = PyJWKClient(jwks_url, lifespan=86400)
        utils_registry.register(JWK_CLIENT_REGISTRY_KEY, py_jwk_client)

    def get_discovery_url(self):
        issuer_url = get_settings().sso_issuer_url
        return f'{issuer_url}/.well-known/openid-configuration'

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
