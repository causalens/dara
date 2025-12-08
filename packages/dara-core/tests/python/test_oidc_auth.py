import contextlib
import json
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
from jwt import PyJWK

from dara.core.auth.definitions import (
    EXPIRED_TOKEN_ERROR,
    JWT_ALGO,
    OTHER_AUTH_ERROR,
    UNAUTHORIZED_ERROR,
    AuthError,
)
from dara.core.auth.oidc.config import OIDCAuthConfig
from dara.core.auth.oidc.definitions import REFRESH_TOKEN_COOKIE_NAME, OIDCDiscoveryMetadata
from dara.core.auth.oidc.settings import get_oidc_settings
from dara.core.configuration import ConfigurationBuilder
from dara.core.internal.settings import get_settings
from dara.core.main import _start_application

os.environ['DARA_DOCKER_MODE'] = 'TRUE'

pytestmark = pytest.mark.anyio

TEST_JWT_SECRET = 'd6446c35450e31c4d0b48351c0423bf9'
TEST_SSO_ISSUER_URL = 'http://test-identity-provider.causalens.dev/'
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

# Sample ES256 key
MOCK_JWK = {
    'alg': 'ES256',
    'kty': 'EC',
    'crv': 'P-256',
    'x': 'SVqB4JcUD6lsfvqMr-OKUNUphdNn64Eay60978ZlL74',
    'y': 'lf0u0pMj4lGAzZix5u4Cm5CMQIgMNpkwy163wtKYVKI',
    'd': '0g5vAEKzugrXaRbgKG0Tj2qJ5lMP4Bezds1_sTybkfk',
    'kid': 'NEE1QURBOTM4MzI5RkFDNTYxOTU1MDg2ODgwQ0UzMTk1QjYyRkRFQw',
}
MOCK_JWKS_DATA = {'keys': [MOCK_JWK]}

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
    issuer='http://test-identity-provider.com/api/authentication',
    authorization_endpoint='http://test-identity-provider.com/api/authentication/authenticate',
    token_endpoint='http://test-identity-provider.com/api/authentication/token',
    jwks_uri='http://test-identity-provider.com/api/authentication/keys',
    registration_endpoint='http://test-identity-provider.com/api/authentication/register',
    response_types_supported=['code', 'id_token', 'token id_token'],
    token_endpoint_auth_methods_supported=['client_secret_post', 'client_secret_basic'],
    id_token_signing_alg_values_supported=['ES256'],
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


async def test_config_parses_groups():
    """
    Test that OIDCAuthConfig parses groups correctly
    """
    sso_config = make_config()
    assert len(sso_config.allowed_groups) == 2
    assert 'dev' in sso_config.allowed_groups
    assert 'test' in sso_config.allowed_groups


def parse_url(url: str) -> tuple[str, dict]:
    """
    Parse redirect uri extracting state from it
    Returns (clean redirect_uri, query params)
    """
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    return parsed.path, query


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

        state = auth_config.generate_state()
        expected_url, expected_query = parse_url(auth_config.get_authorization_url(state))
        received_url, received_query = parse_url(response.json()['redirect_uri'])

        assert expected_url == received_url
        # check query is the same except the state since we generate a new one
        for key in expected_query.keys():
            if key == 'state':
                continue
            assert expected_query[key] == received_query[key]

        # check generated state is valid, i.e. it's a jwt that can be decoded
        received_state_object = auth_config.verify_state(received_query['state'][0])
        assert received_state_object.redirect_to is None
        assert received_state_object.nonce is not None
        assert received_state_object.iat is not None
        assert received_state_object.exp is not None


