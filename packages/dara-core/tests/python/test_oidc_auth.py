import contextlib
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from unittest import mock
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import httpx
import jwt
import pytest
import respx
from async_asgi_testclient import TestClient as AsyncClient
from fastapi import HTTPException
from jwt import PyJWK, PyJWKClient

from dara.core.auth.definitions import (
    BAD_REQUEST_ERROR,
    EXPIRED_TOKEN_ERROR,
    INVALID_TOKEN_ERROR,
    JWT_ALGO,
    OTHER_AUTH_ERROR,
    SESSION_TOKEN_COOKIE_NAME,
    UNAUTHORIZED_ERROR,
    AuthError,
    TokenData,
)
from dara.core.auth.oidc.config import OIDCAuthConfig
from dara.core.auth.oidc.definitions import (
    ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY,
    JWK_CLIENT_REGISTRY_KEY,
    OIDC_LOGIN_SESSION_COOKIE_NAME,
    IdTokenClaims,
    OIDCDiscoveryMetadata,
)
from dara.core.auth.oidc.settings import get_oidc_settings
from dara.core.auth.oidc.transaction_store import oidc_transaction_store
from dara.core.auth.oidc.utils import decode_id_token
from dara.core.auth.session import verify_auth_token
from dara.core.auth.session_store import AuthSession, AuthSessionStore, ExpiredAuthSession, auth_session_store
from dara.core.configuration import ConfigurationBuilder
from dara.core.internal.registries import utils_registry
from dara.core.internal.settings import get_settings
from dara.core.main import _start_application

from tests.python.utils import _async_ws_connect

os.environ['DARA_DOCKER_MODE'] = 'TRUE'

pytestmark = pytest.mark.anyio

TEST_JWT_SECRET = 'd6446c35450e31c4d0b48351c0423bf9'
TEST_SSO_ISSUER_URL = 'http://test-identity-provider.com'
TEST_SSO_CLIENT_ID = 'CLIENT_ID'
TEST_SSO_CLIENT_SECRET = 'CLIENT_SECRET'
TEST_SSO_REDIRECT_URI = 'http://localhost:8000/sso-callback'
TEST_SSO_GROUPS = 'dev,test'

# Object containing env values from .env.test
ENV_OVERRIDE = {
    'JWT_SECRET': TEST_JWT_SECRET,
    'SSO_ISSUER_URL': TEST_SSO_ISSUER_URL,
    'SSO_CLIENT_ID': TEST_SSO_CLIENT_ID,
    'SSO_CLIENT_SECRET': TEST_SSO_CLIENT_SECRET,
    'SSO_REDIRECT_URI': TEST_SSO_REDIRECT_URI,
    'SSO_GROUPS': TEST_SSO_GROUPS,
}

# Sample RS256 key
MOCK_JWK = {
    'alg': 'RS256',
    'kty': 'RSA',
    'n': '0ajtf9xvPKgC24P8d8AOrE91fymB2flnQqgC4U8gHlXPY3NroZsd-0OWG08BjQFYzDPPq9hhDR-XshPCPns4hbRTdE8eccirBUdIWm6kN9mIPh9CP6I2G1tQsgZRijBjrYnj6EbFHWAfwTgx0K6bcvKyFTk7eG7QrCy-Op6GkHbo3WMG3eDTTtoI9Xy4KwBeBrQVz_IIXApxPejEQwYnsNgAPcTRDj_Sxr1dho-MW23JD4Szml0PWPMt_MI6z7jCbqAqRIiLxWTm9DStqCbSSw27_fnjrGgA9ttBfwzcFnSFvFk9esCzJHcGq8zjAHXnjDDd3gyYXxRfXWYqV3Dljw',
    'e': 'AQAB',
    'd': 'ZjW57tr6ebIYjoaWNpTxMkycZc1I6ghdsE-y8788070WmQ-kOYkjASLuU0rdYS32abqac9bNXXX44I4kZIxyvi_ufWWy3FqtESoymi-VLEsG0e4wQFBmm0iVmuxcpQc5GNl_u3WA0_TQFkS8eFUfIFczvQgFN42iekVnybENve_v1Jq9veffcDAhvlwo_1s4Bl41bFZmzoJDEaW8pWjJ-2-4cj3qL0G1ek9hBg2L4e8QUiqdWGF--_D4jsc1o2Lo5YDMxhQZLGTI821NOE_Le37vTsaxUL1ANPR2voOuhXD7wJpbRmf6OM-fInKzvDSgKqwl6azr0I9TUytvlr3T3Q',
    'p': '-Q-SDSDXRysHiSk4XSJ76bLiclDaIc6jkO8Q27D_0b574WxVkESR_fhiky5D5F4akBnCq0zS2vUztQX0IvWbMerZ5p_De8BO5EKeDtUSc30pRJWuF02I-HaMtuh_BuRSW_d2a4zHFSn4rrqGrXJ9mnwxw3C1oaDBXmNmXgfdF_M',
    'q': '14BUVw9-l-fwb1wrvvNpDVcXFwW8OQb4GtIwL3kfOU_NO1jxCNN8w5MhXXg5sT-R73hdVFS2YzAgeDeHcDb2LRQZxRGgaB50UAWkmvUgC-ELF8yAkaFkRJUWExyaJ-zndwjJzje2omYvSox9Duwen12xTcP6TkH5kU3q5SDrnvU',
    'dp': 'zVWf9MDhm2QHV3araGV4wWhgtxyfagXh5iiivm0Dy9l-apAVTtapgjgYlP0srgdDYRBL5Ux1_lzvn0vkRjo1FAdqVG_dC5a1tAyUIOhbyOkkb83zdHTQ-v9J7bZqm7T7jaTMdcjfjTxIMU3IoRDmKso_gMDYjgNpyLase9OB3S8',
    'dq': 'MIcfdvNwSHjcdddFqpxZnb1s36xU9GqTWEbYvvgBhgBocOLYdGpbgBcTvl6ibz2neUubiLAC2lcuGKQ4hZZ63S_Xlb8gZhHlk1eR96sXalVlEBjnIuQ7Fg6Uh_064Z7BiNabyypUoEFuiNUWHFQjmTOaB68IILNOpd_r82j0Zjk',
    'qi': '4XlwiY0hJuqk3zIWdktPC_lJCCviDmckoui6F4rZqt8khU8W3zyG3si9SrUfucToZoOIOw-KndRxe1RM2wBelBJa6-CD4j_VLg72QYOX9dNFFTlGYGn5bT8iUx71q7O1G2MlKEDBNqZfe8DEIQ9nAMEPgqBaVS5Qp7NHPhP78zQ',
    'kid': 'test-rs256-key',
}
MOCK_JWKS_DATA = {'keys': [{key: MOCK_JWK[key] for key in ('alg', 'kty', 'n', 'e', 'kid')}]}
MOCK_RSA_JWKS_DATA_WITHOUT_ALG = {'keys': [{key: MOCK_JWK[key] for key in ('kty', 'n', 'e', 'kid')}]}

# Sample ES256 key used by the internal IDP compatibility tests
MOCK_ES256_JWK = {
    'alg': 'ES256',
    'kty': 'EC',
    'crv': 'P-256',
    'x': 'SVqB4JcUD6lsfvqMr-OKUNUphdNn64Eay60978ZlL74',
    'y': 'lf0u0pMj4lGAzZix5u4Cm5CMQIgMNpkwy163wtKYVKI',
    'd': '0g5vAEKzugrXaRbgKG0Tj2qJ5lMP4Bezds1_sTybkfk',
    'kid': 'test-es256-key',
}
MOCK_ES256_JWKS_DATA = {'keys': [{key: MOCK_ES256_JWK[key] for key in ('alg', 'kty', 'crv', 'x', 'y', 'kid')}]}

MOCK_ID_TOKEN = {
    'sub': 'uuid',
    'iat': int((datetime.now(tz=timezone.utc)).timestamp()),
    'identity': {'id': 'uuid', 'name': 'Joe', 'email': 'joe@causalens.com'},
    'persona': {'id': 'uuid', 'description': 'Joe (engineer)'},
    'exp': int((datetime.now(tz=timezone.utc) + timedelta(hours=2)).timestamp()),
    'groups': ['dev'],
    'iss': get_oidc_settings().issuer_url,
}

MOCK_REFRESH_TOKEN = {'sub': str(uuid4()), 'session_id': str(uuid4()), 'aud': str(uuid4()), 'jti': str(uuid4())}


MOCK_ACCESS_TOKEN = {'client_id': 'uid', 'scope': 'openid'}

MOCK_DARA_TOKEN_DATA = {
    'session_id': 'session_foo',
    'identity_id': 'test_user',
    'identity_name': 'test_user',
    'groups': [],
    'exp': datetime.now(tz=timezone.utc) + timedelta(days=1),
}

MOCK_DARA_TOKEN = jwt.encode(
    MOCK_DARA_TOKEN_DATA,
    TEST_JWT_SECRET,
    algorithm=JWT_ALGO,
)


@contextlib.contextmanager
def mocked_urllib(data):
    """
    Mock the `urllib.request.urlopen` method.

    PyJWKClient uses `urllib` under the hood so we need to mock that for JWKS endpoints
    """
    with mock.patch('urllib.request.urlopen') as urlopen_mock:
        response = mock.Mock()
        response.__enter__ = mock.Mock(return_value=response)
        response.__exit__ = mock.Mock()
        response.read.side_effect = [json.dumps(data)]
        urlopen_mock.return_value = response
        yield urlopen_mock


MOCK_DISCOVERY = OIDCDiscoveryMetadata(
    issuer=TEST_SSO_ISSUER_URL,
    authorization_endpoint='http://test-identity-provider.com/api/authentication/authenticate',
    token_endpoint='http://test-identity-provider.com/api/authentication/token',
    jwks_uri='http://test-identity-provider.com/api/authentication/keys',
    registration_endpoint='http://test-identity-provider.com/api/authentication/register',
    response_types_supported=['code', 'id_token', 'token id_token'],
    token_endpoint_auth_methods_supported=['client_secret_post', 'client_secret_basic'],
    id_token_signing_alg_values_supported=['RS256'],
    end_session_endpoint='http://test-identity-provider.com/api/authentication/logout',
)


