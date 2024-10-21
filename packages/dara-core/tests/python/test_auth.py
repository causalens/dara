import datetime

import jwt
import pytest
from async_asgi_testclient import TestClient as AsyncClient

from dara.core.auth.basic import BasicAuthConfig, MultiBasicAuthConfig
from dara.core.auth.definitions import ID_TOKEN, JWT_ALGO, SESSION_ID, TokenData
from dara.core.configuration import ConfigurationBuilder
from dara.core.http import get
from dara.core.main import _start_application

from tests.python.utils import (
    TEST_JWT_SECRET,
    TEST_TOKEN,
    _async_ws_connect,
    get_ws_messages,
)

pytestmark = pytest.mark.anyio


async def test_verify_session():
    """Check that verify session validates token correctly"""

    # authenticated with verify_session by default
    @get('test-ext/test')
    def handle():
        return {'test': 'test'}

    builder = ConfigurationBuilder()

    builder.add_endpoint(handle)

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        # Create a couple of JWTs to use
        token = jwt.encode(
            TokenData(
                identity_name='user',
                session_id='token1',
                exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
            ).dict(),
            TEST_JWT_SECRET,
            algorithm=JWT_ALGO,
        )
        invalid_token = 'garbage'

        # Test valid request
        response = await client.get('/api/test-ext/test', headers={'Authorization': f'Bearer {token}'})
        assert response.status_code == 200
        assert response.json() == {'test': 'test'}

        # Test no auth
        response = await client.get('/api/test-ext/test')
        assert response.status_code == 400

        # Test wrong scheme
        response = await client.get('/api/test-ext/test', headers={'Authorization': f'Basic user:pw'})
        assert response.status_code == 400

        # Test invalid token
        response = await client.get('/api/test-ext/test', headers={'Authorization': f'Bearer {invalid_token}'})
        assert response.status_code == 401


async def test_basic_auth():

    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:

        # This should work
        response = await client.post('/api/auth/session', json={'username': 'test', 'password': 'test'})
        assert response.status_code == 200

        # This should fail
        response = await client.post('/api/auth/session', json={'username': 'test', 'password': 'wrong'})
        assert response.status_code == 401


async def test_multi_basic_auth():

    config = ConfigurationBuilder()
    config.add_auth(MultiBasicAuthConfig({'test': 'test', 'cl': 'pass'}))

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:

        # This should work
        response = await client.post('/api/auth/session', json={'username': 'test', 'password': 'test'})
        assert response.status_code == 200

        # This should work
        response = await client.post('/api/auth/session', json={'username': 'cl', 'password': 'pass'})
        assert response.status_code == 200

        # This should fail
        response = await client.post('/api/auth/session', json={'username': 'cl', 'password': 'test'})
        assert response.status_code == 401

        # This should fail
        response = await client.post('/api/auth/session', json={'username': 'test', 'password': 'pass'})
        assert response.status_code == 401


async def test_refresh_token_missing():
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {TEST_TOKEN}'},
        )
        assert response.status_code == 400
        assert response.json()['detail']['message'] == 'No refresh token provided'


async def test_refresh_token_unsupported():
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'foobar'},
            headers={'Authorization': f'Bearer {TEST_TOKEN}'},
        )
        assert response.status_code == 400
        assert response.json() == {'detail': 'Auth config BasicAuthConfig does not support token refresh'}


async def test_refresh_token_success():
    config = ConfigurationBuilder()

    old_token_data = TokenData(
        session_id='session',
        # expired but should be ignored
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    class TestAuthConfig(BasicAuthConfig):
        def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            return f'session_token_{old_token.session_id}', 'new_refresh_token'

    config.add_auth(TestAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        assert response.status_code == 200
        assert response.json() == {'token': f'session_token_{old_token_data.session_id}'}
        assert response.cookies['dara_refresh_token'] == 'new_refresh_token'


async def test_refresh_token_expired():
    config = ConfigurationBuilder()

    class TestAuthConfig(BasicAuthConfig):
        def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            raise jwt.ExpiredSignatureError()

    config.add_auth(TestAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'refresh_token'},
            headers={'Authorization': f'Bearer {TEST_TOKEN}'},
        )
        assert response.status_code == 401
        assert 'Session has expired' in response.json()['detail']['message']
        assert response.headers.get('Set-Cookie').startswith('dara_refresh_token="";')


async def test_refresh_token_error():
    config = ConfigurationBuilder()

    class TestAuthConfig(BasicAuthConfig):
        def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            raise Exception('some error')

    config.add_auth(TestAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'refresh_token'},
            headers={'Authorization': f'Bearer {TEST_TOKEN}'},
        )
        assert response.status_code == 401
        # generic error shown
        assert 'Token is invalid' in response.json()['detail']['message']
        assert response.headers.get('Set-Cookie').startswith('dara_refresh_token="";')


async def test_refresh_token_live_ws_connection():
    """
    Test that refreshing a token with a live WS connection can update the connection context
    """
    config = ConfigurationBuilder()

    old_token_data = TokenData(
        session_id='session_1',
        # expired but should be ignored
        exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=3),
        identity_name='user',
        id_token='OLD_TOKEN',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    class TestAuthConfig(BasicAuthConfig):
        def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            return (
                jwt.encode(
                    TokenData(
                        session_id=old_token.session_id,
                        exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
                        identity_name=old_token.identity_name,
                        id_token='NEW_TOKEN',
                    ).dict(),
                    TEST_JWT_SECRET,
                    algorithm=JWT_ALGO,
                ),
                'new_refresh_token',
            )

    config.add_auth(TestAuthConfig('test', 'test'))

    # Register a handler to check the current value of the auth context in the WS context
    async def get_context(chan, msg):
        return {'id_token': ID_TOKEN.get(), 'session_id': SESSION_ID.get()}

    config.add_ws_handler('get_context', get_context)

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        # create two WS connections
        async with _async_ws_connect(client, token=old_token) as ws1:
            # check initial ws1 context
            chan1 = await ws1.receive_json()
            await ws1.send_json({'type': 'custom', 'message': {'kind': 'get_context', 'data': None}})
            ws1_message = await ws1.receive_json()
            assert ws1_message['message']['data'] == {'id_token': 'OLD_TOKEN', 'session_id': 'session_1'}

            async with _async_ws_connect(client, token=old_token) as ws2:
                # check initial ws2 context
                chan2 = await ws2.receive_json()
                await ws2.send_json({'type': 'custom', 'message': {'kind': 'get_context', 'data': None}})
                ws2_message = await ws2.receive_json()
                assert ws2_message['message']['data'] == {
                    'id_token': 'OLD_TOKEN',
                    'session_id': 'session_1',
                }

                # Refresh token for ws1
                response = await client.post(
                    '/api/auth/refresh-token',
                    cookies={'dara_refresh_token': 'refresh_token'},
                    headers={'Authorization': f'Bearer {old_token}'},
                )
                assert response.status_code == 200
                assert response.cookies['dara_refresh_token'] == 'new_refresh_token'

                # Check that the ID token has been updated for both ws but session stays the same
                await ws1.send_json({'type': 'custom', 'message': {'kind': 'get_context', 'data': None}})
                ws1_updated_message = await ws1.receive_json()
                assert ws1_updated_message['message']['data'] == {'id_token': 'NEW_TOKEN', 'session_id': 'session_1'}

                # ws2 should be unchanged
                await ws2.send_json({'type': 'custom', 'message': {'kind': 'get_context', 'data': None}})
                ws2_updated_message = await ws2.receive_json()
                assert ws2_updated_message['message']['data'] == {'id_token': 'NEW_TOKEN', 'session_id': 'session_1'}
