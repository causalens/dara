import asyncio
import datetime
import logging
import time

import jwt
import pytest
from async_asgi_testclient import TestClient as AsyncClient
from fastapi import Request

from dara.core.auth.basic import BasicAuthConfig, MultiBasicAuthConfig
from dara.core.auth.definitions import (
    EXPIRED_TOKEN_ERROR,
    ID_TOKEN,
    JWT_ALGO,
    SESSION_ID,
    SESSION_TOKEN_COOKIE_NAME,
    TokenData,
)
from dara.core.auth.session_store import auth_session_store
from dara.core.auth.utils import token_refresh_cache
from dara.core.configuration import ConfigurationBuilder
from dara.core.http import get
from dara.core.main import _start_application

from tests.python.utils import TEST_JWT_SECRET, TEST_TOKEN, _async_ws_connect

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
async def clear_cache():
    await auth_session_store.clear()
    yield
    token_refresh_cache.clear()
    await auth_session_store.clear()


async def _get_stored_auth_token(session_token: str) -> tuple[str, TokenData]:
    stored_session = await auth_session_store.get(session_token)
    assert stored_session is not None
    return stored_session.auth_token, stored_session.token_data


async def _get_stored_refresh_token(session_token: str) -> str | None:
    stored_session = await auth_session_store.get(session_token)
    assert stored_session is not None
    return stored_session.refresh_token


async def _store_auth_session(token_data: TokenData, refresh_token: str | None = None) -> tuple[str, str]:
    raw_token = jwt.encode(token_data.model_dump(), TEST_JWT_SECRET, algorithm=JWT_ALGO)
    session_token = await auth_session_store.create(raw_token, token_data, refresh_token=refresh_token)
    return raw_token, session_token


def _get_log_content(caplog: pytest.LogCaptureFixture, title: str) -> dict:
    for record in reversed(caplog.records):
        if isinstance(record.msg, dict) and record.msg.get('title') == title:
            content = getattr(record, 'content', None)
            assert isinstance(content, dict)
            return content
    raise AssertionError(f'Log record not found: {title}')


async def _store_test_token(refresh_token: str | None = None) -> str:
    return await auth_session_store.create(
        TEST_TOKEN,
        TokenData(**jwt.decode(TEST_TOKEN, TEST_JWT_SECRET, algorithms=[JWT_ALGO])),
        refresh_token=refresh_token,
    )


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


def _make_refresh_token_with_expiry(days: int = 7) -> str:
    return jwt.encode(
        {
            'sub': 'refresh-user',
            'exp': datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=days),
        },
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
        _, session_token = await _store_auth_session(
            TokenData(
                identity_id='user',
                identity_name='user',
                session_id='token1',
                exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
            )
        )
        invalid_token = 'garbage'

        # Test valid request
        response = await client.get('/api/test-ext/test', headers={'Authorization': f'Bearer {session_token}'})
        assert response.status_code == 200
        assert response.json() == {'test': 'test'}

        # Test no auth
        response = await client.get('/api/test-ext/test')
        assert response.status_code == 401
        assert response.json()['detail'] == EXPIRED_TOKEN_ERROR

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

    _, session_token = await _store_auth_session(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='token1',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        )
    )

    async with AsyncClient(app) as client:
        response = await client.get('/api/test-ext/test', cookies={SESSION_TOKEN_COOKIE_NAME: session_token})
        assert response.status_code == 200
        assert response.json() == {'test': 'test'}


async def test_verify_session_invalid_cookie_clears_auth_cookies_without_refresh_token():
    """Check that /verify-session clears stale auth cookies when no refresh token is available."""

    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/verify-session',
            cookies={SESSION_TOKEN_COOKIE_NAME: 'stale-token'},
        )

        assert response.status_code == 401
        assert response.json()['detail']['message'] == 'Token is invalid, please log in again'

        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


async def test_verify_session_missing_auth_returns_unauthorized(caplog: pytest.LogCaptureFixture):
    """Check that missing auth credentials are treated as an auth failure, not a bad request."""

    caplog.set_level(logging.WARNING, logger='dara.dev')
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/verify-session')

        assert response.status_code == 401
        assert response.json()['detail'] == EXPIRED_TOKEN_ERROR

        log_content = _get_log_content(caplog, 'Auth session verification rejected')
        assert log_content['status_code'] == 401
        assert log_content['detail_reason'] == 'expired'
        assert log_content['has_authorization_header'] is False
        assert log_content['has_session_cookie'] is False