def make_config():
    return OIDCAuthConfig()


@pytest.fixture(autouse=True)
def mock_discovery():
    with respx.mock:
        env_issuer_url = os.environ.get('SSO_ISSUER_URL', '')
        env_discovery_url = f'{env_issuer_url}/.well-known/openid-configuration'
        respx.get(env_discovery_url).mock(
            return_value=httpx.Response(status_code=200, json=MOCK_DISCOVERY.model_dump())
        )
        yield


@pytest.fixture(autouse=True)
async def clear_auth_session_store():
    await auth_session_store.clear()
    yield
    await auth_session_store.clear()


async def get_stored_auth_session(session_token: str) -> AuthSession:
    stored_session = await auth_session_store.get(session_token)
    assert stored_session is not None
    return stored_session


def get_cookie_max_age(set_cookie: str) -> int:
    for part in set_cookie.split(';'):
        key, _, value = part.strip().partition('=')
        if key.lower() == 'max-age':
            return int(value)
    raise AssertionError(f'Max-Age not found in Set-Cookie header: {set_cookie}')


async def create_mock_dara_session_token(refresh_token: str = 'mock-refresh-token') -> str:
    token_data = TokenData(
        **{
            **MOCK_DARA_TOKEN_DATA,
            'exp': datetime.now(tz=timezone.utc) - timedelta(seconds=10),
        }
    )
    raw_token = jwt.encode(token_data.model_dump(), ENV_OVERRIDE['JWT_SECRET'], algorithm=JWT_ALGO)
    return await auth_session_store.create(
        raw_token,
        token_data,
        refresh_token=refresh_token,
    )


def get_log_content(caplog: pytest.LogCaptureFixture, title: str) -> dict:
    for record in reversed(caplog.records):
        if isinstance(record.msg, dict) and record.msg.get('title') == title:
            content = getattr(record, 'content', None)
            assert isinstance(content, dict)
            return content
    raise AssertionError(f'Log record not found: {title}')


@pytest.fixture(autouse=True)
def clear_oidc_transaction_store():
    oidc_transaction_store.clear()
    yield
    oidc_transaction_store.clear()


async def test_config_parses_groups():
    """
    Test that OIDCAuthConfig parses groups correctly
    """
    sso_config = make_config()
    assert len(sso_config.allowed_groups) == 2
    assert 'dev' in sso_config.allowed_groups
    assert 'test' in sso_config.allowed_groups


async def test_startup_hook_rejects_discovery_issuer_mismatch():
    auth_config = make_config()
    mismatched_discovery = MOCK_DISCOVERY.model_copy(update={'issuer': 'http://wrong-issuer.com'})

    with mock.patch.object(
        auth_config.client,
        'get',
        mock.AsyncMock(
            return_value=httpx.Response(
                status_code=200,
                json=mismatched_discovery.model_dump(),
                request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
            )
        ),
    ):
        with pytest.raises(RuntimeError, match='OIDC discovery issuer mismatch'):
            await auth_config.startup_hook()

    await auth_config.client.aclose()


async def test_startup_hook_uses_discovered_id_token_signing_algs_when_unconfigured():
    auth_config = make_config()
    discovery = MOCK_DISCOVERY.model_copy(update={'id_token_signing_alg_values_supported': ['ES256', 'PS256']})

    with mock.patch.object(
        auth_config.client,
        'get',
        mock.AsyncMock(
            return_value=httpx.Response(
                status_code=200,
                json=discovery.model_dump(),
                request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
            )
        ),
    ):
        cleanup = await auth_config.startup_hook()

    assert utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY) == ['ES256', 'PS256']

    await cleanup()


async def test_startup_hook_filters_unsupported_discovered_id_token_signing_algs():
    auth_config = make_config()
    discovery = MOCK_DISCOVERY.model_copy(update={'id_token_signing_alg_values_supported': ['none', 'HS256', 'ES256']})

    with mock.patch.object(
        auth_config.client,
        'get',
        mock.AsyncMock(
            return_value=httpx.Response(
                status_code=200,
                json=discovery.model_dump(),
                request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
            )
        ),
    ):
        cleanup = await auth_config.startup_hook()

    assert utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY) == ['ES256']

    await cleanup()


async def test_startup_hook_falls_back_to_rs256_when_discovery_omits_id_token_signing_algs():
    auth_config = make_config()
    discovery_data = MOCK_DISCOVERY.model_dump()
    discovery_data.pop('id_token_signing_alg_values_supported')

    with mock.patch.object(
        auth_config.client,
        'get',
        mock.AsyncMock(
            return_value=httpx.Response(
                status_code=200,
                json=discovery_data,
                request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
            )
        ),
    ):
        cleanup = await auth_config.startup_hook()

    assert utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY) == ['RS256']

    await cleanup()


async def test_startup_hook_warns_when_falling_back_after_discovery_has_no_jwks_verifiable_algs(
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.WARNING, logger='dara.dev')
    auth_config = make_config()
    discovery = MOCK_DISCOVERY.model_copy(update={'id_token_signing_alg_values_supported': ['none', 'HS256']})

    with mock.patch.object(
        auth_config.client,
        'get',
        mock.AsyncMock(
            return_value=httpx.Response(
                status_code=200,
                json=discovery.model_dump(),
                request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
            )
        ),
    ):
        cleanup = await auth_config.startup_hook()

    assert utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY) == ['RS256']
    log_content = get_log_content(
        caplog, 'OIDC discovery metadata does not advertise any JWKS-verifiable ID token signing algorithms'
    )
    assert log_content == {'fallback': 'RS256', 'supported': ['none', 'HS256']}

    await cleanup()


async def test_startup_hook_accepts_new_id_token_signing_alg_override():
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_ID_TOKEN_SIGNED_RESPONSE_ALG': 'ES256'}):
        get_oidc_settings.cache_clear()
        auth_config = make_config()
        discovery = MOCK_DISCOVERY.model_copy(update={'id_token_signing_alg_values_supported': ['ES256']})

        with mock.patch.object(
            auth_config.client,
            'get',
            mock.AsyncMock(
                return_value=httpx.Response(
                    status_code=200,
                    json=discovery.model_dump(),
                    request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
                )
            ),
        ):
            cleanup = await auth_config.startup_hook()

        assert get_oidc_settings().fallback_id_token_signed_response_alg == 'ES256'
        assert utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY) == ['ES256']

        await cleanup()
        get_oidc_settings.cache_clear()


async def test_startup_hook_uses_new_id_token_signing_alg_when_discovery_omits_it():
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_ID_TOKEN_SIGNED_RESPONSE_ALG': 'ES256'}):
        get_oidc_settings.cache_clear()
        auth_config = make_config()

        with mock.patch.object(
            auth_config.client,
            'get',
            mock.AsyncMock(
                return_value=httpx.Response(
                    status_code=200,
                    json=MOCK_DISCOVERY.model_dump(),
                    request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
                )
            ),
        ):
            cleanup = await auth_config.startup_hook()

        assert utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY) == ['ES256']

        await cleanup()
        get_oidc_settings.cache_clear()


async def test_startup_hook_uses_new_id_token_signing_alg_over_legacy_jwt_algo():
    with mock.patch.dict(
        os.environ,
        {**os.environ, 'SSO_ID_TOKEN_SIGNED_RESPONSE_ALG': 'RS256', 'SSO_JWT_ALGO': 'ES256'},
    ):
        get_oidc_settings.cache_clear()
        auth_config = make_config()

        with mock.patch.object(
            auth_config.client,
            'get',
            mock.AsyncMock(
                return_value=httpx.Response(
                    status_code=200,
                    json=MOCK_DISCOVERY.model_dump(),
                    request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
                )
            ),
        ):
            cleanup = await auth_config.startup_hook()

        assert get_oidc_settings().fallback_id_token_signed_response_alg == 'RS256'
        assert utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY) == ['RS256']

        await cleanup()
        get_oidc_settings.cache_clear()


async def test_startup_hook_accepts_legacy_jwt_algo_override():
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_JWT_ALGO': 'ES256'}):
        get_oidc_settings.cache_clear()
        auth_config = make_config()
        discovery = MOCK_DISCOVERY.model_copy(update={'id_token_signing_alg_values_supported': ['ES256']})

        with mock.patch.object(
            auth_config.client,
            'get',
            mock.AsyncMock(
                return_value=httpx.Response(
                    status_code=200,
                    json=discovery.model_dump(),
                    request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
                )
            ),
        ):
            cleanup = await auth_config.startup_hook()

        assert get_oidc_settings().fallback_id_token_signed_response_alg == 'ES256'
        assert utils_registry.get(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY) == ['ES256']

        await cleanup()
        get_oidc_settings.cache_clear()


async def test_startup_hook_retries_transient_discovery_request_error():
    auth_config = make_config()
    discovery_response = httpx.Response(
        status_code=200,
        json=MOCK_DISCOVERY.model_dump(),
        request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
    )

    with (
        mock.patch.object(
            auth_config.client,
            'get',
            mock.AsyncMock(
                side_effect=[
                    httpx.ConnectError(
                        'connection failed',
                        request=httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration'),
                    ),
                    discovery_response,
                ]
            ),
        ) as get_mock,
        mock.patch('dara.core.auth.oidc.config.asyncio.sleep', mock.AsyncMock()) as sleep_mock,
    ):
        cleanup = await auth_config.startup_hook()

    assert get_mock.await_count == 2
    sleep_mock.assert_awaited_once()
    assert auth_config.discovery.issuer == MOCK_DISCOVERY.issuer

    await cleanup()


async def test_startup_hook_retries_retryable_discovery_status():
    auth_config = make_config()
    discovery_request = httpx.Request('GET', f'{TEST_SSO_ISSUER_URL}/.well-known/openid-configuration')
    discovery_response = httpx.Response(
        status_code=200,
        json=MOCK_DISCOVERY.model_dump(),
        request=discovery_request,
    )

    with (
        mock.patch.object(
            auth_config.client,
            'get',
            mock.AsyncMock(
                side_effect=[
                    httpx.Response(status_code=503, request=discovery_request),
                    discovery_response,
                ]
            ),
        ) as get_mock,
        mock.patch('dara.core.auth.oidc.config.asyncio.sleep', mock.AsyncMock()) as sleep_mock,
    ):
        cleanup = await auth_config.startup_hook()

    assert get_mock.await_count == 2
    sleep_mock.assert_awaited_once()
    assert auth_config.discovery.issuer == MOCK_DISCOVERY.issuer

    await cleanup()


