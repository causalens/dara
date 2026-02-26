import asyncio
import datetime
import time

import jwt
import pytest
from async_asgi_testclient import TestClient as AsyncClient
from fastapi import Request

from dara.core.auth.basic import BasicAuthConfig, MultiBasicAuthConfig
from dara.core.auth.definitions import ID_TOKEN, JWT_ALGO, SESSION_ID, SESSION_TOKEN_COOKIE_NAME, TokenData
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


def _make_refreshed_session_token(old_token: TokenData, marker: str) -> str:
    return jwt.encode(
        TokenData(
            session_id=old_token.session_id,
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
            identity_name=old_token.identity_name,
            identity_id=old_token.identity_id,
            id_token=marker,
        ).dict(),
        TEST_JWT_SECRET,
        algorithm=JWT_ALGO,
    )


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
                identity_id='user',
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
        response = await client.get('/api/test-ext/test', headers={'Authorization': 'Basic user:pw'})
        assert response.status_code == 400

        # Test invalid token
        response = await client.get('/api/test-ext/test', headers={'Authorization': f'Bearer {invalid_token}'})
        assert response.status_code == 401


async def test_verify_session_cookie():
    """Check that verify session accepts a session token cookie without Authorization header"""

    # authenticated with verify_session by default
    @get('test-ext/test')
    def handle():
        return {'test': 'test'}

    builder = ConfigurationBuilder()
    builder.add_endpoint(handle)

    app = _start_application(builder._to_configuration())

    token = jwt.encode(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='token1',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        ).dict(),
        TEST_JWT_SECRET,
        algorithm=JWT_ALGO,
    )

    async with AsyncClient(app) as client:
        response = await client.get('/api/test-ext/test', cookies={SESSION_TOKEN_COOKIE_NAME: token})
        assert response.status_code == 200
        assert response.json() == {'test': 'test'}


async def test_authorization_header_injected_from_session_cookie():
    """Check that a missing Authorization header is synthesized from the session cookie"""

    @get('test-ext/auth-header')
    def handle(request: Request):
        return {'authorization': request.headers.get('Authorization')}

    builder = ConfigurationBuilder()
    builder.add_endpoint(handle)
    app = _start_application(builder._to_configuration())

    token = jwt.encode(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='token1',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        ).dict(),
        TEST_JWT_SECRET,
        algorithm=JWT_ALGO,
    )

    async with AsyncClient(app) as client:
        response = await client.get('/api/test-ext/auth-header', cookies={SESSION_TOKEN_COOKIE_NAME: token})
        assert response.status_code == 200
        assert response.json() == {'authorization': f'Bearer {token}'}


async def test_authorization_header_not_overwritten_by_session_cookie():
    """Check that an explicit Authorization header is preserved when session cookie is present"""

    @get('test-ext/auth-header')
    def handle(request: Request):
        return {'authorization': request.headers.get('Authorization')}

    builder = ConfigurationBuilder()
    builder.add_endpoint(handle)
    app = _start_application(builder._to_configuration())

    cookie_token = jwt.encode(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='cookie-token',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        ).dict(),
        TEST_JWT_SECRET,
        algorithm=JWT_ALGO,
    )
    header_token = jwt.encode(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='header-token',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        ).dict(),
        TEST_JWT_SECRET,
        algorithm=JWT_ALGO,
    )

    async with AsyncClient(app) as client:
        response = await client.get(
            '/api/test-ext/auth-header',
            cookies={SESSION_TOKEN_COOKIE_NAME: cookie_token},
            headers={'Authorization': f'Bearer {header_token}'},
        )
        assert response.status_code == 200
        assert response.json() == {'authorization': f'Bearer {header_token}'}


async def test_revoke_session_cookie():
    """Check that revoke session accepts a session token cookie and clears it"""

    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    token = jwt.encode(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='token1',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        ).dict(),
        TEST_JWT_SECRET,
        algorithm=JWT_ALGO,
    )

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/revoke-session', cookies={SESSION_TOKEN_COOKIE_NAME: token})
        assert response.status_code == 200
        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith('dara_refresh_token="";') for cookie in cleared_cookies)
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