async def test_verify_session_invalid_scheme_logs_rejection(caplog: pytest.LogCaptureFixture):
    """Check that invalid auth schemes are logged with request context."""

    caplog.set_level(logging.WARNING, logger='dara.dev')
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/verify-session', headers={'Authorization': 'Basic user:pw'})

        assert response.status_code == 400

        log_content = _get_log_content(caplog, 'Auth session verification rejected')
        assert log_content['status_code'] == 400
        assert log_content['detail_reason'] == 'bad_request'
        assert log_content['authorization_scheme'] == 'Basic'
        assert log_content['has_authorization_header'] is True
        assert log_content['has_session_cookie'] is False


async def test_authorization_header_injected_from_session_cookie():
    """Check that a missing Authorization header is synthesized from the session cookie"""

    @get('test-ext/auth-header')
    def handle(request: Request):
        return {'authorization': request.headers.get('Authorization')}

    builder = ConfigurationBuilder()
    builder.add_endpoint(handle)
    app = _start_application(builder._to_configuration())

    _, session_token = await _store_auth_session(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='token1',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        )
    )

    async with AsyncClient(app) as client:
        response = await client.get('/api/test-ext/auth-header', cookies={SESSION_TOKEN_COOKIE_NAME: session_token})
        assert response.status_code == 200
        assert response.json() == {'authorization': f'Bearer {session_token}'}


async def test_authorization_header_not_overwritten_by_session_cookie():
    """Check that an explicit Authorization header is preserved when session cookie is present"""

    @get('test-ext/auth-header')
    def handle(request: Request):
        return {'authorization': request.headers.get('Authorization')}

    builder = ConfigurationBuilder()
    builder.add_endpoint(handle)
    app = _start_application(builder._to_configuration())

    _, cookie_token = await _store_auth_session(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='cookie-token',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        )
    )
    _, header_token = await _store_auth_session(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='header-token',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        )
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

    _, session_token = await _store_auth_session(
        TokenData(
            identity_id='user',
            identity_name='user',
            session_id='token1',
            exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
        )
    )

    async with AsyncClient(app) as client:
        response = await client.post('/api/auth/revoke-session', cookies={SESSION_TOKEN_COOKIE_NAME: session_token})
        assert response.status_code == 200
        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


async def test_basic_auth(caplog: pytest.LogCaptureFixture):
    caplog.set_level(logging.WARNING, logger='dara.dev')
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())
    async with AsyncClient(app) as client:
        # This should work
        response = await client.post('/api/auth/session', json={'username': 'test', 'password': 'test'})
        assert response.status_code == 200
        session_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
        stored_auth_token, stored_token_data = await _get_stored_auth_token(session_token)
        assert stored_token_data.identity_id == 'test'
        jwt.decode(stored_auth_token, TEST_JWT_SECRET, algorithms=[JWT_ALGO])
        set_cookie = response.headers.get('set-cookie', '')
        assert 'Max-Age=' in set_cookie
        assert 'expires=' in set_cookie.lower()

        # This should fail
        response = await client.post('/api/auth/session', json={'username': 'test', 'password': 'wrong'})
        assert response.status_code == 401
        log_content = _get_log_content(caplog, 'Auth session creation rejected')
        assert log_content['status_code'] == 401
        assert log_content['detail_reason'] == 'invalid_credentials'
        assert log_content['path'] == '/api/auth/session'


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
        session_token = await _store_test_token()
        response = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {session_token}'},
        )
        assert response.status_code == 400
        assert response.json()['detail']['message'] == 'No refresh token provided'
        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


async def test_refresh_token_missing_with_stale_session_cookie_clears_auth_cookies(caplog: pytest.LogCaptureFixture):
    caplog.set_level(logging.WARNING, logger='dara.dev')
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={SESSION_TOKEN_COOKIE_NAME: 'stale-token'},
        )
        assert response.status_code == 401
        assert response.json()['detail']['message'] == 'Token is invalid, please log in again'
        log_content = _get_log_content(caplog, 'Auth session refresh failed')
        assert log_content['status_code'] == 401
        assert log_content['detail_reason'] == 'invalid_token'
        assert log_content['has_session_cookie'] is True
        cleared_cookies = response.headers.getall('set-cookie')
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
        assert refresh_response.status_code == 401
        assert refresh_response.json()['detail']['message'] == 'Token is invalid, please log in again'
        cleared_cookies = refresh_response.headers.getall('set-cookie')
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)

        # Cookie jar should no longer contain stale auth cookies after refresh response.
        followup_verify_response = await client.post('/api/auth/verify-session')
        assert followup_verify_response.status_code == 401
        assert followup_verify_response.json()['detail'] == EXPIRED_TOKEN_ERROR


