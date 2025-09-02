import asyncio
import json
from html.parser import HTMLParser
from typing import Union
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from anyio import create_task_group
from anyio.abc import TaskStatus
from async_asgi_testclient import TestClient as AsyncClient

from dara.core import DerivedVariable, Variable
from dara.core.configuration import Configuration, ConfigurationBuilder
from dara.core.defaults import default_template
from dara.core.definitions import ComponentInstance
from dara.core.http import get
from dara.core.internal.websocket import WebsocketManager
from dara.core.main import _start_application
from dara.core.router import LayoutRoute, Outlet
from dara.core.visual.components.router_content import RouterContent
from dara.core.visual.components.sidebar_frame import SideBarFrame

from tests.python.utils import (
    AUTH_HEADERS,
    _async_ws_connect,
    _get_template,
    create_app,
)

pytestmark = pytest.mark.anyio


class LocalJsComponent(ComponentInstance):
    pass


class DaraDataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_dara_data = False
        self.dara_data = None

    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            for attr in attrs:
                if attr[0] == 'id' and attr[1] == '__DARA_DATA__':
                    self.in_dara_data = True

    def handle_endtag(self, tag):
        self.in_dara_data = False

    def handle_data(self, data):
        if self.in_dara_data:
            self.dara_data = json.loads(data)


# Create a config to test with
@pytest.fixture
def config():
    builder: ConfigurationBuilder = ConfigurationBuilder()
    builder.add_component(component=LocalJsComponent, local=True)
    builder.add_page(name='Js Test', content=LocalJsComponent(), icon='Hdd')
    yield create_app(builder)


class MockComponent(ComponentInstance):
    text: Union[str, Variable, DerivedVariable]

    def __init__(self, text: Union[str, Variable, DerivedVariable]):
        super().__init__(text=text, uid='uid')


async def test_validates_configuration(config: Configuration):
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


def assert_dict_subset(haystack: dict, needle: dict):
    """
    Assert that the haystack dict contains all the keys and values of the needle dict
    """
    for key, value in needle.items():
        assert haystack[key] == value


async def _check_dara_data(client: AsyncClient):
    response = await client.get('/')
    assert response.status_code == 200
    assert response.headers['content-type'] == 'text/html; charset=utf-8'

    parser = DaraDataParser()
    parser.feed(response.text)
    assert parser.dara_data is not None

    # Check main app config
    assert_dict_subset(
        parser.dara_data,
        {
            'live_reload': False,
            'enable_devtools': False,
            'powered_by_causalens': False,
            'context_components': [],
            'theme': {
                'main': 'light',
                'base': None,
            },
            'title': 'decisionApp',
            'application_name': 'dara.core',
        },
    )

    # Check the custom component appears in components
    assert_dict_subset(
        parser.dara_data['components'],
        {
            'LocalJsComponent': {
                'js_component': None,
                'js_module': None,
                'py_module': 'LOCAL',
                'name': 'LocalJsComponent',
                'type': 'js',
            }
        },
    )


async def test_dara_data_autojs(monkeypatch: pytest.MonkeyPatch, config: Configuration):
    """
    Check that the HTML includes the correct embedded dara data for both autojs index
    """
    with monkeypatch.context() as m:
        m.setenv('DARA_DOCKER_MODE', 'TRUE')
        m.delenv('DARA_DOCKER_MODE')

        # skip rebuild_js
        with patch('dara.core.main.rebuild_js'):
            app = _start_application(config)

            async with AsyncClient(app) as client:
                await _check_dara_data(client)


async def test_dara_data_properjs(monkeypatch: pytest.MonkeyPatch, config: Configuration):
    """
    Check that the HTML includes the correct embedded dara data for properjs index
    """
    with monkeypatch.context() as m:
        m.setenv('DARA_DOCKER_MODE', 'TRUE')

        # skip rebuild_js
        with patch('dara.core.main.rebuild_js'):
            app = _start_application(config)

            # Patch the fastapi_vite vite loader, we don't really care about it
            # and otherwise they require e.g. a valid manifest.json file
            from fastapi_vite_dara.loader import ViteLoader

            mock_vite_loader = Mock()
            mock_vite_loader.generate_vite_ws_client = Mock(return_value='ws_client')
            mock_vite_loader.generate_vite_asset = Mock(return_value='asset')
            mock_vite_loader.generate_vite_react_hmr = Mock(return_value='hmr')

            with patch.object(ViteLoader, '__new__', return_value=mock_vite_loader):
                async with AsyncClient(app) as client:
                    await _check_dara_data(client)


@patch('dara.core.definitions.uuid.uuid4', return_value='uid')
async def test_route_compatibility(_uid, config: Configuration):
    """Check the route returns the serialized template for that page when using the old template API"""

    app = _start_application(config)

    # Router will be created after starting the app from the old template API
    compat_router = config.router
    assert compat_router is not None

    # One navigable route should be created
    routes = compat_router.get_navigable_routes()
    assert len(routes) == 1
    assert routes[0]['id'] == 'js-test'
    assert routes[0]['path'] == '/js-test'

    root_layout = compat_router.children[0]
    assert isinstance(root_layout, LayoutRoute)
    root_layout_data = root_layout.route_data
    root_layout_content = root_layout_data.content
    assert root_layout_content is not None

    async with AsyncClient(app) as client:
        default_layout = default_template(config).layout
        assert isinstance(default_layout, SideBarFrame)
        default_content = default_layout.content
        assert isinstance(default_content, RouterContent)
        page_content = default_content.routes[0].content

        # Check layout template is the correct SideBarFrame
        response, status = await _get_template(client, page_id=root_layout.get_identifier())
        assert response['template'] == root_layout_content.model_dump()
        assert isinstance(root_layout_content, SideBarFrame)
        assert isinstance(root_layout_content.content, Outlet)  # router content replaced with Outlet

        # Check individual page content matches
        response, status = await _get_template(client, page_id=routes[0]['id'])
        assert response['template'] == page_content.model_dump()

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


async def test_startup_function(config: Configuration):
    """Check the components route returns the dict of components"""

    # Define a mock function to be run on startup
    mock_startup = MagicMock(return_value=True)

    config.startup_functions.append(mock_startup)

    # Start the app and fetch config to make sure everything is executed
    app = _start_application(config)
    async with AsyncClient(app) as client:
        await client.get('/api/core/config', headers=AUTH_HEADERS)

    mock_startup.assert_called_once()


async def test_async_startup_function(config: Configuration):
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