def parse_url(url: str) -> tuple[str, dict]:
    """
    Parse redirect uri extracting state from it
    Returns (clean redirect_uri, query params)
    """
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    return parsed.path, query


async def start_oidc_login(client: AsyncClient, redirect_to: str | None = None) -> str:
    payload = {} if redirect_to is None else {'redirect_to': redirect_to}
    response = await client.post('/api/auth/session', json=payload)
    assert response.status_code == 200

    _, query = parse_url(response.json()['redirect_uri'])
    state = query['state'][0]

    login_session_id = response.cookies.get(OIDC_LOGIN_SESSION_COOKIE_NAME)
    assert login_session_id is not None

    return state


def make_mock_id_token(state: str, overrides: dict | None = None, jwk_data: dict | None = None) -> str:
    transaction = oidc_transaction_store.get(state)
    assert transaction is not None

    jwk_data = jwk_data or MOCK_JWK
    claims = {**MOCK_ID_TOKEN, 'nonce': transaction.nonce, **(overrides or {})}
    jwk = PyJWK(jwk_data)
    return jwt.encode(
        claims,
        jwk.key,
        algorithm=jwk_data['alg'],
        headers={'kid': jwk_data['kid']},
    )


@contextlib.contextmanager
def mock_registered_jwks_client(allowed_algs: list[str] | None = None):
    previous_registry = dict(utils_registry.get_all())
    utils_registry.set(ID_TOKEN_SIGNING_ALGS_REGISTRY_KEY, allowed_algs or [MOCK_JWK['alg']])
    utils_registry.set(JWK_CLIENT_REGISTRY_KEY, PyJWKClient(MOCK_DISCOVERY.jwks_uri))
    try:
        yield
    finally:
        utils_registry.replace(previous_registry, deepcopy=False)


def make_raw_mock_id_token(jwk_data: dict, overrides: dict | None = None, algorithm: str | None = None) -> str:
    claims = {**MOCK_ID_TOKEN, **(overrides or {})}
    jwk = PyJWK(jwk_data)
    algorithm = algorithm or jwk_data['alg']
    return jwt.encode(
        claims,
        jwk.key,
        algorithm=algorithm,
        headers={'kid': jwk_data['kid']},
    )


async def test_decode_id_token_accepts_es256_discovery_algorithm():
    with mock_registered_jwks_client(['ES256']), mocked_urllib(MOCK_ES256_JWKS_DATA):
        decoded = decode_id_token(make_raw_mock_id_token(MOCK_ES256_JWK))

    assert decoded.sub == MOCK_ID_TOKEN['sub']


async def test_decode_id_token_rejects_signing_key_algorithm_outside_resolved_policy():
    with mock_registered_jwks_client(['RS256']), mocked_urllib(MOCK_ES256_JWKS_DATA):
        with pytest.raises(jwt.InvalidAlgorithmError, match='signing algorithm is not allowed'):
            decode_id_token(make_raw_mock_id_token(MOCK_ES256_JWK))


async def test_decode_id_token_accepts_allowed_rsa_algorithm_when_jwk_omits_alg():
    with mock_registered_jwks_client(['PS256']), mocked_urllib(MOCK_RSA_JWKS_DATA_WITHOUT_ALG):
        decoded = decode_id_token(make_raw_mock_id_token(MOCK_JWK, algorithm='PS256'))

    assert decoded.sub == MOCK_ID_TOKEN['sub']


async def test_decode_id_token_rejects_explicit_jwk_algorithm_mismatch():
    with mock_registered_jwks_client(['RS256', 'PS256']), mocked_urllib(MOCK_JWKS_DATA):
        with pytest.raises(jwt.InvalidAlgorithmError, match='JWK alg RS256 does not match token alg PS256'):
            decode_id_token(make_raw_mock_id_token(MOCK_JWK, algorithm='PS256'))


async def test_session_no_state():
    """
    Check that /session returns redirect uri
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/session', json={})
        received_url, received_query = parse_url(response.json()['redirect_uri'])

        assert received_url == urlparse(auth_config.discovery.authorization_endpoint).path
        assert received_query['scope'] == [get_oidc_settings().scopes]
        assert received_query['response_type'] == ['code']
        assert received_query['client_id'] == [get_oidc_settings().client_id]
        assert received_query['redirect_uri'] == [get_oidc_settings().redirect_uri]

        received_state = received_query['state'][0]
        login_session_id = response.cookies.get(OIDC_LOGIN_SESSION_COOKIE_NAME)
        assert login_session_id is not None

        transaction = oidc_transaction_store.take(received_state)
        assert transaction is not None
        assert received_query['nonce'] == [transaction.nonce]
        assert transaction.login_session_id == login_session_id
        assert transaction.redirect_to is None


async def test_session_pkce_public_client_adds_code_challenge():
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_CLIENT_AUTH_MODE': 'pkce_public'}):
        get_oidc_settings.cache_clear()
        config = ConfigurationBuilder()

        auth_config = make_config()
        config.add_auth(auth_config)

        app = _start_application(config._to_configuration())

        async with AsyncClient(app) as client:
            response = await client.post('/api/auth/session', json={})
            assert response.status_code == 200

            _, received_query = parse_url(response.json()['redirect_uri'])
            received_state = received_query['state'][0]
            transaction = oidc_transaction_store.take(received_state)

            assert transaction is not None
            assert transaction.code_verifier is not None
            assert received_query['code_challenge'] == [auth_config.get_code_challenge(transaction.code_verifier)]
            assert received_query['code_challenge_method'] == ['S256']
            assert 'code_verifier' not in received_query

        get_oidc_settings.cache_clear()


async def test_session_with_state():
    """
    Check that /session returns redirect uri with state
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/session', json={'redirect_to': '/test'})
        received_url, received_query = parse_url(response.json()['redirect_uri'])

        assert received_url == urlparse(auth_config.discovery.authorization_endpoint).path
        received_state = received_query['state'][0]
        login_session_id = response.cookies.get(OIDC_LOGIN_SESSION_COOKIE_NAME)
        assert login_session_id is not None

        transaction = oidc_transaction_store.take(received_state)
        assert transaction is not None
        assert received_query['nonce'] == [transaction.nonce]
        assert transaction.login_session_id == login_session_id
        assert transaction.redirect_to == '/test'


@pytest.mark.parametrize('redirect_to', ['https://evil.com/phish', '//evil.com/phish', 'relative-path'])
async def test_session_rejects_invalid_redirect_to(redirect_to: str):
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/session', json={'redirect_to': redirect_to})
        assert response.status_code == 400
        assert response.json()['detail'] == BAD_REQUEST_ERROR('Invalid redirect_to parameter')