async def test_refresh_token_unsupported():
    config = ConfigurationBuilder()
    config.add_auth(BasicAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        session_token = await _store_test_token(refresh_token='foobar')
        response = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {session_token}'},
        )
        assert response.status_code == 400
        assert response.json() == {'detail': 'Auth config BasicAuthConfig does not support token refresh'}


async def test_refresh_token_success():
    config = ConfigurationBuilder()

    old_token_data = TokenData(
        session_id='session',
        # expired but should be ignored
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(seconds=10),
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
        old_session_token = await auth_session_store.create(old_token, old_token_data, refresh_token='refresh_token')
        response = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )
        assert response.status_code == 200
        assert response.json() == {'success': True}
        refreshed_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
        assert refreshed_token == old_session_token
        stored_auth_token, _ = await _get_stored_auth_token(refreshed_token)
        decoded = jwt.decode(stored_auth_token, TEST_JWT_SECRET, algorithms=[JWT_ALGO])
        assert decoded['session_id'] == old_token_data.session_id
        assert await _get_stored_refresh_token(refreshed_token) == 'new_refresh_token'
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
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(seconds=10),
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
        old_session_token = await auth_session_store.create(old_token, old_token_data, refresh_token='refresh_token')
        response = await client.post(
            '/api/auth/refresh-token',
            cookies={
                SESSION_TOKEN_COOKIE_NAME: old_session_token,
            },
        )
        assert response.status_code == 200
        assert response.json() == {'success': True}
        refreshed_token = response.cookies[SESSION_TOKEN_COOKIE_NAME]
        assert refreshed_token == old_session_token
        stored_auth_token, _ = await _get_stored_auth_token(refreshed_token)
        decoded = jwt.decode(stored_auth_token, TEST_JWT_SECRET, algorithms=[JWT_ALGO])
        assert decoded['session_id'] == old_token_data.session_id
        assert await _get_stored_refresh_token(refreshed_token) == 'new_refresh_token'


async def test_refresh_token_stores_rotated_refresh_token_server_side():
    config = ConfigurationBuilder()

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(seconds=10),
        identity_name='user',
        identity_id='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)
    refreshed_refresh_token = _make_refresh_token_with_expiry()

    class TestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            return _make_refreshed_session_token(old_token, 'refresh_cookie_expiry'), refreshed_refresh_token

    config.add_auth(TestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        old_session_token = await auth_session_store.create(old_token, old_token_data, refresh_token='refresh_token')
        response = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )

        assert response.status_code == 200
        assert await _get_stored_refresh_token(response.cookies[SESSION_TOKEN_COOKIE_NAME]) == refreshed_refresh_token


async def test_refresh_token_expired():
    config = ConfigurationBuilder()

    class TestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            raise jwt.ExpiredSignatureError()

    config.add_auth(TestAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        session_token = await _store_test_token(refresh_token='refresh_token')
        response = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {session_token}'},
        )
        assert response.status_code == 401
        assert 'Session has expired' in response.json()['detail']['message']
        cleared_cookies = response.headers.getall('set-cookie')
        assert any(cookie.startswith(f'{SESSION_TOKEN_COOKIE_NAME}="";') for cookie in cleared_cookies)


