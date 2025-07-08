import asyncio
import json
import os
from typing import Union
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from anyio import create_task_group
from anyio.abc import TaskStatus
from async_asgi_testclient import TestClient as AsyncClient

from dara.core import DerivedVariable, Variable
from dara.core.configuration import ConfigurationBuilder
from dara.core.defaults import default_template
from dara.core.definitions import ComponentInstance
from dara.core.http import get
from dara.core.internal.websocket import WebsocketManager
from dara.core.main import _start_application

from tests.python.utils import (
    AUTH_HEADERS,
    _async_ws_connect,
    _get_template,
    create_app,
)

pytestmark = pytest.mark.anyio


class LocalJsComponent(ComponentInstance):
    pass


# Create a config to test with
builder: ConfigurationBuilder = ConfigurationBuilder()
builder.add_component(component=LocalJsComponent, local=True)
builder.add_page(name='Js Test', content=LocalJsComponent(), icon='Hdd')
config = create_app(builder)


os.environ['DARA_DOCKER_MODE'] = 'TRUE'


class MockComponent(ComponentInstance):
    text: Union[str, Variable, DerivedVariable]

    def __init__(self, text: Union[str, Variable, DerivedVariable]):
        super().__init__(text=text, uid='uid')


async def test_validates_configuration():
    """Check that it only accepts valid configuration objects"""

    # Check this does not throw
    _start_application(config)

    # Check that these do
    with pytest.raises(ValueError):
        _start_application({})

    with pytest.raises(ValueError):
        _start_application(ConfigurationBuilder())

    with pytest.raises(ValueError):
        _start_application(1)


async def test_config_route():
    """Check the config route returns the serialized config needed for the ui"""

    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await client.get('/api/core/config', headers=AUTH_HEADERS)
        assert response.status_code == 200
        assert response.json() == {
            'live_reload': False,
            'enable_devtools': False,
            'powered_by_causalens': False,
            'context_components': [],
            'template': 'default',
            'theme': {
                'main': 'light',
                'base': None,
            },
            'title': 'decisionApp',
            'application_name': 'dara.core',
        }


async def test_components_route():
    """Check the components route returns the dict of components"""

    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await client.get('/api/core/components', headers=AUTH_HEADERS)
        assert response.status_code == 200
        res = response.json()
        assert len(res.keys()) > 1  # Loose test so it doesn't break each time we add a default component
        assert 'LocalJsComponent' in res
        assert res['LocalJsComponent'] == {
            'js_component': None,
            'js_module': None,
            'py_module': 'LOCAL',
            'name': 'LocalJsComponent',
            'type': 'js',
        }


@patch('dara.core.definitions.uuid.uuid4', return_value='uid')
async def test_template_route(_uid):
    """Check the config route returns the serialized config"""

    app = _start_application(config)

    async with AsyncClient(app) as client:
        response, status = await _get_template(client)
        assert response == json.loads(default_template(config).json())

        # Check that it raises an error if the template is not found
        response, status = await _get_template(client, 'broken', response_ok=False)
        assert status == 404


async def test_component_registers_route():
    """Check that registering a component implicitly registers dependant routes"""
    builder = ConfigurationBuilder()

    @get('endpoint')
    def handler():
        return 'ok'

    class ComponentWithRoute(ComponentInstance):
        required_routes = [handler]

    builder.add_component(ComponentWithRoute, local=True)

    config = create_app(builder)
    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await client.get('/api/endpoint', headers=AUTH_HEADERS)
        assert response.status_code == 200
        assert response.json() == 'ok'


async def test_api_404s():
    """Test that a 404 is returned correctly for missing api calls"""
    builder = ConfigurationBuilder()
    config = create_app(builder)

    app = _start_application(config)

    async with AsyncClient(app) as client:
        res = await client.get('/api/core/bad/url')
        assert res.status_code == 404