async def test_session_with_state():
    """
    Check that /session returns redirect uri with state
    """
    config = ConfigurationBuilder()

    auth_config = make_config()
    config.add_auth(auth_config)

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/session', json={'redirect_to': 'https://localhost:8000/test'})

        state = auth_config.generate_state('https://localhost:8000/test')
        expected_url, expected_query = parse_url(auth_config.get_authorization_url(state))
        received_url, received_query = parse_url(response.json()['redirect_uri'])

        assert expected_url == received_url
        # check query is the same except the state since we generate a new one
        for key in expected_query.keys():
            if key == 'state':
                continue
            assert expected_query[key] == received_query[key]

        # check generated state is valid, i.e. it's a jwt that can be decoded
        received_state_object = auth_config.verify_state(received_query['state'][0])
        assert received_state_object.redirect_to == 'https://localhost:8000/test'
        assert received_state_object.nonce is not None
        assert received_state_object.iat is not None
        assert received_state_object.exp is not None


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
            jwk = PyJWK(MOCK_JWK)
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

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})
            assert response.status_code == 200

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            # Check that the refresh token is added as a cookie
            assert 'set-cookie' in response.headers
            assert response.headers['set-cookie'].startswith(f'dara_refresh_token={mock_idp_response["refresh_token"]}')

            session_token = response.json()['token']
            decoded_session_token = jwt.decode(session_token, ENV_OVERRIDE['JWT_SECRET'], algorithms=[JWT_ALGO])

            assert decoded_session_token.get('identity_id') == MOCK_ID_TOKEN.get('identity').get('id')
            assert decoded_session_token.get('identity_name') == MOCK_ID_TOKEN.get('identity').get('name')
            assert decoded_session_token.get('identity_email') == MOCK_ID_TOKEN.get('identity').get('email')
            assert decoded_session_token.get('id_token') == id_token
            assert decoded_session_token.get('exp') == MOCK_ID_TOKEN.get('exp')
            assert 'session_id' in decoded_session_token


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

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})

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
                jwk = PyJWK(MOCK_JWK)
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

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})

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
                jwk = PyJWK(MOCK_JWK)
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

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})

                # JWKS endpoint should have been called once to retrieve the key
                assert mock_urllib.call_count == 1

                # 200 because identity matches
                assert response.status_code == 200


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

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})

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

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            # 401 - expired
            assert response.status_code == 401
            assert response.json()['detail'] == EXPIRED_TOKEN_ERROR


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
            mock_idp_response = {'error': 'invalid_client', 'error_description': 'No client credentials found.'}

            respx.post(auth_config.discovery.token_endpoint).mock(
                return_value=httpx.Response(status_code=401, json=mock_idp_response)
            )

            response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})

            # JWKS endpoint should not have been called, request should've failed before that point
            assert mock_urllib.call_count == 0

            # 401 - invalid/expired token
            assert response.status_code == 401
            assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider authorization failed')


async def test_refresh_token_creates_valid_session_token():
    """
    Test that /refresh-token correctly builds up a JWT session token
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

            response = await client.post(
                '/api/auth/refresh-token',
                cookies={'dara_refresh_token': old_refresh_token_mock},
                headers={'Authorization': f'Bearer {MOCK_DARA_TOKEN}'},
            )

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            # Check that the refresh token is added as a cookie
            assert 'set-cookie' in response.headers
            assert response.headers['set-cookie'].startswith(f'dara_refresh_token={mock_idp_response["refresh_token"]}')

            session_token = response.json()['token']
            decoded_session_token = jwt.decode(session_token, ENV_OVERRIDE['JWT_SECRET'], algorithms=[JWT_ALGO])

            assert decoded_session_token.get('identity_id') == MOCK_ID_TOKEN.get('identity').get('id')
            assert decoded_session_token.get('identity_name') == MOCK_ID_TOKEN.get('identity').get('name')
            assert decoded_session_token.get('identity_email') == MOCK_ID_TOKEN.get('identity').get('email')
            assert decoded_session_token.get('id_token') == id_token
            # Session ID should be transferred over
            assert decoded_session_token.get('session_id') == MOCK_DARA_TOKEN_DATA.get('session_id')
            assert decoded_session_token.get('exp') == MOCK_ID_TOKEN.get('exp')


async def test_refresh_token_invalid_group():
    """
    Test that /refresh-token returns 403 when group is not allowed
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

            response = await client.post(
                '/api/auth/refresh-token',
                cookies={REFRESH_TOKEN_COOKIE_NAME: old_refresh_token_mock},
                headers={'Authorization': f'Bearer {MOCK_DARA_TOKEN}'},
            )

            # JWKS endpoint should have been called once to retrieve the key
            assert mock_urllib.call_count == 1

            # 403 because no intersection between id_token groups and allowed groups
            assert response.status_code == 403
            assert response.json()['detail'] == UNAUTHORIZED_ERROR
            assert response.headers['set-cookie'].startswith(f'{REFRESH_TOKEN_COOKIE_NAME}="";')