async def test_refresh_token_error():
    config = ConfigurationBuilder()

    class TestAuthConfig(BasicAuthConfig):
        async def refresh_token(self, old_token: TokenData, refresh_token: str) -> tuple[str, str]:
            raise Exception('some error')

    config.add_auth(TestAuthConfig('test', 'test'))

    app = _start_application(config._to_configuration())

    async with AsyncClient(app) as client:
        session_token = await _store_test_token(refresh_token='refresh_token')
        response = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {session_token}'},
        )
        assert response.status_code == 401
        # generic error shown
        assert 'Token is invalid' in response.json()['detail']['message']
        cleared_cookies = response.headers.getall('set-cookie')
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

    old_session_token = await auth_session_store.create(old_token, old_token_data, refresh_token='refresh_token')

    async with AsyncClient(app) as client, _async_ws_connect(client, token=old_session_token) as ws1:
        # check initial ws1 context
        await ws1.receive_json()
        await ws1.send_json({'type': 'custom', 'message': {'kind': 'get_context', 'data': None}})
        ws1_message = await ws1.receive_json()
        assert ws1_message['message']['data'] == {'id_token': 'OLD_TOKEN', 'session_id': 'session_1'}

        # Refresh token for ws1
        response = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )
        assert response.status_code == 200
        assert response.json() == {'success': True}
        assert await _get_stored_refresh_token(old_session_token) == 'new_refresh_token'

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
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(seconds=10),
        identity_name='user',
        identity_id='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    async def make_request(client):
        return await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )

    async with AsyncClient(app) as client:
        old_session_token = await auth_session_store.create(
            old_token,
            old_token_data,
            refresh_token='same_refresh_token',
        )

        # Make 3 concurrent requests
        responses = await asyncio.gather(make_request(client), make_request(client), make_request(client))

        # All responses should be successful
        assert all(r.status_code == 200 for r in responses)

        # All responses should store the same refreshed auth token from the refresh cache.
        tokens = [r.cookies[SESSION_TOKEN_COOKIE_NAME] for r in responses]
        assert all(token == old_session_token for token in tokens)
        stored_auth_tokens = [(await _get_stored_auth_token(token))[0] for token in tokens]
        assert all(token == stored_auth_tokens[0] for token in stored_auth_tokens)

        # All responses should have stored the same rotated refresh token.
        assert await _get_stored_refresh_token(old_session_token) == 'refresh_token_1'

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
            return _make_refreshed_session_token(old_token, f'expiration_{refresh_count}'), refresh_token

    config.add_auth(ExpirationTestAuthConfig('test', 'test'))
    app = _start_application(config._to_configuration())

    old_token_data = TokenData(
        session_id='session',
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(seconds=10),
        identity_name='user',
        identity_id='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    async with AsyncClient(app) as client:
        old_session_token = await auth_session_store.create(
            old_token,
            old_token_data,
            refresh_token='test_refresh_token',
        )

        # First request
        response1 = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )
        token1 = response1.cookies[SESSION_TOKEN_COOKIE_NAME]
        stored_auth_token1, _ = await _get_stored_auth_token(token1)

        # Immediate second request should use cache
        response2 = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )
        token2 = response2.cookies[SESSION_TOKEN_COOKIE_NAME]
        stored_auth_token2, _ = await _get_stored_auth_token(token2)

        assert stored_auth_token1 == stored_auth_token2
        assert refresh_count == 1

        # Wait for cache to expire (6 seconds to be safe)
        await asyncio.sleep(6)

        # Third request should get new tokens
        response3 = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )
        token3 = response3.cookies[SESSION_TOKEN_COOKIE_NAME]
        stored_auth_token3, _ = await _get_stored_auth_token(token3)

        assert stored_auth_token3 != stored_auth_token1
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
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(seconds=10),
        identity_name='user',
        identity_id='user',
    )
    old_token_1 = jwt.encode(
        old_token_data.model_copy(update={'session_id': 'session-1'}).dict(),
        TEST_JWT_SECRET,
        algorithm=JWT_ALGO,
    )
    old_token_2 = jwt.encode(
        old_token_data.model_copy(update={'session_id': 'session-2'}).dict(),
        TEST_JWT_SECRET,
        algorithm=JWT_ALGO,
    )

    async with AsyncClient(app) as client:
        old_session_token_1 = await auth_session_store.create(
            old_token_1,
            old_token_data.model_copy(update={'session_id': 'session-1'}),
            refresh_token='refresh_token_1',
        )
        old_session_token_2 = await auth_session_store.create(
            old_token_2,
            old_token_data.model_copy(update={'session_id': 'session-2'}),
            refresh_token='refresh_token_2',
        )

        # Make concurrent requests with different refresh tokens
        responses = await asyncio.gather(
            client.post(
                '/api/auth/refresh-token',
                headers={'Authorization': f'Bearer {old_session_token_1}'},
            ),
            client.post(
                '/api/auth/refresh-token',
                headers={'Authorization': f'Bearer {old_session_token_2}'},
            ),
        )

        # Both requests should succeed
        assert all(r.status_code == 200 for r in responses)

        # Should get different stored auth tokens for different refresh tokens
        tokens = [r.cookies[SESSION_TOKEN_COOKIE_NAME] for r in responses]
        stored_auth_tokens = [(await _get_stored_auth_token(token))[0] for token in tokens]
        assert stored_auth_tokens[0] != stored_auth_tokens[1]

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
        exp=datetime.datetime.now(tz=datetime.timezone.utc) - datetime.timedelta(seconds=10),
        identity_name='user',
        identity_id='user',
    )
    old_token = jwt.encode(old_token_data.dict(), TEST_JWT_SECRET, algorithm=JWT_ALGO)

    async with AsyncClient(app) as client:
        old_session_token = await auth_session_store.create(
            old_token,
            old_token_data,
            refresh_token='test_refresh_token',
        )

        # First request should fail
        response1 = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )
        assert response1.status_code == 401
        assert 'Token is invalid' in response1.json()['detail']['message']

        # Immediate second request should succeed (not using error cache)
        response2 = await client.post(
            '/api/auth/refresh-token',
            headers={'Authorization': f'Bearer {old_session_token}'},
        )
        assert response2.status_code == 200
        assert success_count == 1
