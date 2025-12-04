from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe
from typing import ClassVar
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import HTTPException, Response
from jwt import PyJWKClient

from dara.core.internal.settings import get_settings
from dara.core.logging import dev_logger

from ..base import AuthComponent, AuthComponentConfig, BaseAuthConfig
from ..definitions import (
    ID_TOKEN,
    INVALID_TOKEN_ERROR,
    JWT_ALGO,
    SESSION_ID,
    USER,
    AuthError,
    RedirectResponse,
    SessionRequestBody,
    SuccessResponse,
    TokenData,
    TokenResponse,
    UserData,
    UserGroup,
)
from ..utils import decode_token
from .definitions import JWK_CLIENT_REGISTRY_KEY, REFRESH_TOKEN_COOKIE_NAME, IdTokenClaims, OIDCDiscoveryMetadata
from .utils import decode_id_token

# Expiration time for the state JWT (5 minutes should be plenty for the OAuth flow)
STATE_EXPIRATION_MINUTES = 5

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
        # 1. Enforce SSO env vars are set
        settings = get_settings()
        for k, v in settings:
            if k.startswith('sso_') and (v in (None, '')) and k != 'sso_extra_audience':
                raise ValueError(f'SSO Auth module requires {k.upper()} .env key to be a non-empty string')

        # 2. Fetch OIDC discovery document
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

        # 3. Register a PyJWKClient instance bound to the jwks_uri from discovery
        from dara.core.internal.registries import utils_registry

        py_jwk_client = PyJWKClient(self.discovery.jwks_uri, lifespan=86400)
        utils_registry.register(JWK_CLIENT_REGISTRY_KEY, py_jwk_client)

    def generate_state(self, redirect_to: str | None = None) -> str:
        """
        Generate a signed JWT state parameter for CSRF protection.

        The state is a JWT signed with the application's secret containing:
        - nonce: cryptographically random value for uniqueness
        - redirect_to: optional URL to redirect to after authentication
        - exp: expiration timestamp

        :param redirect_to: Optional URL to redirect to after successful authentication
        :return: Signed JWT string to use as the state parameter
        """
        settings = get_settings()
        now = datetime.now(timezone.utc)

        payload = {
            'nonce': token_urlsafe(16),
            'iat': now,
            'exp': now + timedelta(minutes=STATE_EXPIRATION_MINUTES),
        }

        if redirect_to:
            payload['redirect_to'] = redirect_to

        return jwt.encode(payload, settings.jwt_secret, algorithm=JWT_ALGO)

    def verify_state(self, state: str) -> dict:
        """
        Verify and decode the state JWT.

        :param state: The state JWT string from the callback
        :return: Decoded payload containing nonce and optional redirect_to
        :raises jwt.ExpiredSignatureError: If the state has expired
        :raises jwt.InvalidTokenError: If the state is invalid
        """
        settings = get_settings()
        return jwt.decode(state, settings.jwt_secret, algorithms=[JWT_ALGO])

    def get_authorization_params(self, state: str) -> dict[str, str]:
        """
        Build the query parameters for the authorization request per OpenID Connect Core 1.0 Section 3.1.2.1.

        Required parameters:
        - scope: Must contain 'openid', may contain additional scopes (from SSO_SCOPES setting)
        - response_type: 'code' for Authorization Code Flow
        - client_id: OAuth 2.0 Client Identifier (from SSO_CLIENT_ID setting)
        - redirect_uri: Redirection URI for the response (from SSO_REDIRECT_URI setting)

        Recommended parameters:
        - state: Opaque value for CSRF protection (signed JWT containing nonce and optional redirect URL)

        Override this method to add optional parameters like nonce, display, prompt, max_age, etc.
        """
        settings = get_settings()
        return {
            'scope': settings.sso_scopes,
            'response_type': 'code',
            'client_id': settings.sso_client_id,
            'redirect_uri': settings.sso_redirect_uri,
            'state': state,
        }

    def get_authorization_url(self, state: str) -> str:
        """
        Build the full authorization URL using the discovery document's authorization_endpoint.
        """
        params = self.get_authorization_params(state)
        return f'{self.discovery.authorization_endpoint}?{urlencode(params)}'

    def get_token(self, body: SessionRequestBody) -> TokenResponse | RedirectResponse:
        """
        Get token from the IDP - redirect to the authorization endpoint.

        Generates a signed JWT state parameter containing a nonce for CSRF protection
        and optionally the redirect URL for post-authentication navigation.

        :param body: Request body, may contain redirect_to for post-auth navigation
        """
        state = self.generate_state(redirect_to=body.redirect_to)
        return RedirectResponse(redirect_uri=self.get_authorization_url(state))

    def extract_user_data_from_id_token(self, claims: IdTokenClaims) -> UserData:
        """
        Extract user data from ID token claims.

        Override this method in subclasses to handle provider-specific claim structures.
        The default implementation uses standard OIDC claims, with support for the
        non-standard 'identity' claim.

        :param claims: Decoded ID token claims
        :return: UserData extracted from the claims
        """
        # Check for non-standard 'identity' claim (Causalens IDP)
        # This is a nested object with id, name, email fields
        identity_claim = getattr(claims, 'identity', None)
        if isinstance(identity_claim, dict):
            identity_id = identity_claim.get('id') or claims.sub
            identity_name = identity_claim.get('name')
            identity_email = identity_claim.get('email') or claims.email
        else:
            # Standard OIDC: use 'sub' as the identity ID
            identity_id = claims.sub
            identity_email = claims.email
            identity_name = None

        # Fall back to standard claims for name if not set
        if not identity_name:
            identity_name = (
                claims.name
                or claims.preferred_username
                or claims.nickname
                or (
                    f'{claims.given_name} {claims.family_name}'.strip()
                    if claims.given_name or claims.family_name
                    else None
                )
                or identity_email
                or claims.sub
            )

        return UserData(
            identity_id=identity_id,
            identity_name=identity_name,
            identity_email=identity_email,
            groups=claims.groups,
        )

    def verify_token(self, token: str) -> TokenData:
        """
        Verify a session token.

        Handles both:
        1. Dara-issued session tokens (wrapped tokens signed with jwt_secret)
        2. Raw IDP tokens (ID tokens signed by the OIDC provider)

        Sets SESSION_ID, USER, and ID_TOKEN context variables.

        :param token: encoded JWT token (either Dara session token or raw IDP token)
        :return: TokenData for the verified token
        """
        settings = get_settings()

        # First, decode without verification to check the issuer
        try:
            unverified = jwt.decode(token, options={'verify_signature': False})
        except jwt.DecodeError as e:
            raise AuthError(code=401, detail=INVALID_TOKEN_ERROR) from e

        # Check if this is a raw IDP token (issuer matches the configured SSO issuer)
        if unverified.get('iss') == settings.sso_issuer_url:
            return self._verify_idp_token(token)
        else:
            return self._verify_dara_token(token)

    def _verify_idp_token(self, token: str) -> TokenData:
        """
        Verify a raw ID token from the IDP.

        :param token: Raw ID token JWT
        :return: TokenData extracted from the ID token
        """
        # Decode and verify the ID token signature using JWKS
        claims = decode_id_token(token)

        # Extract user data (can be overridden for provider-specific claim structures)
        user_data = self.extract_user_data_from_id_token(claims)

        # Verify user has access based on groups
        self._verify_user_access(user_data.groups or [])

        # Set context variables
        SESSION_ID.set(user_data.identity_id)
        USER.set(user_data)
        ID_TOKEN.set(token)

        # Return TokenData structure
        return TokenData(
            session_id=user_data.identity_id,
            exp=claims.exp,
            identity_id=user_data.identity_id,
            identity_name=user_data.identity_name,
            identity_email=user_data.identity_email,
            id_token=token,
            groups=user_data.groups,
        )

    def _verify_dara_token(self, token: str) -> TokenData:
        """
        Verify a Dara-issued session token.

        :param token: Dara session token JWT
        :return: TokenData from the decoded token
        """
        # Decode and verify with our jwt_secret
        token_data = decode_token(token)

        # Verify user has access based on groups
        self._verify_user_access(token_data.groups or [])

        # Set context variables
        SESSION_ID.set(token_data.session_id)
        USER.set(
            UserData(
                identity_id=token_data.identity_id,
                identity_name=token_data.identity_name,
                identity_email=token_data.identity_email,
                groups=token_data.groups,
            )
        )
        ID_TOKEN.set(token_data.id_token)

        return token_data

    def _verify_user_access(self, user_groups: list[str]) -> None:
        """
        Verify that the user has access based on their groups.

        :param user_groups: List of groups the user belongs to
        :raises HTTPException: If user doesn't have access
        """
        allowed_groups = set(self.allowed_groups.keys())
        user_group_set = set(user_groups)

        # Check if there's any intersection between allowed and user groups
        if not allowed_groups.intersection(user_group_set):
            dev_logger.error(
                'User group does not have access to this app',
                error=Exception('Unauthorized'),
                extra={'user_groups': user_groups, 'allowed_groups': list(allowed_groups)},
            )
            raise HTTPException(
                status_code=403,
                detail={'message': 'You are not authorized to access this application.', 'reason': 'unauthorized'},
            )

    def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
        """
        Create a new session token and refresh token from a refresh token.

        Note: the new issued session token should include the same session_id as the old token

        :param old_token: old session token data
        :param refresh_token: encoded refresh token
        :return: new session token, new refresh token
        """
        raise HTTPException(400, f'Auth config {self.__class__.__name__} does not support token refresh')

    def get_logout_url(self, token: str, verify_audience: bool):
        issuer_url = get_settings().sso_issuer_url
        url = f'{issuer_url}/logout?id_token_hint={token}'

        # Only add client_id if we are verifying audience
        if verify_audience:
            client_id = get_settings().sso_client_id
            url += f'&client_id={client_id}'

        return url

    def revoke_token(self, token: str, response: Response) -> SuccessResponse | RedirectResponse:
        """
        Revoke the token and redirect to the logout url

        :param token: token to revoke
        :param response: FastAPI response object
        """
        settings = get_settings()

        # Clean up the refresh token cookie and redirect to the logout url
        response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME)

        # DO NOT TRUST! Decode the token without verifying to check who issued it
        do_not_trust_me = jwt.decode(token, options={'verify_signature': False})

        if do_not_trust_me.get('iss', None) == settings.sso_issuer_url:
            # IDP issued token, use directly
            id_token = token
        else:
            # Dara issued token, use the id_token from the payload
            id_token: str = do_not_trust_me.get('id_token', None)  # type: ignore

        return RedirectResponse(redirect_uri=self.get_logout_url(id_token, settings.sso_verify_audience))