async def test_sso_callback_creates_valid_session_token():
    """
    Test that /sso-callback correctly builds up a JWT session token
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client, redirect_to='/post-auth')
            refresh_token = jwt.encode(
                {**MOCK_REFRESH_TOKEN, 'exp': int((datetime.now(tz=timezone.utc) + timedelta(days=7)).timestamp())},
                PyJWK(MOCK_JWK).key,
                algorithm=MOCK_JWK['alg'],
                headers={'kid': MOCK_JWK['kid']},
            )
            id_token = make_mock_id_token(state)
            mock_idp_response = {
                'id_token': id_token,
                'refresh_token': refresh_token,
            }

            token_route = respx.post(auth_config.discovery.token_endpoint)
            token_route.mock(return_value=httpx.Response(status_code=200, json=mock_idp_response))

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
            assert response.status_code == 200

            token_request = token_route.calls.last.request
            assert token_request.headers['Authorization'].startswith('Basic ')
            token_request_body = parse_qs(token_request.content.decode())
            assert token_request_body['grant_type'] == ['authorization_code']
            assert token_request_body['code'] == ['TEST']
            assert token_request_body['redirect_uri'] == [get_oidc_settings().redirect_uri]
            assert 'client_id' not in token_request_body
            assert 'code_verifier' not in token_request_body

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            assert response.json() == {'success': True, 'redirect_to': '/post-auth'}
            session_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
            set_cookies = response.headers.getall('set-cookie')
            session_cookie = next(
                cookie for cookie in set_cookies if cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}=')
            )
            login_session_cookie = next(
                cookie for cookie in set_cookies if cookie.startswith(f'{OIDC_LOGIN_SESSION_COOKIE_NAME}=')
            )
            assert login_session_cookie.startswith(f'{OIDC_LOGIN_SESSION_COOKIE_NAME}="";')
            assert get_cookie_max_age(session_cookie) > 6 * 24 * 60 * 60
            stored_session = await get_stored_auth_session(session_token)
            assert stored_session.refresh_token == mock_idp_response['refresh_token']
            decoded_session_token = stored_session.token_data
            decoded_raw_token = jwt.decode(stored_session.auth_token, ENV_OVERRIDE['JWT_SECRET'], algorithms=[JWT_ALGO])

            assert decoded_session_token.identity_id == MOCK_ID_TOKEN.get('identity').get('id')
            assert decoded_session_token.identity_name == MOCK_ID_TOKEN.get('identity').get('name')
            assert decoded_session_token.identity_email == MOCK_ID_TOKEN.get('identity').get('email')
            assert decoded_session_token.id_token == id_token
            assert decoded_raw_token['id_token'] == id_token
            assert decoded_session_token.exp == MOCK_ID_TOKEN.get('exp')
            assert decoded_session_token.session_id is not None


async def test_sso_callback_pkce_public_client_exchanges_code_without_client_secret():
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_CLIENT_AUTH_MODE': 'pkce_public'}):
        get_oidc_settings.cache_clear()
        config = ConfigurationBuilder()

        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA):
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                transaction = oidc_transaction_store.get(state)
                assert transaction is not None
                assert transaction.code_verifier is not None

                mock_idp_response = {
                    'id_token': make_mock_id_token(state),
                }
                token_route = respx.post(auth_config.discovery.token_endpoint)
                token_route.mock(return_value=httpx.Response(status_code=200, json=mock_idp_response))

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
                assert response.status_code == 200

                token_request = token_route.calls.last.request
                assert 'Authorization' not in token_request.headers

                token_request_body = parse_qs(token_request.content.decode())
                assert token_request_body['grant_type'] == ['authorization_code']
                assert token_request_body['code'] == ['TEST']
                assert token_request_body['redirect_uri'] == [get_oidc_settings().redirect_uri]
                assert token_request_body['client_id'] == [get_oidc_settings().client_id]
                assert token_request_body['code_verifier'] == [transaction.code_verifier]
                assert 'client_secret' not in token_request_body

        get_oidc_settings.cache_clear()


async def test_sso_callback_requires_state():
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})
        assert response.status_code == 422


async def test_sso_callback_rejects_cookie_mismatch_without_consuming_transaction(caplog: pytest.LogCaptureFixture):
    caplog.set_level(logging.ERROR, logger='dara.dev')
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA):
        app = _start_application(config._to_configuration())

        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)
            login_session_id = client.cookie_jar[OIDC_LOGIN_SESSION_COOKIE_NAME]
            id_token = make_mock_id_token(state)

            client.cookie_jar.clear()
            client.cookie_jar[OIDC_LOGIN_SESSION_COOKIE_NAME] = 'different-session'
            mismatch_response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
            assert mismatch_response.status_code == 400
            assert mismatch_response.json()['detail'] == BAD_REQUEST_ERROR('Invalid state parameter')
            log_content = get_log_content(caplog, 'Invalid state parameter')
            assert log_content['status_code'] == 400
            assert log_content['detail_reason'] == 'bad_request'
            assert log_content['has_login_session_cookie'] is True
            assert oidc_transaction_store.get(state) is not None

            client.cookie_jar.clear()
            client.cookie_jar[OIDC_LOGIN_SESSION_COOKIE_NAME] = login_session_id

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json={'id_token': id_token})
            )

            success_response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
            assert success_response.status_code == 200
            assert success_response.json() == {'success': True, 'redirect_to': None}
            assert oidc_transaction_store.get(state) is None


async def test_sso_callback_rejects_reused_state():
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA):
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)
            id_token = make_mock_id_token(state)

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json={'id_token': id_token})
            )

            first_response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
            assert first_response.status_code == 200

            second_response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
            assert second_response.status_code == 400
            assert second_response.json()['detail'] == BAD_REQUEST_ERROR('Invalid state parameter')


async def test_session_supports_multiple_live_transactions_per_login_session():
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        first_response = await client.post('/api/auth/session', json={'redirect_to': '/first'})
        first_state = parse_url(first_response.json()['redirect_uri'])[1]['state'][0]
        first_login_session_id = first_response.cookies.get(OIDC_LOGIN_SESSION_COOKIE_NAME)
        assert first_login_session_id is not None

        second_response = await client.post('/api/auth/session', json={'redirect_to': '/second'})
        second_state = parse_url(second_response.json()['redirect_uri'])[1]['state'][0]
        second_login_session_id = second_response.cookies.get(OIDC_LOGIN_SESSION_COOKIE_NAME)

        assert second_login_session_id == first_login_session_id
        assert first_state != second_state

        first_transaction = oidc_transaction_store.take(first_state)
        second_transaction = oidc_transaction_store.take(second_state)

        assert first_transaction is not None
        assert second_transaction is not None
        assert first_transaction.login_session_id == first_login_session_id
        assert second_transaction.login_session_id == first_login_session_id
        assert first_transaction.nonce != second_transaction.nonce
        assert first_transaction.redirect_to == '/first'
        assert second_transaction.redirect_to == '/second'


async def test_sso_callback_supports_multiple_live_transactions_per_login_session():
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA):
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            first_state = await start_oidc_login(client, redirect_to='/first')
            second_state = await start_oidc_login(client, redirect_to='/second')

            token_route = respx.post(auth_config.discovery.token_endpoint)

            token_route.mock(
                return_value=httpx.Response(status_code=200, json={'id_token': make_mock_id_token(first_state)})
            )
            first_response = await client.post(
                '/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': first_state}
            )
            assert first_response.status_code == 200
            assert first_response.json() == {'success': True, 'redirect_to': '/first'}
            assert not any(
                cookie.startswith(f'{OIDC_LOGIN_SESSION_COOKIE_NAME}="";')
                for cookie in first_response.headers.getall('set-cookie')
            )

            token_route.mock(
                return_value=httpx.Response(status_code=200, json={'id_token': make_mock_id_token(second_state)})
            )
            second_response = await client.post(
                '/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': second_state}
            )
            assert second_response.status_code == 200
            assert second_response.json() == {'success': True, 'redirect_to': '/second'}
            assert any(
                cookie.startswith(f'{OIDC_LOGIN_SESSION_COOKIE_NAME}="";')
                for cookie in second_response.headers.getall('set-cookie')
            )


async def test_sso_callback_rejects_nonce_mismatch():
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA):
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)
            id_token = make_mock_id_token(state, {'nonce': 'wrong-nonce'})

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json={'id_token': id_token})
            )

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
            assert response.status_code == 401
            assert response.json()['detail'] == INVALID_TOKEN_ERROR


async def test_sso_callback_rejects_missing_nonce_claim():
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA):
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)
            id_token = make_mock_id_token(state, {'nonce': None})

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json={'id_token': id_token})
            )

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
            assert response.status_code == 401
            assert response.json()['detail'] == INVALID_TOKEN_ERROR


async def test_sso_callback_rejects_issuer_mismatch():
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA):
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)
            id_token = make_mock_id_token(state, {'iss': 'http://wrong-issuer.com'})

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json={'id_token': id_token})
            )

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
            assert response.status_code == 401
            assert response.json()['detail'] == INVALID_TOKEN_ERROR


async def test_sso_callback_invalid_group():
    """
    Test that /sso-callback returns 403 when group is not allowed
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    MODIFIED_ID_TOKEN = {**MOCK_ID_TOKEN, 'groups': ['other']}

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)
            id_token = make_mock_id_token(state, {'groups': ['other']})

            mock_idp_response = {
                'id_token': id_token,
                'refresh_token': jwt.encode(
                    MOCK_REFRESH_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                ),
            }

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json=mock_idp_response)
            )

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            # 403 because no intersection between id_token groups and allowed groups
            assert response.status_code == 403
            assert response.json()['detail'] == UNAUTHORIZED_ERROR


async def test_sso_callback_invalid_identity():
    """
    Test that /sso-callback returns 403 when identity is not allowed
    """
    with mock.patch.dict(os.environ, {**os.environ, **{'SSO_ALLOWED_IDENTITY_ID': 'foo'}}):
        config = ConfigurationBuilder()

        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state)

                mock_idp_response = {
                    'id_token': id_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                respx.post(auth_config.discovery.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})

                # JWKS endpoint should have been called once to retrieve the key
                assert mock_urllib.call_count == 1

                # 403 because identity does not match
                assert response.status_code == 403
                assert response.json()['detail'] == UNAUTHORIZED_ERROR


async def test_sso_callback_valid_email():
    """
    Test that /sso-callback returns 200 when IDENTITY_ID is provided and matches user
    """
    with mock.patch.dict(os.environ, {**os.environ, **{'SSO_ALLOWED_IDENTITY_ID': MOCK_ID_TOKEN['identity']['id']}}):
        config = ConfigurationBuilder()

        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state)

                mock_idp_response = {
                    'id_token': id_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                respx.post(auth_config.discovery.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})

                # JWKS endpoint should have been called once to retrieve the key
                assert mock_urllib.call_count == 1

                # 200 because identity matches
                assert response.status_code == 200


async def test_extract_user_data_uses_configured_group_claim_name():
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_GROUP_CLAIM_NAME': 'memberOf'}):
        get_oidc_settings.cache_clear()
        try:
            auth_config = make_config()
            claims = IdTokenClaims.model_validate({**MOCK_ID_TOKEN, 'groups': ['other'], 'memberOf': ['dev']})

            user_data = auth_config.extract_user_data(claims)

            assert user_data.groups == ['dev']
        finally:
            get_oidc_settings.cache_clear()


async def test_extract_user_data_uses_configured_userinfo_group_claim_name():
    with mock.patch.dict(
        os.environ,
        {**os.environ, 'SSO_GROUP_CLAIM_NAME': 'memberOf', 'SSO_USE_USERINFO': 'true'},
    ):
        get_oidc_settings.cache_clear()
        try:
            auth_config = make_config()
            claims = IdTokenClaims.model_validate({**MOCK_ID_TOKEN, 'groups': ['other'], 'memberOf': ['id-token-dev']})
            userinfo = {**MOCK_USERINFO, 'groups': ['other-userinfo'], 'memberOf': ['dev']}

            user_data = auth_config.extract_user_data(claims, userinfo=userinfo)

            assert user_data.groups == ['dev']
        finally:
            get_oidc_settings.cache_clear()


async def test_extract_user_data_accepts_single_group_string():
    auth_config = make_config()
    claims = IdTokenClaims.model_validate({**MOCK_ID_TOKEN, 'groups': 'dev'})

    user_data = auth_config.extract_user_data(claims)

    assert user_data.groups == ['dev']


async def test_extract_user_data_accepts_comma_delimited_group_string():
    auth_config = make_config()
    claims = IdTokenClaims.model_validate({**MOCK_ID_TOKEN, 'groups': 'dev, engineering'})

    user_data = auth_config.extract_user_data(claims)

    assert user_data.groups == ['dev, engineering', 'dev', 'engineering']


async def test_extract_user_data_accepts_quoted_csv_group_string():
    auth_config = make_config()
    group_dn = 'CN=App Users,OU=Groups,DC=example,DC=com'
    group_claim = f'"{group_dn}", engineering'
    claims = IdTokenClaims.model_validate({**MOCK_ID_TOKEN, 'groups': group_claim})

    user_data = auth_config.extract_user_data(claims)

    assert user_data.groups == [group_claim, group_dn, 'engineering']


