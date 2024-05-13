import datetime

import jwt
import pytest
from async_asgi_testclient import TestClient as AsyncClient

from dara.core.auth.definitions import JWT_ALGO, TokenData
from dara.core.auth.basic import BasicAuthConfig, MultiBasicAuthConfig
from dara.core.configuration import ConfigurationBuilder
from dara.core.http import get
from dara.core.main import _start_application

from tests.python.utils import TEST_JWT_SECRET

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
        assert response.status_code == 403

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
