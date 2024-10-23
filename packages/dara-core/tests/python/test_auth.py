import asyncio
import datetime
import time

import jwt
import pytest
from async_asgi_testclient import TestClient as AsyncClient

from dara.core.auth.basic import BasicAuthConfig, MultiBasicAuthConfig
from dara.core.auth.definitions import ID_TOKEN, JWT_ALGO, SESSION_ID, TokenData
from dara.core.auth.utils import token_refresh_cache
from dara.core.configuration import ConfigurationBuilder
from dara.core.http import get
from dara.core.main import _start_application

from tests.python.utils import TEST_JWT_SECRET, TEST_TOKEN, _async_ws_connect

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def clear_cache():
    yield
    token_refresh_cache.clear()


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

            # Refresh token for ws1
            response = await client.post(
                '/api/auth/refresh-token',
                cookies={'dara_refresh_token': 'refresh_token'},
                headers={'Authorization': f'Bearer {old_token}'},
            )
            assert response.status_code == 200
            assert response.cookies['dara_refresh_token'] == 'new_refresh_token'

            # token in the WS connection should still be old
            await ws1.send_json({'type': 'custom', 'message': {'kind': 'get_context', 'data': None}})
            ws1_message = await ws1.receive_json()
            assert ws1_message['message']['data'] == {'id_token': 'OLD_TOKEN', 'session_id': 'session_1'}

            # Now imitate client notifying the backend that the token has been updated
            await ws1.send_json({'type': 'token_update', 'message': response.json()['token']})

            # Check that the ID token has been updated but session stays the same
            await ws1.send_json({'type': 'custom', 'message': {'kind': 'get_context', 'data': None}})
            ws1_updated_message = await ws1.receive_json()
            assert ws1_updated_message['message']['data'] == {'id_token': 'NEW_TOKEN', 'session_id': 'session_1'}


async def test_refresh_token_concurrent_requests():
    """Test that concurrent requests with the same refresh token return the same result"""
    config = ConfigurationBuilder()
    refresh_count = 0

    class ConcurrentTestAuthConfig(BasicAuthConfig):
        def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            nonlocal refresh_count
            # Add a small delay to simulate work and increase chance of concurrent access
            time.sleep(0.1)
            refresh_count += 1
            return f'session_token_{refresh_count}', f'refresh_token_{refresh_count}'

    config.add_auth(ConcurrentTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    async def make_request(client):
        return await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'same_refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )

    async with AsyncClient(app) as client:
        # Make 3 concurrent requests
        responses = await asyncio.gather(make_request(client), make_request(client), make_request(client))

        # All responses should be successful
        assert all(r.status_code == 200 for r in responses)

        # All responses should have the same token (from cache)
        tokens = [r.json()['token'] for r in responses]
        assert all(token == tokens[0] for token in tokens)

        # All responses should have the same refresh token
        refresh_tokens = [r.cookies['dara_refresh_token'] for r in responses]
        assert all(rt == refresh_tokens[0] for rt in refresh_tokens)

        # Only one actual refresh should have occurred
        assert refresh_count == 1


async def test_refresh_token_cache_expiration():
    """Test that cache expires after TTL and new tokens are generated"""
    config = ConfigurationBuilder()
    refresh_count = 0

    class ExpirationTestAuthConfig(BasicAuthConfig):
        def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            nonlocal refresh_count
            refresh_count += 1
            return f'session_token_{refresh_count}', f'refresh_token_{refresh_count}'

    config.add_auth(ExpirationTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    async with AsyncClient(app) as client:
        # First request
        response1 = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'test_refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        token1 = response1.json()['token']

        # Immediate second request should use cache
        response2 = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'test_refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        token2 = response2.json()['token']

        assert token1 == token2
        assert refresh_count == 1

        # Wait for cache to expire (6 seconds to be safe)
        await asyncio.sleep(6)

        # Third request should get new tokens
        response3 = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'test_refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        token3 = response3.json()['token']

        assert token3 != token1
        assert refresh_count == 2


async def test_refresh_token_different_tokens_not_cached():
    """Test that requests with different refresh tokens don't share cache"""
    config = ConfigurationBuilder()
    refresh_count = 0

    class DifferentTokenTestAuthConfig(BasicAuthConfig):
        def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            nonlocal refresh_count
            refresh_count += 1
            return f'session_token_{refresh_token}_{refresh_count}', f'refresh_token_{refresh_count}'

    config.add_auth(DifferentTokenTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    async with AsyncClient(app) as client:
        # Make concurrent requests with different refresh tokens
        responses = await asyncio.gather(
            client.post(
                '/api/auth/refresh-token',
                cookies={'dara_refresh_token': 'refresh_token_1'},
                headers={'Authorization': f'Bearer {old_token}'},
            ),
            client.post(
                '/api/auth/refresh-token',
                cookies={'dara_refresh_token': 'refresh_token_2'},
                headers={'Authorization': f'Bearer {old_token}'},
            ),
        )

        # Both requests should succeed
        assert all(r.status_code == 200 for r in responses)

        # Should get different tokens for different refresh tokens
        tokens = [r.json()['token'] for r in responses]
        assert tokens[0] != tokens[1]

        # Should have made two refreshes
        assert refresh_count == 2


async def test_refresh_token_error_not_cached():
    """Test that failed refresh attempts are not cached"""
    config = ConfigurationBuilder()
    error_count = 0
    success_count = 0

    class ErrorTestAuthConfig(BasicAuthConfig):
        def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            nonlocal error_count, success_count
            if error_count < 1:  # First call fails
                error_count += 1
                raise Exception('some error')
            success_count += 1
            return f'session_token_{success_count}', f'refresh_token_{success_count}'

    config.add_auth(ErrorTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    async with AsyncClient(app) as client:
        # First request should fail
        response1 = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'test_refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        assert response1.status_code == 401
        assert 'Token is invalid' in response1.json()['detail']['message']

        # Immediate second request should succeed (not using error cache)
        response2 = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'test_refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        assert response2.status_code == 200
        assert success_count == 1