async def test_extract_user_data_preserves_full_comma_group_string():
    auth_config = make_config()
    group_dn = 'CN=App Users,OU=Groups,DC=example,DC=com'
    claims = IdTokenClaims.model_validate({**MOCK_ID_TOKEN, 'groups': group_dn})

    user_data = auth_config.extract_user_data(claims)

    assert user_data.groups is not None
    assert group_dn in user_data.groups


async def test_extract_user_data_accepts_configured_group_claim_string():
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_GROUP_CLAIM_NAME': 'memberOf'}):
        get_oidc_settings.cache_clear()
        try:
            auth_config = make_config()
            claims = IdTokenClaims.model_validate({**MOCK_ID_TOKEN, 'groups': ['other'], 'memberOf': 'dev,engineering'})

            user_data = auth_config.extract_user_data(claims)

            assert user_data.groups == ['dev,engineering', 'dev', 'engineering']
        finally:
            get_oidc_settings.cache_clear()


async def test_extract_user_data_rejects_invalid_userinfo_group_claim_value():
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_USE_USERINFO': 'true'}):
        get_oidc_settings.cache_clear()
        try:
            auth_config = make_config()
            claims = IdTokenClaims.model_validate(MOCK_ID_TOKEN)
            userinfo = {**MOCK_USERINFO, 'groups': {'name': 'dev'}}

            with pytest.raises(HTTPException) as error:
                auth_config.extract_user_data(claims, userinfo=userinfo)

            assert error.value.status_code == 401
            assert error.value.detail == INVALID_TOKEN_ERROR
        finally:
            get_oidc_settings.cache_clear()


async def test_sso_callback_verifies_group_with_identity_id():
    """
    Test that /sso-callback returns 403 if group doesn't match even if IDENTITY_ID validation is on and passing
    """
    with mock.patch.dict(os.environ, {**os.environ, **{'SSO_ALLOWED_IDENTITY_ID': MOCK_ID_TOKEN['identity']['id']}}):
        config = ConfigurationBuilder()

        auth_config = make_config()
        config.add_auth(auth_config)

        MODIFIED_ID_TOKEN = {**MOCK_ID_TOKEN, 'groups': ['other']}

        with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state, {'groups': ['other']})

                mock_idp_response = {
                    'id_token': id_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                respx.post(auth_config.discovery.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})

                # JWKS endpoint should have been called once to retrieve the key
                assert mock_urllib.call_count == 1

                # 403 because no intersection between id_token groups and allowed groups
                assert response.status_code == 403
                assert response.json()['detail'] == UNAUTHORIZED_ERROR


async def test_sso_callback_expired_id_token():
    """
    Make sure /sso-callback fails in case ID token is expired
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    # Modify ID token to be expired
    MODIFIED_ID_TOKEN = {
        **MOCK_ID_TOKEN,
        'exp': (datetime.now(tz=timezone.utc) - timedelta(hours=2)).timestamp(),
    }

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)
            id_token = make_mock_id_token(state, MODIFIED_ID_TOKEN)

            mock_idp_response = {
                'id_token': id_token,
                'refresh_token': jwt.encode(
                    MOCK_REFRESH_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                ),
            }

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json=mock_idp_response)
            )

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            # 401 - expired
            assert response.status_code == 401
            assert response.json()['detail'] == EXPIRED_TOKEN_ERROR


async def test_sso_callback_missing_id_token():
    """
    Make sure /sso-callback rejects token responses without an ID token.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(
                    status_code=200,
                    json={
                        'access_token': 'access-token',
                        'refresh_token': jwt.encode(
                            MOCK_REFRESH_TOKEN,
                            PyJWK(MOCK_JWK).key,
                            algorithm=MOCK_JWK['alg'],
                            headers={'kid': MOCK_JWK['kid']},
                        ),
                    },
                )
            )

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})

            assert mock_urllib.call_count == 0
            assert response.status_code == 401
            assert response.json()['detail'] == INVALID_TOKEN_ERROR


async def test_sso_callback_idp_error():
    """
    Make sure /sso-callback returns 401 if IDP authorisation fails
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            state = await start_oidc_login(client)
            mock_idp_response = {'error': 'invalid_client', 'error_description': 'No client credentials found.'}

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=401, json=mock_idp_response)
            )

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})

            # JWKS endpoint should not have been called, request should've failed before that point
            assert mock_urllib.call_count == 0

            # 401 - invalid/expired token
            assert response.status_code == 401
            assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider authorization failed')


async def test_refresh_token_creates_valid_session_token():
    """
    Test that server-side refresh correctly updates an opaque session token
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            jwk = PyJWK(MOCK_JWK)
            old_refresh_token_mock = str(uuid4())
            id_token = jwt.encode(
                MOCK_ID_TOKEN,
                jwk.key,
                algorithm=MOCK_JWK['alg'],
                headers={'kid': MOCK_JWK['kid']},
            )
            mock_idp_response = {
                'id_token': id_token,
                'refresh_token': jwt.encode(
                    MOCK_REFRESH_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                ),
            }

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json=mock_idp_response)
            )
            old_session_token = await create_mock_dara_session_token(refresh_token=old_refresh_token_mock)

            response = await client.post(
                '/api/auth/verify-session',
                headers={'Authorization': f'Bearer {old_session_token}'},
            )

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            assert response.json() == MOCK_DARA_TOKEN_DATA.get('session_id')
            session_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
            assert session_token == old_session_token
            stored_session = await get_stored_auth_session(session_token)
            assert stored_session.refresh_token == mock_idp_response['refresh_token']
            decoded_session_token = stored_session.token_data

            assert decoded_session_token.identity_id == MOCK_ID_TOKEN.get('identity').get('id')
            assert decoded_session_token.identity_name == MOCK_ID_TOKEN.get('identity').get('name')
            assert decoded_session_token.identity_email == MOCK_ID_TOKEN.get('identity').get('email')
            assert decoded_session_token.id_token == id_token
            # Session ID should be transferred over
            assert decoded_session_token.session_id == MOCK_DARA_TOKEN_DATA.get('session_id')
            assert decoded_session_token.exp == MOCK_ID_TOKEN.get('exp')


async def test_refresh_token_invalid_group():
    """
    Test that server-side refresh returns 403 when group is not allowed
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    MODIFIED_ID_TOKEN = {**MOCK_ID_TOKEN, 'groups': ['other']}

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            old_refresh_token_mock = str(uuid4())
            jwk = PyJWK(MOCK_JWK)
            id_token = jwt.encode(
                MODIFIED_ID_TOKEN,
                jwk.key,
                algorithm=MOCK_JWK['alg'],
                headers={'kid': MOCK_JWK['kid']},
            )

            mock_idp_response = {
                'id_token': id_token,
                'refresh_token': jwt.encode(
                    MOCK_REFRESH_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                ),
            }

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=200, json=mock_idp_response)
            )
            old_session_token = await create_mock_dara_session_token(refresh_token=old_refresh_token_mock)

            response = await client.post(
                '/api/auth/verify-session',
                headers={'Authorization': f'Bearer {old_session_token}'},
            )

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            # 403 because no intersection between id_token groups and allowed groups
            assert response.status_code == 403
            assert response.json()['detail'] == UNAUTHORIZED_ERROR
            assert response.headers['set-cookie'].startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";')


async def test_refresh_token_idp_error():
    """
    Make sure server-side refresh returns 401 if IDP authorisation fails
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            mock_idp_response = {
                'error': 'invalid_refresh_token',
                'error_description': 'Refresh token has already been used',
            }

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=401, json=mock_idp_response)
            )
            old_session_token = await create_mock_dara_session_token(refresh_token=str(uuid4()))

            response = await client.post(
                '/api/auth/verify-session',
                headers={'Authorization': f'Bearer {old_session_token}'},
            )

            # JWKS endpoint should not have been called, request should've failed before that point
            assert mock_urllib.call_count == 0

            # 401 - invalid/expired token
            assert response.status_code == 401
            assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider authorization failed')
            assert response.headers['set-cookie'].startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";')


async def test_verify_token_expired():
    """
    Test SSO token verification fails if session token is expired
    """
    session_token = jwt.encode(
        TokenData(
            session_id='SESSION_ID',
            exp=(datetime.now(tz=timezone.utc) - timedelta(hours=2)).timestamp(),
            identity_id='PERSONA_ID',
            identity_name='USERNAME',
            identity_email='username@causalens.com',
            groups=['dev'],
            id_token='id_token_123',
        ).model_dump(),
        ENV_OVERRIDE['JWT_SECRET'],
        algorithm=JWT_ALGO,
    )

    auth_config = make_config()

    # AuthError expected due to expired token
    with pytest.raises(AuthError):
        await auth_config.verify_token(session_token)


async def test_verify_token_decodes_correctly():
    """
    Test SSO token verification decodes correctly
    """
    token_data = TokenData(
        session_id='SESSION_ID',
        exp=(datetime.now(tz=timezone.utc) + timedelta(hours=2)),
        identity_id='PERSONA_ID',
        identity_name='USERNAME',
        identity_email='username@causalens.com',
        groups=['dev'],
        id_token='id_token_123',
    )
    session_token = jwt.encode(token_data.model_dump(), ENV_OVERRIDE['JWT_SECRET'], algorithm=JWT_ALGO)

    auth_config = make_config()

    decoded_token = await auth_config.verify_token(session_token)

    for k, value in token_data.model_dump().items():
        if k == 'exp':
            # For exp there might be microseconds of difference due to parsing etc so just check it's within the same second
            assert value - datetime.fromtimestamp(getattr(decoded_token, k), tz=timezone.utc) < timedelta(seconds=1)
            continue

        assert getattr(decoded_token, k) == value