async def test_refresh_token_idp_error():
    """
    Make sure /refresh-token returns 401 if IDP authorisation fails
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

            response = await client.post(
                '/api/auth/refresh-token',
                cookies={REFRESH_TOKEN_COOKIE_NAME: str(uuid4())},
                headers={'Authorization': f'Bearer {MOCK_DARA_TOKEN}'},
            )

            # JWKS endpoint should not have been called, request should've failed before that point
            assert mock_urllib.call_count == 0

            # 401 - invalid/expired token
            assert response.status_code == 401
            assert response.json()['detail'] == OTHER_AUTH_ERROR('Identity provider authorization failed')
            assert response.headers['set-cookie'].startswith(f'{REFRESH_TOKEN_COOKIE_NAME}="";')


async def test_verify_token_expired():
    """
    Test SSO token verification fails if session token is expired
    """
    token_data = {
        'session_id': 'SESSION_ID',
        'exp': (datetime.now(tz=timezone.utc) - timedelta(hours=2)).timestamp(),
        'identity_id': 'PERSONA_ID',
        'identity_name': 'USERNAME',
        'identity_email': 'username@causalens.com',
    }
    session_token = jwt.encode(
        token_data,
        get_settings().jwt_secret,
        algorithm=JWT_ALGO,
    )

    auth_config = make_config()

    # AuthError expected due to expired token
    with pytest.raises(AuthError):
        auth_config.verify_token(session_token)


async def test_verify_token_decodes_correctly():
    """
    Test SSO token verification decodes correctly
    """
    token_data = {
        'session_id': 'SESSION_ID',
        'exp': (datetime.now(tz=timezone.utc) + timedelta(hours=2)),
        'identity_id': 'PERSONA_ID',
        'identity_name': 'USERNAME',
        'identity_email': 'username@causalens.com',
        'groups': ['dev'],
    }
    session_token = jwt.encode(
        token_data,
        get_settings().jwt_secret,
        algorithm=JWT_ALGO,
    )

    auth_config = make_config()

    decoded_token = auth_config.verify_token(session_token)

    for k in token_data.keys():
        if k == 'exp':
            # For exp there might be microseconds of difference due to parsing etc so just check it's within the same second
            assert token_data[k] - datetime.fromtimestamp(getattr(decoded_token, k), tz=timezone.utc) < timedelta(
                seconds=1
            )
            continue

        assert getattr(decoded_token, k) == token_data[k]


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

    with mocked_urllib(MOCK_JWKS_DATA) as mock_urllib:
        decoded_token = auth_config.verify_token(id_token)
        assert decoded_token.identity_id == MOCK_ID_TOKEN.get('identity').get('id')
        assert decoded_token.identity_name == MOCK_ID_TOKEN.get('identity').get('name')
        assert decoded_token.identity_email == MOCK_ID_TOKEN.get('identity').get('email')
        assert decoded_token.id_token == id_token
        assert decoded_token.exp == MOCK_ID_TOKEN.get('exp')


async def test_revoke_session():
    """
    Test that in SSO mode revoke session returns a redirect_uri and deletes the refresh token cookie
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

            response = await client.post(
                '/api/auth/revoke-session',
                headers={'Authorization': f'Bearer {encoded_test_token}'},
            )

            assert response.status_code == 200
            assert response.json()['redirect_uri'] == auth_config.get_logout_url(id_token)
            assert response.headers['Set-Cookie'].startswith(f'{REFRESH_TOKEN_COOKIE_NAME}=""; expires')
            assert 'Max-Age=0' in response.headers['Set-Cookie']