@patch('dara.core.internal.websocket.uuid.uuid4', return_value='uid')
async def test_websocket_connection(uid):
    """Test the websocket connection can be made and ping/pong works"""
    builder = ConfigurationBuilder()
    config = create_app(builder)

    app = _start_application(config)

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Check that the init method is sent correctly
        data = await websocket.receive_json()
        assert data == {'message': {'channel': 'uid'}, 'type': 'init'}

        # Check that a ping message is replied to with a pong
        await websocket.send_json({'type': 'ping'})
        data = await websocket.receive_json()
        assert data == {'message': None, 'type': 'pong'}


@patch('dara.core.internal.websocket.uuid.uuid4', return_value='uid')
async def test_app_to_socket_send(uid):
    """Test that the ws manager and socket work for sending messages to a channel"""
    builder = ConfigurationBuilder()
    config = create_app(builder)

    async def send():
        from dara.core.internal.registries import utils_registry

        ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')
        await ws_mgr.send_message('uid', {'test': 'msg'})

    app = _start_application(config)
    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        await websocket.receive_json()

        await send()
        data = await websocket.receive_json()
        assert data == {'message': {'test': 'msg'}, 'type': 'message'}


@patch('dara.core.internal.websocket.uuid.uuid4', return_value='uid')
async def test_socket_to_app_send(uid):
    """Test that a response message on the socket gets pushed to the ws manager"""
    builder = ConfigurationBuilder()
    config = create_app(builder)

    app = _start_application(config)

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        await websocket.receive_json()

        async with create_task_group() as tg:

            async def send_msg(*args, **kwargs):
                """
                    Receive a message from the server and send a response
                    """
                server_msg = await websocket.receive_json()
                await websocket.send_json(
                    {'channel': server_msg.get('message').get('__rchan'), 'message': 'test_msg', 'type': 'message'}
                )

            async def check_msg(*args, task_status: TaskStatus):
                """
                    Send a message to the client and assert the response is what's expected
                    """
                from dara.core.internal.registries import utils_registry

                ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')
                task_status.started()
                data = await ws_mgr.send_and_wait('uid', {'test': 'msg'})
                assert data == 'test_msg'

            await tg.start(check_msg)
            tg.start_soon(send_msg)


async def test_add_custom_middlewares():
    """Test that custom middlewares can be added to the app"""
    side_effect = 0

    # test that a callable can be added as a middleware
    class CustomMiddleware:
        """test middleware"""

        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            nonlocal side_effect
            side_effect = 1
            return await self.app(scope, receive, send)

    builder = ConfigurationBuilder()
    builder.add_middleware(CustomMiddleware)
    config = create_app(builder)

    app = _start_application(config)

    async with AsyncClient(app) as client:
        await client.get('/api/core/config', headers=AUTH_HEADERS)
        assert side_effect == 1

    # Test that a function can be added as a middleware
    async def middleware(request, call_next):
        nonlocal side_effect
        side_effect = 2
        return await call_next(request)

    builder = ConfigurationBuilder()
    builder.add_middleware(middleware)
    config = create_app(builder)

    app = _start_application(config)

    async with AsyncClient(app) as client:
        await client.get('/api/core/config', headers=AUTH_HEADERS)
        assert side_effect == 2


async def test_startup_function():
    """Check the components route returns the dict of components"""

    # Define a mock function to be run on startup
    mock_startup = MagicMock(return_value=True)

    config.startup_functions.append(mock_startup)

    # Start the app and fetch config to make sure everything is executed
    app = _start_application(config)
    async with AsyncClient(app) as client:
        await client.get('/api/core/config', headers=AUTH_HEADERS)

    mock_startup.assert_called_once()


async def test_async_startup_function():
    """Check the components route returns the dict of components"""
    a = 1

    async def side_effect():
        nonlocal a
        await asyncio.sleep(0.1)
        a = 2

    # Define a mock function to be run on startup
    mock_startup = AsyncMock(side_effect=side_effect)

    config.startup_functions.append(mock_startup)

    # Start the app and fetch config to make sure everything is executed
    app = _start_application(config)
    async with AsyncClient(app) as client:
        await client.get('/api/core/config', headers=AUTH_HEADERS)

    mock_startup.assert_called_once()
    assert a == 2