async def test_verify_session_accepts_raw_oidc_id_token_bearer():
    """
    Test verify-session still accepts raw IDP ID tokens from external bearer clients.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            jwk = PyJWK(MOCK_JWK)
            id_token = jwt.encode(
                MOCK_ID_TOKEN,
                jwk.key,
                algorithm=MOCK_JWK['alg'],
                headers={'kid': MOCK_JWK['kid']},
            )

            response = await client.post(
                '/api/auth/verify-session',
                headers={'Authorization': f'Bearer {id_token}'},
            )

            assert response.status_code == 200
            assert response.json() == MOCK_ID_TOKEN['identity']['id']
            assert mock_urllib.call_count == 1


async def test_verify_session_accepts_raw_dara_token_bearer():
    """
    Test verify-session still accepts raw Dara JWTs when no opaque session exists.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:
        token_data = TokenData(
            session_id='SESSION_ID',
            exp=int((datetime.now(tz=timezone.utc) + timedelta(hours=2)).timestamp()),
            identity_id='PERSONA_ID',
            identity_name='USERNAME',
            identity_email='username@causalens.com',
            groups=['dev'],
            id_token='id_token_123',
        )
        raw_token = jwt.encode(token_data.model_dump(), ENV_OVERRIDE['JWT_SECRET'], algorithm=JWT_ALGO)

        response = await client.post(
            '/api/auth/verify-session',
            headers={'Authorization': f'Bearer {raw_token}'},
        )

        assert response.status_code == 200
        assert response.json() == token_data.session_id


async def test_verify_token_opaque_token_without_session_data_fails():
    """
    Test opaque Dara OIDC token verification fails when session data is missing.
    """
    session_token = AuthSessionStore.generate_session_token()

    auth_config = make_config()

    with pytest.raises(AuthError) as error:
        await verify_auth_token(auth_config, session_token)

    assert error.value.code == 401
    assert error.value.detail == INVALID_TOKEN_ERROR


async def test_auth_session_store_retains_session_until_auth_token_retention_without_refresh_token():
    """
    Test auth session store retention is based on auth token expiry when no refresh token exists.
    """
    store = AuthSessionStore()
    token_data = TokenData(
        session_id='session-1',
        exp=200.0,
        identity_id='PERSONA_ID',
        identity_name='USERNAME',
        identity_email='username@causalens.com',
        groups=['dev'],
    )

    with (
        mock.patch('dara.core.auth.session_store.time.time') as mock_time,
    ):
        mock_time.return_value = 100.0
        await store.set('token-1', 'auth-token-1', token_data)

        mock_time.return_value = 150.0
        assert (await store.get('token-1')).token_data == token_data

        mock_time.return_value = 259.0
        assert (await store.get('token-1')).token_data == token_data

        mock_time.return_value = 260.1
        assert await store.get('token-1') is None


async def test_auth_session_store_retains_session_until_refresh_token_expiry():
    """
    Test auth session store retention follows the refresh token expiry when it is later than the auth token expiry.
    """
    store = AuthSessionStore()
    token_data = TokenData(
        session_id='session-1',
        exp=200.0,
        identity_id='PERSONA_ID',
        identity_name='USERNAME',
        identity_email='username@causalens.com',
        groups=['dev'],
    )
    refresh_token = jwt.encode({'exp': 500.0}, ENV_OVERRIDE['JWT_SECRET'], algorithm=JWT_ALGO)

    with (
        mock.patch('dara.core.auth.session_store.time.time') as mock_time,
    ):
        mock_time.return_value = 100.0
        await store.set('token-1', 'auth-token-1', token_data, refresh_token=refresh_token)

        mock_time.return_value = 260.1
        stored_session = await store.get('token-1')
        assert isinstance(stored_session, ExpiredAuthSession)
        assert stored_session.refresh_token == refresh_token

        mock_time.return_value = 559.0
        assert (await store.get('token-1')).token_data == token_data

        mock_time.return_value = 560.1
        assert await store.get('token-1') is None


async def test_auth_session_store_uses_max_age_for_refresh_token_without_expiry():
    """
    Test auth session store uses a bounded max age when the refresh token has no known expiry.
    """
    store = AuthSessionStore()
    token_data = TokenData(
        session_id='session-1',
        exp=100.0,
        identity_id='PERSONA_ID',
        identity_name='USERNAME',
        identity_email='username@causalens.com',
        groups=['dev'],
    )

    with (
        mock.patch('dara.core.auth.session_store.time.time') as mock_time,
    ):
        mock_time.return_value = 99.0
        await store.set('token-1', 'auth-token-1', token_data, refresh_token='opaque-refresh-token')

        mock_time.return_value = 99.0 + get_settings().auth_session_max_age_seconds + 59.0
        stored_session = await store.get('token-1')
        assert isinstance(stored_session, ExpiredAuthSession)
        assert stored_session.refresh_token == 'opaque-refresh-token'

        mock_time.return_value = 99.0 + get_settings().auth_session_max_age_seconds + 60.1
        assert await store.get('token-1') is None


async def test_auth_session_store_keeps_expired_session_until_refresh_retention():
    """
    Test auth session store represents expired-but-refreshable sessions explicitly.
    """
    store = AuthSessionStore()
    token_data = TokenData(
        session_id='session-1',
        exp=100.0,
        identity_id='PERSONA_ID',
        identity_name='USERNAME',
        identity_email='username@causalens.com',
        groups=['dev'],
    )

    with (
        mock.patch('dara.core.auth.session_store.time.time') as mock_time,
    ):
        mock_time.return_value = 99.0
        await store.set('token-1', 'auth-token-1', token_data)

        mock_time.return_value = 100.5
        stored_session = await store.get('token-1')
        assert isinstance(stored_session, ExpiredAuthSession)
        assert stored_session.token_data == token_data

        mock_time.return_value = 160.1
        assert await store.get('token-1') is None


async def test_auth_session_store_rejects_session_beyond_refresh_retention():
    """
    Test auth session store does not return handles for sessions it refuses to store.
    """
    store = AuthSessionStore()
    token_data = TokenData(
        session_id='session-1',
        exp=100.0,
        identity_id='PERSONA_ID',
        identity_name='USERNAME',
        identity_email='username@causalens.com',
        groups=['dev'],
    )

    with (
        mock.patch('dara.core.auth.session_store.time.time') as mock_time,
    ):
        mock_time.return_value = 161.0
        with pytest.raises(ValueError):
            await store.create('auth-token-1', token_data)


async def test_auth_session_store_retains_all_unexpired_sessions():
    """
    Test auth session store does not evict unexpired sessions based on entry count.
    """
    store = AuthSessionStore()
    token_data = TokenData(
        session_id='session-1',
        exp=200.0,
        identity_id='PERSONA_ID',
        identity_name='USERNAME',
        identity_email='username@causalens.com',
        groups=['dev'],
    )

    with (
        mock.patch('dara.core.auth.session_store.time.time') as mock_time,
    ):
        mock_time.return_value = 100.0
        await store.set('token-1', 'auth-token-1', token_data)

        mock_time.return_value = 101.0
        await store.set('token-2', 'auth-token-2', token_data.model_copy(update={'session_id': 'session-2'}))

        mock_time.return_value = 102.0
        assert (await store.get('token-1')).token_data == token_data

        mock_time.return_value = 103.0
        await store.set('token-3', 'auth-token-3', token_data.model_copy(update={'session_id': 'session-3'}))

        assert (await store.get('token-1')).token_data == token_data
        assert (await store.get('token-2')).token_data == token_data.model_copy(update={'session_id': 'session-2'})
        assert (await store.get('token-3')).token_data == token_data.model_copy(update={'session_id': 'session-3'})


async def test_verify_session_dara_token_without_id_token_forces_relogin():
    """
    Test Dara token verification through /verify-session returns invalid token when the ID token is missing.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:
        session_token = jwt.encode(
            {
                'session_id': str(uuid4()),
                'exp': (datetime.now(tz=timezone.utc) + timedelta(hours=2)),
                'identity_id': 'PERSONA_ID',
                'identity_name': 'USERNAME',
                'identity_email': 'username@causalens.com',
                'groups': ['dev'],
            },
            ENV_OVERRIDE['JWT_SECRET'],
            algorithm=JWT_ALGO,
        )

        response = await client.post(
            '/api/auth/verify-session',
            headers={'Authorization': f'Bearer {session_token}'},
        )

        assert response.status_code == 401
        assert response.json()['detail'] == INVALID_TOKEN_ERROR


async def test_verify_session_expired_opaque_token_refreshes_with_existing_session_id():
    """
    Test verify-session refreshes an expired opaque session while preserving the stored session id.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            session_id = str(uuid4())
            expired_at = int((datetime.now(tz=timezone.utc) - timedelta(seconds=10)).timestamp())
            old_token_data = TokenData(
                session_id=session_id,
                exp=expired_at,
                identity_id='PERSONA_ID',
                identity_name='USERNAME',
                identity_email='username@causalens.com',
                groups=['dev'],
                id_token='old-id-token',
            )
            raw_session_token = jwt.encode(old_token_data.model_dump(), ENV_OVERRIDE['JWT_SECRET'], algorithm=JWT_ALGO)
            expired_session_token = await auth_session_store.create(
                raw_session_token,
                old_token_data,
                refresh_token='expired-session-refresh-token',
            )

            jwk = PyJWK(MOCK_JWK)
            refreshed_id_token = jwt.encode(
                MOCK_ID_TOKEN,
                jwk.key,
                algorithm=MOCK_JWK['alg'],
                headers={'kid': MOCK_JWK['kid']},
            )

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(
                    status_code=200,
                    json={
                        'id_token': refreshed_id_token,
                        'refresh_token': 'rotated-refresh-token',
                    },
                )
            )

            response = await client.post(
                '/api/auth/verify-session',
                headers={'Authorization': f'Bearer {expired_session_token}'},
            )

            assert response.status_code == 200
            assert mock_urllib.call_count == 1

            assert response.cookies.get(SESSION_TOKEN_COOKIE_NAME) == expired_session_token

            stored_session = await get_stored_auth_session(expired_session_token)
            assert stored_session.refresh_token == 'rotated-refresh-token'
            assert stored_session.token_data.session_id == session_id
            assert stored_session.token_data.id_token == refreshed_id_token