async def test_revoke_session_raw_id_token():
    """
    Test that revoke session works in SSO mode also when a raw ID token is used
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
            assert response.headers['Set-Cookie'].startswith(f'{REFRESH_TOKEN_COOKIE_NAME}=""; expires')
            assert 'Max-Age=0' in response.headers['Set-Cookie']


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
                'exp': (datetime.now(tz=timezone.utc) - timedelta(hours=2)),
                'identity_id': 'PERSONA_ID',
                'identity_name': 'USERNAME',
                'identity_email': 'joe@causalens.com',
                'groups': [],
                'id_token': id_token,
            }
            encoded_test_token = jwt.encode(test_token, ENV_OVERRIDE['JWT_SECRET'], algorithm=JWT_ALGO)

            response = await client.post(
                '/api/auth/revoke-session',
                headers={'Authorization': f'Bearer {encoded_test_token}'},
            )

            assert response.status_code == 200
            assert response.json()['redirect_uri'] == auth_config.get_logout_url(id_token)
            assert response.headers['Set-Cookie'].startswith(f'{REFRESH_TOKEN_COOKIE_NAME}=""; expires')
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
    issuer='http://test-identity-provider.com/api/authentication',
    authorization_endpoint='http://test-identity-provider.com/api/authentication/authenticate',
    token_endpoint='http://test-identity-provider.com/api/authentication/token',
    jwks_uri='http://test-identity-provider.com/api/authentication/keys',
    registration_endpoint='http://test-identity-provider.com/api/authentication/register',
    response_types_supported=['code', 'id_token', 'token id_token'],
    token_endpoint_auth_methods_supported=['client_secret_post', 'client_secret_basic'],
    id_token_signing_alg_values_supported=['ES256'],
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
                jwk = PyJWK(MOCK_JWK)
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

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})
                assert response.status_code == 200

                # JWKS endpoint should have been called once to retrieve the key
                assert mock_urllib.call_count == 1

                session_token = response.json()['token']
                decoded_session_token = jwt.decode(session_token, ENV_OVERRIDE['JWT_SECRET'], algorithms=[JWT_ALGO])

                # User data should come from userinfo, not id_token
                assert decoded_session_token.get('identity_name') == MOCK_USERINFO['name']
                assert decoded_session_token.get('identity_email') == MOCK_USERINFO['email']
                # Groups should come from userinfo
                assert decoded_session_token.get('groups') == MOCK_USERINFO['groups']


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
                jwk = PyJWK(MOCK_JWK)
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

                # Mock the userinfo endpoint - should NOT be called
                userinfo_route = respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint).mock(
                    return_value=httpx.Response(status_code=200, json=MOCK_USERINFO)
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})
                assert response.status_code == 200

                # Userinfo endpoint should NOT have been called
                assert userinfo_route.call_count == 0

                session_token = response.json()['token']
                decoded_session_token = jwt.decode(session_token, ENV_OVERRIDE['JWT_SECRET'], algorithms=[JWT_ALGO])

                # User data should come from id_token (identity claim), not userinfo
                assert decoded_session_token.get('identity_name') == MOCK_ID_TOKEN['identity']['name']
                assert decoded_session_token.get('identity_email') == MOCK_ID_TOKEN['identity']['email']
                assert decoded_session_token.get('groups') == MOCK_ID_TOKEN['groups']


async def test_sso_callback_userinfo_failure_continues(mock_discovery_with_userinfo):
    """
    Test that /sso-callback continues with id_token data if userinfo fetch fails
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

                # Mock the userinfo endpoint to fail
                respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint).mock(
                    return_value=httpx.Response(status_code=500, json={'error': 'Internal Server Error'})
                )

                response = await client.post('/api/auth/sso-callback', json={'auth_code': 'TEST'})
                # Should still succeed
                assert response.status_code == 200

                session_token = response.json()['token']
                decoded_session_token = jwt.decode(session_token, ENV_OVERRIDE['JWT_SECRET'], algorithms=[JWT_ALGO])

                # User data should fall back to id_token data
                assert decoded_session_token.get('identity_name') == MOCK_ID_TOKEN['identity']['name']
                assert decoded_session_token.get('identity_email') == MOCK_ID_TOKEN['identity']['email']
                assert decoded_session_token.get('groups') == MOCK_ID_TOKEN['groups']


async def test_refresh_token_with_userinfo(mock_discovery_with_userinfo):
    """
    Test that /refresh-token fetches and uses userinfo when SSO_USE_USERINFO is enabled
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

                response = await client.post(
                    '/api/auth/refresh-token',
                    cookies={'dara_refresh_token': old_refresh_token_mock},
                    headers={'Authorization': f'Bearer {MOCK_DARA_TOKEN}'},
                )

                assert response.status_code == 200

                session_token = response.json()['token']
                decoded_session_token = jwt.decode(session_token, ENV_OVERRIDE['JWT_SECRET'], algorithms=[JWT_ALGO])

                # User data should come from userinfo
                assert decoded_session_token.get('identity_name') == MOCK_USERINFO['name']
                assert decoded_session_token.get('identity_email') == MOCK_USERINFO['email']
                assert decoded_session_token.get('groups') == MOCK_USERINFO['groups']
                # Session ID should be preserved from old token
                assert decoded_session_token.get('session_id') == MOCK_DARA_TOKEN_DATA.get('session_id')