async def test_basic_auth():
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:
        # This should work
        response = await client.post('/api/auth/session', json={'username': 'test', 'password': 'test'})
        assert response.status_code == 200
        set_cookie = response.headers.get('set-cookie', '')
        assert 'Max-Age=' in set_cookie
        assert 'expires=' in set_cookie.lower()

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
        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith('dara_refresh_token="";') for cookie in cleared_cookies)
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


async def test_refresh_token_missing_with_stale_session_cookie_clears_auth_cookies():
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={SESSION_TOKEN_COOKIE_NAME: 'stale-token'},
        )
        assert response.status_code == 400
        assert response.json()['detail']['message'] == 'No refresh token provided'
        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith('dara_refresh_token="";') for cookie in cleared_cookies)
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


async def test_stale_session_cookie_recovers_after_refresh_attempt():
    """
    Regression test for stale/non-JWT session cookie recovery:
    verify-session fails, then refresh-token clears auth cookies.
    """
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        stale_cookie = 'stale-token'

        verify_response = await client.post(
            '/api/auth/verify-session',
            cookies={SESSION_TOKEN_COOKIE_NAME: stale_cookie},
        )
        assert verify_response.status_code == 401

        refresh_response = await client.post(
            '/api/auth/refresh-token',
            cookies={SESSION_TOKEN_COOKIE_NAME: stale_cookie},
        )
        assert refresh_response.status_code == 400
        assert refresh_response.json()['detail']['message'] == 'No refresh token provided'
        cleared_cookies = refresh_response.headers.getall('set-cookie')
        assert any(cookie.startswith('dara_refresh_token="";') for cookie in cleared_cookies)
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)

        # Cookie jar should no longer contain stale auth cookies after refresh response.
        followup_verify_response = await client.post('/api/auth/verify-session')
        assert followup_verify_response.status_code == 400
        assert followup_verify_response.json()['detail']['message'] == 'No auth credentials passed'


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
        identity_id='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    class TestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            return _make_refreshed_session_token(old_token, 'refresh_success'), 'new_refresh_token'

    config.add_auth(TestAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        assert response.status_code == 200
        assert response.json() == {'success': True}
        refreshed_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
        decoded = jwt.decode(refreshed_token, TEST_JWT_SECRET, algorithms=[JWT_ALGO])
        assert decoded['session_id'] == old_token_data.session_id
        assert response.cookies['dara_refresh_token'] == 'new_refresh_token'
        set_cookies = response.headers.getall('set-cookie')
        session_cookie = next(
            (cookie for cookie in set_cookies if cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}=')), None
        )
        assert session_cookie is not None
        assert 'Max-Age=' in session_cookie
        assert 'expires=' in session_cookie.lower()


async def test_refresh_token_success_with_session_cookie():
    """Check refresh token flow supports session cookie when Authorization header is missing"""

    config = ConfigurationBuilder()

    old_token_data = TokenData(
        session_id='session',
        # expired but should be ignored
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
        identity_id='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    class TestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            return _make_refreshed_session_token(old_token, 'refresh_success_cookie'), 'new_refresh_token'

    config.add_auth(TestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={
                'dara_refresh_token': 'refresh_token',
                SESSION_TOKEN_COOKIE_NAME: old_token,
            },
        )
        assert response.status_code == 200
        assert response.json() == {'success': True}
        refreshed_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
        decoded = jwt.decode(refreshed_token, TEST_JWT_SECRET, algorithms=[JWT_ALGO])
        assert decoded['session_id'] == old_token_data.session_id
        assert response.cookies['dara_refresh_token'] == 'new_refresh_token'


async def test_refresh_token_expired():
    config = ConfigurationBuilder()

    class TestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
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
        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith('dara_refresh_token="";') for cookie in cleared_cookies)
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


async def test_refresh_token_error():
    config = ConfigurationBuilder()

    class TestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
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
        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith('dara_refresh_token="";') for cookie in cleared_cookies)
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


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
        identity_id='user',
        id_token='OLD_TOKEN',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    class TestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            return (
                jwt.encode(
                    TokenData(
                        session_id=old_token.session_id,
                        exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
                        identity_id=old_token.identity_name,
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

    async with AsyncClient(app) as client, _async_ws_connect(client, token=old_token) as ws1:
        # check initial ws1 context
        await ws1.receive_json()
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
        assert response.json() == {'success': True}
        assert response.cookies['dara_refresh_token'] == 'new_refresh_token'

        # token in the WS connection should be updated from server-side session auth state
        await ws1.send_json({'type': 'custom', 'message': {'kind': 'get_context', 'data': None}})
        ws1_message = await ws1.receive_json()
        assert ws1_message['message']['data'] == {'id_token': 'NEW_TOKEN', 'session_id': 'session_1'}


async def test_refresh_token_concurrent_requests():
    """Test that concurrent requests with the same refresh token return the same result"""
    config = ConfigurationBuilder()
    refresh_count = 0

    class ConcurrentTestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            nonlocal refresh_count
            # Add a small delay to simulate work and increase chance of concurrent access
            time.sleep(0.1)
            refresh_count += 1
            return _make_refreshed_session_token(
                old_token, f'concurrent_{refresh_count}'
            ), f'refresh_token_{refresh_count}'

    config.add_auth(ConcurrentTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
        identity_id='user',
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

        # All responses should have the same session cookie token (from cache)
        tokens = [r.cookies[SESSION_TOKEN_COOKIE_NAME] for r in responses]
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
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            nonlocal refresh_count
            refresh_count += 1
            return _make_refreshed_session_token(
                old_token, f'expiration_{refresh_count}'
            ), f'refresh_token_{refresh_count}'

    config.add_auth(ExpirationTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
        identity_id='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    async with AsyncClient(app) as client:
        # First request
        response1 = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'test_refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        token1 = response1.cookies[SESSION_TOKEN_COOKIE_NAME]

        # Immediate second request should use cache
        response2 = await client.post(
            '/api/auth/refresh-token',
            cookies={'dara_refresh_token': 'test_refresh_token'},
            headers={'Authorization': f'Bearer {old_token}'},
        )
        token2 = response2.cookies[SESSION_TOKEN_COOKIE_NAME]

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
        token3 = response3.cookies[SESSION_TOKEN_COOKIE_NAME]

        assert token3 != token1
        assert refresh_count == 2


async def test_refresh_token_different_tokens_not_cached():
    """Test that requests with different refresh tokens don't share cache"""
    config = ConfigurationBuilder()
    refresh_count = 0

    class DifferentTokenTestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            nonlocal refresh_count
            refresh_count += 1
            return (
                _make_refreshed_session_token(old_token, f'different_{refresh_token}_{refresh_count}'),
                f'refresh_token_{refresh_count}',
            )

    config.add_auth(DifferentTokenTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
        identity_id='user',
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
        tokens = [r.cookies[SESSION_TOKEN_COOKIE_NAME] for r in responses]
        assert tokens[0] != tokens[1]

        # Should have made two refreshes
        assert refresh_count == 2


async def test_refresh_token_error_not_cached():
    """Test that failed refresh attempts are not cached"""
    config = ConfigurationBuilder()
    error_count = 0
    success_count = 0

    class ErrorTestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            nonlocal error_count, success_count
            if error_count < 1:  # First call fails
                error_count += 1
                raise Exception('some error')
            success_count += 1
            return _make_refreshed_session_token(
                old_token, f'error_cache_{success_count}'
            ), f'refresh_token_{success_count}'

    config.add_auth(ErrorTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(days=1),
        identity_name='user',
        identity_id='user',
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