async def test_verify_session_opaque_token_forces_relogin_when_session_store_entry_missing():
    """
    Test verify-session fails when an opaque session store entry is missing.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            stale_session_token = AuthSessionStore.generate_session_token()

            response = await client.post(
                '/api/auth/verify-session',
                headers={'Authorization': f'Bearer {stale_session_token}'},
            )

            assert response.status_code == 401
            assert response.json()['detail'] == INVALID_TOKEN_ERROR
            assert mock_urllib.call_count == 0
            assert response.headers['set-cookie'].startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";')


async def test_verify_session_malformed_token_forces_relogin():
    """
    Test malformed signed Dara token through /verify-session returns invalid token instead of server error.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:
        malformed_token = jwt.encode(
            {
                'session_id': str(uuid4()),
                'exp': (datetime.now(tz=timezone.utc) + timedelta(hours=2)),
            },
            ENV_OVERRIDE['JWT_SECRET'],
            algorithm=JWT_ALGO,
        )

        response = await client.post(
            '/api/auth/verify-session',
            headers={'Authorization': f'Bearer {malformed_token}'},
        )

        assert response.status_code == 401
        assert response.json()['detail'] == INVALID_TOKEN_ERROR


async def test_websocket_disconnect_preserves_auth_session_store_for_verify_session():
    """
    Test that websocket disconnect does not clear auth session data needed by /verify-session.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:
        session_id = str(uuid4())
        token_data = TokenData(
            session_id=session_id,
            exp=(datetime.now(tz=timezone.utc) + timedelta(hours=2)),
            identity_id='PERSONA_ID',
            identity_name='USERNAME',
            identity_email='username@causalens.com',
            groups=['dev'],
            id_token='id_token_123',
        )
        raw_token = jwt.encode(
            token_data.model_dump(),
            ENV_OVERRIDE['JWT_SECRET'],
            algorithm=JWT_ALGO,
        )
        session_token = await auth_session_store.create(raw_token, token_data)

        async with _async_ws_connect(client, session_token) as websocket:
            # consume websocket init payload
            await websocket.receive_json()

        response = await client.post(
            '/api/auth/verify-session',
            headers={'Authorization': f'Bearer {session_token}'},
        )

        assert response.status_code == 200


async def test_verify_token_decodes_id_token_correctly():
    """
    Test SSO token verification decodes correctly
    """
    jwk = PyJWK(MOCK_JWK)
    id_token = jwt.encode(
        MOCK_ID_TOKEN,
        jwk.key,
        algorithm=MOCK_JWK['alg'],
        headers={'kid': MOCK_JWK['kid']},
    )

    auth_config = make_config()

    with mocked_urllib(MOCK_JWKS_DATA), mock_registered_jwks_client():
        decoded_token = await auth_config.verify_token(id_token)
        assert decoded_token.identity_id == MOCK_ID_TOKEN.get('identity').get('id')
        assert decoded_token.identity_name == MOCK_ID_TOKEN.get('identity').get('name')
        assert decoded_token.identity_email == MOCK_ID_TOKEN.get('identity').get('email')
        assert decoded_token.id_token == id_token
        assert decoded_token.exp == MOCK_ID_TOKEN.get('exp')


async def test_verify_token_allows_aud_claim_when_audience_verification_disabled():
    """
    Test SSO token verification accepts a standard OIDC aud claim when audience verification is disabled.
    """
    jwk = PyJWK(MOCK_JWK)
    id_token = jwt.encode(
        {**MOCK_ID_TOKEN, 'aud': TEST_SSO_CLIENT_ID},
        jwk.key,
        algorithm=MOCK_JWK['alg'],
        headers={'kid': MOCK_JWK['kid']},
    )

    auth_config = make_config()

    with mocked_urllib(MOCK_JWKS_DATA), mock_registered_jwks_client():
        decoded_token = await auth_config.verify_token(id_token)
        assert decoded_token.identity_id == MOCK_ID_TOKEN.get('identity').get('id')
        assert decoded_token.id_token == id_token


async def test_revoke_session():
    """
    Test that in SSO mode revoke session returns a redirect_uri and clears the session cookie
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            jwk = PyJWK(MOCK_JWK)
            id_token = jwt.encode(
                MOCK_ID_TOKEN,
                jwk.key,
                algorithm=MOCK_JWK['alg'],
                headers={'kid': MOCK_JWK['kid']},
            )
            test_token = {
                'session_id': 'SESSION_ID',
                'exp': (datetime.now(tz=timezone.utc) + timedelta(hours=2)),
                'identity_id': 'PERSONA_ID',
                'identity_name': 'USERNAME',
                'identity_email': 'joe@causalens.com',
                'groups': [],
                'id_token': id_token,
            }
            encoded_test_token = jwt.encode(test_token, ENV_OVERRIDE['JWT_SECRET'], algorithm=JWT_ALGO)
            session_token = await auth_session_store.create(encoded_test_token, TokenData(**test_token))

            response = await client.post(
                '/api/auth/revoke-session',
                headers={'Authorization': f'Bearer {session_token}'},
            )

            assert response.status_code == 200
            assert response.json()['redirect_uri'] == auth_config.get_logout_url(id_token)
            assert response.headers['Set-Cookie'].startswith(f'{SESSION_TOKEN_COOKIE_NAME}=""; expires')
            assert 'Max-Age=0' in response.headers['Set-Cookie']


async def test_revoke_session_opaque_token_uses_stored_raw_id_token():
    """
    Test revoke session resolves the ID token hint from the stored raw auth token.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:
        session_id = str(uuid4())
        id_token = 'stored_id_token'
        raw_token = jwt.encode(
            {
                'session_id': session_id,
                'exp': (datetime.now(tz=timezone.utc) + timedelta(hours=2)),
                'identity_id': 'PERSONA_ID',
                'identity_name': 'USERNAME',
                'identity_email': 'joe@causalens.com',
                'groups': [],
                'id_token': id_token,
            },
            ENV_OVERRIDE['JWT_SECRET'],
            algorithm=JWT_ALGO,
        )
        session_token = await auth_session_store.create(
            raw_token,
            TokenData(
                session_id=session_id,
                exp=(datetime.now(tz=timezone.utc) + timedelta(hours=2)),
                identity_id='PERSONA_ID',
                identity_name='USERNAME',
                identity_email='joe@causalens.com',
                groups=[],
                id_token=id_token,
            ),
        )

        response = await client.post(
            '/api/auth/revoke-session',
            headers={'Authorization': f'Bearer {session_token}'},
        )

        assert response.status_code == 200
        assert response.json()['redirect_uri'] == auth_config.get_logout_url(id_token)
        assert await auth_session_store.get(session_token) is None


async def test_revoke_session_accepts_raw_id_token_bearer():
    """
    Test that revoke session still accepts raw ID tokens from external bearer clients.
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            jwk = PyJWK(MOCK_JWK)
            id_token = jwt.encode(
                MOCK_ID_TOKEN,
                jwk.key,
                algorithm=MOCK_JWK['alg'],
                headers={'kid': MOCK_JWK['kid']},
            )

            response = await client.post(
                '/api/auth/revoke-session',
                headers={'Authorization': f'Bearer {id_token}'},
            )

            assert response.status_code == 200
            assert response.json()['redirect_uri'] == auth_config.get_logout_url(id_token)
            assert response.headers['Set-Cookie'].startswith(f'{SESSION_TOKEN_COOKIE_NAME}=""; expires')


