from typing import ClassVar
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import HTTPException, Response
from jwt import PyJWKClient
from pydantic import Field
from pydantic.config import ConfigDict

from dara.core.definitions import ApiRoute
from dara.core.internal.settings import get_settings
from dara.core.logging import dev_logger

from ..base import AuthComponent, AuthComponentConfig, BaseAuthConfig
from ..definitions import (
    ID_TOKEN,
    INVALID_TOKEN_ERROR,
    JWT_ALGO,
    SESSION_ID,
    UNAUTHORIZED_ERROR,
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
from ..utils import decode_token, sign_jwt
from .definitions import (
    JWK_CLIENT_REGISTRY_KEY,
    REFRESH_TOKEN_COOKIE_NAME,
    IdTokenClaims,
    OIDCDiscoveryMetadata,
    StateObject,
)
from .routes import sso_callback
from .settings import get_oidc_settings
from .utils import decode_id_token, get_token_from_idp

OIDCAuthLogin = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthLogin')

OIDCAuthLogout = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthLogout')

OIDCAuthSSOCallback = AuthComponent(js_module='@darajs/core', py_module='dara.core', js_name='OIDCAuthSSOCallback')


class OIDCAuthConfig(BaseAuthConfig):
    """
    Generic OIDC auth config.

    This config requires the following ENV variables to be set:
    - SSO_ISSUER_URL - URL of the identity provider issuer; should expose a `SSO_ISSUER_URL/.well-known/openid-configuration` endpoint for discovery
    - SSO_CLIENT_ID - client_id generated for the application by the identity provider
    - SSO_CLIENT_SECRET - client_secret generated for the application by the identity provider
    - SSO_REDIRECT_URI - URL that identity provider should redirect back to, in most cases https://deployed-app-url/sso-callback
    - SSO_GROUPS - comma separated list of allowed SSO groups

    In addition, the following ENV variables can be set:
    - SSO_ALLOWED_IDENTITY_ID - if set, only the user with matching identity_id will be allowed to access the app
    - SSO_VERIFY_AUDIENCE - if set, the ID token will be verified against the configured audience, by default `sso_client_id`
    - SSO_EXTRA_AUDIENCE - if set, extra audiences to verify against the ID token in addition to `sso_client_id`
    - SSO_SCOPES - space-separated list of scopes to request from the identity provider, defaults to `openid`
    - SSO_JWT_ALGO - algorithm to use for verifying IDP-provided JWTs, defaults to `ES256`
    - SSO_USE_USERINFO - if set to `true`, fetch additional claims from the userinfo endpoint when an access token is available
    """

    # NOTE: the config follows OIDC specification, but makes a few concessions
    # to be more lenient with the internal IDP. These are marked with CONCESSION comments.

    required_routes: ClassVar[list[ApiRoute]] = [sso_callback]

    component_config: ClassVar[AuthComponentConfig] = AuthComponentConfig(
        login=OIDCAuthLogin,
        logout=OIDCAuthLogout,
        extra={
            'sso-callback': OIDCAuthSSOCallback,
        },
    )

    client: httpx.AsyncClient = Field(default_factory=httpx.AsyncClient, exclude=True)

    model_config = ConfigDict(arbitrary_types_allowed=True)

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
        env_groups = get_oidc_settings().groups
        parsed_groups = env_groups.split(',')
        return {group.strip(): UserGroup(name=group.strip()) for group in parsed_groups}

    def get_discovery_url(self) -> str:
        issuer_url = get_oidc_settings().issuer_url
        return f'{issuer_url}/.well-known/openid-configuration'

    async def startup_hook(self) -> None:
        await self.client.__aenter__()

        # 1. Enforce SSO env vars are set - this will run validation and raise if not set
        get_settings.cache_clear()
        get_settings()
        get_oidc_settings.cache_clear()
        oidc_settings = get_oidc_settings()

        # 2. Fetch OIDC discovery document
        discovery_url = self.get_discovery_url()
        dev_logger.info(f'Fetching OIDC discovery document from {discovery_url}...')
        try:
            response = await self.client.get(discovery_url)
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

        dev_logger.info(f'Successfully fetched OIDC discovery document from {discovery_url}')

        # 3. Register a PyJWKClient instance bound to the jwks_uri from discovery
        from dara.core.internal.registries import utils_registry

        py_jwk_client = PyJWKClient(self.discovery.jwks_uri, lifespan=oidc_settings.jwks_lifespan)
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
        payload = StateObject(redirect_to=redirect_to)
        return jwt.encode(payload.model_dump(), get_settings().jwt_secret, algorithm=JWT_ALGO)

    def verify_state(self, state: str) -> StateObject:
        """
        Verify and decode the state JWT.

        :param state: The state JWT string from the callback
        :return: Decoded payload containing nonce and optional redirect_to
        :raises jwt.ExpiredSignatureError: If the state has expired
        :raises jwt.InvalidTokenError: If the state is invalid
        """
        return StateObject.model_validate(jwt.decode(state, get_settings().jwt_secret, algorithms=[JWT_ALGO]))

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
        oidc_settings = get_oidc_settings()
        return {
            'scope': oidc_settings.scopes,
            'response_type': 'code',
            'client_id': oidc_settings.client_id,
            'redirect_uri': oidc_settings.redirect_uri,
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

    async def fetch_userinfo(self, access_token: str) -> dict | None:
        """
        Fetch user information from the OIDC userinfo endpoint.

        Per OpenID Connect Core 1.0 Section 5.3, the userinfo endpoint returns claims
        about the authenticated user. This is useful when the ID token doesn't contain
        all required claims.

        :param access_token: The access token to authenticate the request
        :return: Dictionary of userinfo claims, or None if the request fails
        """
        userinfo_endpoint = self.discovery.userinfo_endpoint
        if not userinfo_endpoint:
            dev_logger.warning('Userinfo endpoint not available in OIDC discovery')
            return None

        try:
            response = await self.client.get(
                userinfo_endpoint,
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=10,
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            dev_logger.warning(
                f'Failed to fetch userinfo: HTTP {e.response.status_code}',
            )
            return None
        except httpx.RequestError as e:
            dev_logger.warning(f'Failed to fetch userinfo: {e}')
            return None

    def extract_user_data(self, claims: IdTokenClaims, userinfo: dict | None = None) -> UserData:
        """
        Extract user data from ID token claims and optional userinfo response.

        Override this method in subclasses to handle provider-specific claim structures.
        The default implementation uses standard OIDC claims, with support for the
        non-standard 'identity' claim. When userinfo is provided and SSO_USE_USERINFO
        is enabled, userinfo claims take precedence over ID token claims.

        :param claims: Decoded ID token claims
        :param userinfo: Optional userinfo response from the userinfo endpoint
        :return: UserData extracted from the claims
        """
        oidc_settings = get_oidc_settings()

        # When userinfo is provided and use_userinfo is enabled, prefer userinfo claims
        if userinfo and oidc_settings.use_userinfo:
            # userinfo 'sub' must match id_token 'sub' per OIDC spec
            identity_id = userinfo.get('sub') or claims.sub
            identity_email = userinfo.get('email') or claims.email
            identity_name = (
                userinfo.get('name')
                or userinfo.get('preferred_username')
                or userinfo.get('nickname')
                or (
                    f'{userinfo.get("given_name", "")} {userinfo.get("family_name", "")}'.strip()
                    if userinfo.get('given_name') or userinfo.get('family_name')
                    else None
                )
            )
            groups = userinfo.get('groups') or claims.groups
        else:
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
            groups = claims.groups

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
            groups=groups,
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
        # First, decode without verification to check the issuer
        try:
            unverified = jwt.decode(token, options={'verify_signature': False})
        except jwt.DecodeError as e:
            raise AuthError(code=401, detail=INVALID_TOKEN_ERROR) from e

        # Check if this is a raw IDP token (issuer matches the configured SSO issuer)
        if unverified.get('iss') == get_oidc_settings().issuer_url:
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
        user_data = self.extract_user_data(claims)

        # Verify user has access based on groups
        self.verify_user_access(user_data)

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

        user_data = UserData.from_token_data(token_data)

        # Verify user has access based on groups
        self.verify_user_access(user_data)

        # Set context variables
        SESSION_ID.set(token_data.session_id)
        USER.set(user_data)
        ID_TOKEN.set(token_data.id_token)

        return token_data

    def verify_user_access(self, user_data: UserData) -> None:
        """
        Verify that the user has access based on their groups.

        :param user_groups: List of groups the user belongs to
        :raises HTTPException: If user doesn't have access
        """
        # Identity verification enabled
        if (allowed_identity_id := get_oidc_settings().allowed_identity_id) is not None:
            identity_id = user_data.identity_id
            if identity_id != allowed_identity_id:
                dev_logger.error(
                    'User identity does not have access to this app',
                    error=Exception(UNAUTHORIZED_ERROR),
                    extra={
                        'identity_id': identity_id,
                    },
                )
                raise HTTPException(status_code=403, detail=UNAUTHORIZED_ERROR)

        allowed_groups = set(self.allowed_groups.keys())
        user_group_set = set(user_data.groups or [])

        # Check if there's any intersection between allowed and user groups
        if not allowed_groups.intersection(user_group_set):
            dev_logger.error(
                'User group does not have access to this app',
                error=Exception('Unauthorized'),
                extra={'user_groups': user_data.groups or [], 'allowed_groups': list(allowed_groups)},
            )
            raise HTTPException(status_code=403, detail=UNAUTHORIZED_ERROR)

    def get_token_endpoint(self) -> str:
        """
        Get the token endpoint URL from discovery.

        :return: Token endpoint URL
        :raises RuntimeError: If token_endpoint is not available in discovery
        """
        return self.discovery.token_endpoint

    async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
        """
        Refresh the session using an OIDC refresh token.

        Per RFC 6749 Section 6, sends a refresh token grant to the token endpoint
        to obtain new access/id tokens.

        Note: the new issued session token includes the same session_id as the old token
        to maintain session continuity.

        :param old_token: Old session token data (used to preserve session_id)
        :param refresh_token: OIDC refresh token
        :return: Tuple of (new_session_token, new_refresh_token)
        :raises HTTPException: If the refresh fails
        """
        oidc_settings = get_oidc_settings()

        # Request new tokens from the IDP
        oidc_tokens = await get_token_from_idp(
            self,
            {
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
            },
        )

        # Ensure we got an id_token back
        if not oidc_tokens.id_token:
            raise HTTPException(status_code=401, detail=INVALID_TOKEN_ERROR)

        # Decode and verify the new ID token
        claims = decode_id_token(oidc_tokens.id_token)

        # Fetch userinfo if enabled and we have an access token
        userinfo = None
        if oidc_settings.use_userinfo and oidc_tokens.access_token:
            userinfo = await self.fetch_userinfo(oidc_tokens.access_token)

        # Extract user data from claims
        user_data = self.extract_user_data(claims, userinfo=userinfo)

        # Verify user still has access
        self.verify_user_access(user_data)

        # Create a new Dara session token, preserving the original session_id
        new_session_token = sign_jwt(
            identity_id=user_data.identity_id,
            identity_name=user_data.identity_name,
            identity_email=user_data.identity_email,
            groups=user_data.groups or [],
            id_token=oidc_tokens.id_token,
            exp=int(claims.exp),
            session_id=old_token.session_id,
        )

        # Return new session token and refresh token (or the old one if not rotated)
        new_refresh_token = oidc_tokens.refresh_token or refresh_token

        return new_session_token, new_refresh_token

    def get_end_session_endpoint(self) -> str | None:
        """
        Get the end session endpoint URL.

        Uses the end_session_endpoint from OIDC discovery if available.

        Override this method in subclasses to customize the logout endpoint.
        """
        return self.discovery.end_session_endpoint

    def get_logout_params(self, id_token: str | None) -> dict[str, str]:
        """
        Build the query parameters for the logout/end session request.

        Per OpenID Connect RP-Initiated Logout 1.0:
        - id_token_hint: RECOMMENDED. ID Token previously issued by the OP, used as a hint
          about the End-User's current authenticated session.
        - client_id: OPTIONAL. OAuth 2.0 Client Identifier. Required if id_token_hint is not provided.
        - post_logout_redirect_uri: OPTIONAL. URI to redirect to after logout.
        - state: OPTIONAL. Opaque value for maintaining state.

        Override this method to add custom parameters like post_logout_redirect_uri.

        :param id_token: The ID token to use as a hint, or None if not available
        :return: Dictionary of query parameters
        """
        oidc_settings = get_oidc_settings()
        params: dict[str, str] = {}

        if id_token:
            params['id_token_hint'] = id_token

        # Include client_id if we're verifying audience, or if no id_token_hint is provided
        if oidc_settings.verify_audience or not id_token:
            params['client_id'] = oidc_settings.client_id

        return params

    def get_logout_url(self, id_token: str | None = None) -> str | None:
        """
        Build the full logout URL for RP-Initiated Logout.

        :param id_token: The ID token to use as a hint, or None if not available
        :return: Full logout URL with query parameters
        """
        endpoint = self.get_end_session_endpoint()

        if not endpoint:
            return None

        params = self.get_logout_params(id_token)

        if params:
            return f'{endpoint}?{urlencode(params)}'
        return endpoint

    def revoke_token(self, token: str, response: Response) -> SuccessResponse | RedirectResponse:
        """
        Revoke the session and redirect to the OP's end session endpoint.

        Per OpenID Connect RP-Initiated Logout 1.0, this initiates logout at the OP
        by redirecting to the end_session_endpoint with the id_token_hint.

        :param token: Session token to revoke (Dara-issued or raw IDP token)
        :param response: FastAPI response object
        :return: RedirectResponse to the logout URL
        """
        oidc_settings = get_oidc_settings()

        # Clean up the refresh token cookie
        response.delete_cookie(REFRESH_TOKEN_COOKIE_NAME)

        # Extract the ID token to use as a hint
        id_token: str | None = None

        try:
            # Decode without verification to check the issuer
            unverified = jwt.decode(token, options={'verify_signature': False})

            # Raw IDP token -> use directly as the id_token_hint
            # Dara-issued token -> extract the embedded id_token
            id_token = token if unverified.get('iss') == oidc_settings.issuer_url else unverified.get('id_token')
        except jwt.DecodeError:
            # If we can't decode the token, proceed without id_token_hint
            dev_logger.warning('Failed to decode token for logout, proceeding without id_token_hint')

        logout_url = self.get_logout_url(id_token)

        # IDP doesn't support RP-Initiated Logout, so treat logout as success
        if not logout_url:
            return {'success': True}

        return RedirectResponse(redirect_uri=logout_url)