async def test_revoke_session_expired_token():
    """
    Test that session can be revoked with an expired token
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        app = _start_application(config._to_configuration())
        async with AsyncClient(app) as client:
            jwk = PyJWK(MOCK_JWK)
            id_token = jwt.encode(
                MOCK_ID_TOKEN,
                jwk.key,
                algorithm=MOCK_JWK['alg'],
                headers={'kid': MOCK_JWK['kid']},
            )
            test_token = {
                'session_id': 'SESSION_ID',
                'exp': (datetime.now(tz=timezone.utc) - timedelta(seconds=10)),
                'identity_id': 'PERSONA_ID',
                'identity_name': 'USERNAME',
                'identity_email': 'joe@causalens.com',
                'groups': [],
                'id_token': id_token,
            }
            encoded_test_token = jwt.encode(test_token, ENV_OVERRIDE['JWT_SECRET'], algorithm=JWT_ALGO)
            session_token = await auth_session_store.create(encoded_test_token, TokenData(**test_token))

            response = await client.post(
                '/api/auth/revoke-session',
                headers={'Authorization': f'Bearer {session_token}'},
            )

            assert response.status_code == 200
            assert response.json()['redirect_uri'] == auth_config.get_logout_url(id_token)
            assert response.headers['Set-Cookie'].startswith(f'{SESSION_TOKEN_COOKIE_NAME}=""; expires')
            assert 'Max-Age=0' in response.headers['Set-Cookie']


# Mock userinfo response
MOCK_USERINFO = {
    'sub': 'uuid',
    'name': 'Joe from Userinfo',
    'email': 'joe.userinfo@causalens.com',
    'groups': ['dev', 'userinfo-group'],
}

# Mock discovery with userinfo endpoint
MOCK_DISCOVERY_WITH_USERINFO = OIDCDiscoveryMetadata(
    issuer=TEST_SSO_ISSUER_URL,
    authorization_endpoint='http://test-identity-provider.com/api/authentication/authenticate',
    token_endpoint='http://test-identity-provider.com/api/authentication/token',
    jwks_uri='http://test-identity-provider.com/api/authentication/keys',
    registration_endpoint='http://test-identity-provider.com/api/authentication/register',
    response_types_supported=['code', 'id_token', 'token id_token'],
    token_endpoint_auth_methods_supported=['client_secret_post', 'client_secret_basic'],
    id_token_signing_alg_values_supported=['RS256'],
    end_session_endpoint='http://test-identity-provider.com/api/authentication/logout',
    userinfo_endpoint='http://test-identity-provider.com/api/authentication/userinfo',
)


@pytest.fixture
def mock_discovery_with_userinfo():
    """Fixture that mocks discovery to include userinfo endpoint"""
    with respx.mock:
        env_issuer_url = os.environ.get('SSO_ISSUER_URL', '')
        env_discovery_url = f'{env_issuer_url}/.well-known/openid-configuration'
        respx.get(env_discovery_url).mock(
            return_value=httpx.Response(status_code=200, json=MOCK_DISCOVERY_WITH_USERINFO.model_dump())
        )
        yield


async def test_sso_callback_with_userinfo(mock_discovery_with_userinfo):
    """
    Test that /sso-callback fetches and uses userinfo when SSO_USE_USERINFO is enabled
    """
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_USE_USERINFO': 'true'}):
        # Clear settings cache to pick up the new env var
        get_oidc_settings.cache_clear()

        config = ConfigurationBuilder()
        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state)
                access_token = jwt.encode(
                    MOCK_ACCESS_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                mock_idp_response = {
                    'id_token': id_token,
                    'access_token': access_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                # Mock the token endpoint
                respx.post(MOCK_DISCOVERY_WITH_USERINFO.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                # Mock the userinfo endpoint
                respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=MOCK_USERINFO)
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
                assert response.status_code == 200

                # JWKS endpoint should have been called once to retrieve the key
                assert mock_urllib.call_count == 1

                assert response.json() == {'success': True, 'redirect_to': None}
                session_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
                decoded_session_token = (await get_stored_auth_session(session_token)).token_data

                # User data should come from userinfo, not id_token
                assert decoded_session_token.identity_name == MOCK_USERINFO['name']
                assert decoded_session_token.identity_email == MOCK_USERINFO['email']
                # Groups should come from userinfo
                assert decoded_session_token.groups == MOCK_USERINFO['groups']


async def test_sso_callback_rejects_userinfo_subject_mismatch(mock_discovery_with_userinfo):
    """
    Test that /sso-callback rejects userinfo for a different subject
    """
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_USE_USERINFO': 'true'}):
        get_oidc_settings.cache_clear()

        config = ConfigurationBuilder()
        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA):
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state)
                access_token = jwt.encode(
                    MOCK_ACCESS_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                mock_idp_response = {
                    'id_token': id_token,
                    'access_token': access_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                respx.post(MOCK_DISCOVERY_WITH_USERINFO.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )
                respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json={**MOCK_USERINFO, 'sub': 'other-user'})
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
                assert response.status_code == 401
                assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider userinfo failed')


async def test_sso_callback_userinfo_disabled_by_default(mock_discovery_with_userinfo):
    """
    Test that /sso-callback does NOT fetch userinfo when SSO_USE_USERINFO is not set
    """
    # Ensure SSO_USE_USERINFO is not set
    env_copy = {k: v for k, v in os.environ.items() if k != 'SSO_USE_USERINFO'}
    with mock.patch.dict(os.environ, env_copy, clear=True):
        get_oidc_settings.cache_clear()

        config = ConfigurationBuilder()
        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state)
                access_token = jwt.encode(
                    MOCK_ACCESS_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                mock_idp_response = {
                    'id_token': id_token,
                    'access_token': access_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                # Mock the token endpoint
                respx.post(MOCK_DISCOVERY_WITH_USERINFO.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                # Mock the userinfo endpoint - should NOT be called
                userinfo_route = respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=MOCK_USERINFO)
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
                assert response.status_code == 200

                # Userinfo endpoint should NOT have been called
                assert userinfo_route.call_count == 0

                assert response.json() == {'success': True, 'redirect_to': None}
                session_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
                decoded_session_token = (await get_stored_auth_session(session_token)).token_data

                # User data should come from id_token (identity claim), not userinfo
                assert decoded_session_token.identity_name == MOCK_ID_TOKEN['identity']['name']
                assert decoded_session_token.identity_email == MOCK_ID_TOKEN['identity']['email']
                assert decoded_session_token.groups == MOCK_ID_TOKEN['groups']


async def test_sso_callback_userinfo_failure_rejects(mock_discovery_with_userinfo, caplog: pytest.LogCaptureFixture):
    """
    Test that /sso-callback rejects if required userinfo fetch fails
    """
    caplog.set_level(logging.ERROR, logger='dara.dev')
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_USE_USERINFO': 'true'}):
        get_oidc_settings.cache_clear()

        config = ConfigurationBuilder()
        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA):
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state)
                access_token = jwt.encode(
                    MOCK_ACCESS_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                mock_idp_response = {
                    'id_token': id_token,
                    'access_token': access_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                # Mock the token endpoint
                respx.post(MOCK_DISCOVERY_WITH_USERINFO.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                # Mock the userinfo endpoint to fail
                respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint).mock(
                    return_value=httpx.Response(status_code=500, json={'error': 'Internal Server Error'})
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
                assert response.status_code == 401
                assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider userinfo failed')

                log_content = get_log_content(caplog, 'OIDC userinfo fetch failed')
                assert log_content['reason'] == 'http_error'
                assert log_content['userinfo_response_status'] == 500


async def test_sso_callback_userinfo_requires_access_token(
    mock_discovery_with_userinfo, caplog: pytest.LogCaptureFixture
):
    """
    Test that SSO_USE_USERINFO requires an access token from the IDP token response
    """
    caplog.set_level(logging.ERROR, logger='dara.dev')
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_USE_USERINFO': 'true'}):
        get_oidc_settings.cache_clear()

        config = ConfigurationBuilder()
        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA):
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state)
                mock_idp_response = {
                    'id_token': id_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                respx.post(MOCK_DISCOVERY_WITH_USERINFO.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
                assert response.status_code == 401
                assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider userinfo failed')

                log_content = get_log_content(caplog, 'OIDC userinfo fetch failed')
                assert log_content['reason'] == 'missing_access_token'


async def test_sso_callback_userinfo_requires_discovery_endpoint(caplog: pytest.LogCaptureFixture):
    """
    Test that SSO_USE_USERINFO requires a userinfo endpoint in OIDC discovery
    """
    caplog.set_level(logging.ERROR, logger='dara.dev')
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_USE_USERINFO': 'true'}):
        get_oidc_settings.cache_clear()

        config = ConfigurationBuilder()
        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA):
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                state = await start_oidc_login(client)
                id_token = make_mock_id_token(state)
                access_token = jwt.encode(
                    MOCK_ACCESS_TOKEN,
                    PyJWK(MOCK_JWK).key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                mock_idp_response = {
                    'id_token': id_token,
                    'access_token': access_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                respx.post(MOCK_DISCOVERY.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST', 'state': state})
                assert response.status_code == 401
                assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider userinfo failed')

                log_content = get_log_content(caplog, 'OIDC userinfo fetch failed')
                assert log_content['reason'] == 'missing_userinfo_endpoint'


async def test_refresh_token_with_userinfo(mock_discovery_with_userinfo):
    """
    Test that server-side refresh fetches and uses userinfo when SSO_USE_USERINFO is enabled
    """
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_USE_USERINFO': 'true'}):
        get_oidc_settings.cache_clear()

        config = ConfigurationBuilder()
        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                jwk = PyJWK(MOCK_JWK)
                old_refresh_token_mock = str(uuid4())
                id_token = jwt.encode(
                    MOCK_ID_TOKEN,
                    jwk.key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                access_token = jwt.encode(
                    MOCK_ACCESS_TOKEN,
                    jwk.key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                mock_idp_response = {
                    'id_token': id_token,
                    'access_token': access_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        PyJWK(MOCK_JWK).key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                # Mock the token endpoint
                respx.post(MOCK_DISCOVERY_WITH_USERINFO.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )

                # Mock the userinfo endpoint
                respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=MOCK_USERINFO)
                )
                old_session_token = await create_mock_dara_session_token(refresh_token=old_refresh_token_mock)

                response = await client.post(
                    '/api/auth/verify-session',
                    headers={'Authorization': f'Bearer {old_session_token}'},
                )

                assert response.status_code == 200

                assert response.json() == MOCK_DARA_TOKEN_DATA.get('session_id')
                session_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
                stored_session = await get_stored_auth_session(session_token)
                assert stored_session.refresh_token == mock_idp_response['refresh_token']
                decoded_session_token = stored_session.token_data

                # User data should come from userinfo
                assert decoded_session_token.identity_name == MOCK_USERINFO['name']
                assert decoded_session_token.identity_email == MOCK_USERINFO['email']
                assert decoded_session_token.groups == MOCK_USERINFO['groups']
                # Session ID should be preserved from old token
                assert decoded_session_token.session_id == MOCK_DARA_TOKEN_DATA.get('session_id')


async def test_refresh_token_userinfo_failure_rejects(mock_discovery_with_userinfo, caplog: pytest.LogCaptureFixture):
    """
    Test that server-side refresh rejects if required userinfo fetch fails
    """
    caplog.set_level(logging.ERROR, logger='dara.dev')
    with mock.patch.dict(os.environ, {**os.environ, 'SSO_USE_USERINFO': 'true'}):
        get_oidc_settings.cache_clear()

        config = ConfigurationBuilder()
        auth_config = make_config()
        config.add_auth(auth_config)

        with mocked_urllib(MOCK_JWKS_DATA):
            app = _start_application(config._to_configuration())
            async with AsyncClient(app) as client:
                jwk = PyJWK(MOCK_JWK)
                old_refresh_token_mock = str(uuid4())
                id_token = jwt.encode(
                    MOCK_ID_TOKEN,
                    jwk.key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                access_token = jwt.encode(
                    MOCK_ACCESS_TOKEN,
                    jwk.key,
                    algorithm=MOCK_JWK['alg'],
                    headers={'kid': MOCK_JWK['kid']},
                )
                mock_idp_response = {
                    'id_token': id_token,
                    'access_token': access_token,
                    'refresh_token': jwt.encode(
                        MOCK_REFRESH_TOKEN,
                        jwk.key,
                        algorithm=MOCK_JWK['alg'],
                        headers={'kid': MOCK_JWK['kid']},
                    ),
                }

                respx.post(MOCK_DISCOVERY_WITH_USERINFO.token_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=mock_idp_response)
                )
                respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint).mock(
                    return_value=httpx.Response(status_code=500, json={'error': 'Internal Server Error'})
                )
                old_session_token = await create_mock_dara_session_token(refresh_token=old_refresh_token_mock)

                response = await client.post(
                    '/api/auth/verify-session',
                    headers={'Authorization': f'Bearer {old_session_token}'},
                )

                assert response.status_code == 401
                assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider userinfo failed')

                log_content = get_log_content(caplog, 'OIDC userinfo fetch failed')
                assert log_content['reason'] == 'http_error'
                assert log_content['userinfo_response_status'] == 500
