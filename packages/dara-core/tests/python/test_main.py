import asyncio
import datetime
import json
import os
from typing import Union
from unittest.mock import Mock, patch

import anyio
from exceptiongroup import BaseExceptionGroup
import jwt
from pydantic import BaseModel
import pytest
from anyio import create_task_group
from anyio.abc import TaskStatus
from async_asgi_testclient import TestClient as AsyncClient

from dara.core import DerivedVariable, Variable, py_component
from dara.core.auth.definitions import JWT_ALGO
from dara.core.auth.basic import MultiBasicAuthConfig
from dara.core.base_definitions import CacheType
from dara.core.configuration import ConfigurationBuilder
from dara.core.defaults import default_template
from dara.core.definitions import ComponentInstance
from dara.core.http import get
from dara.core.interactivity.actions import NavigateTo, UpdateVariable
from dara.core.internal.tasks import Task
from dara.core.internal.websocket import WebsocketManager
from dara.core.main import _start_application

from tests.python.tasks import calc_task, delay_exception_task, exception_task
from tests.python.utils import (
    AUTH_HEADERS,
    TEST_JWT_SECRET,
    _async_ws_connect,
    _call_action,
    _get_derived_variable,
    _get_latest_derived_variable,
    _get_py_component,
    _get_template,
    create_app,
    get_ws_messages,
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
        assert 'LocalJsComponent' in res.keys()
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


async def test_fetching_derived_variable():
    """Test that a DerivedVariable can be fetched from the backend by passing the current values"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a, b):
        return a + b

    mock_func = Mock(wraps=calc)

    derived = DerivedVariable(mock_func, variables=[var1, var2])

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func.assert_called_once()

        # Hit the endpoint again with the same arguments and make sure function hasn't been called again
        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()

        # Call it with different vars and check the response
        response = await _get_derived_variable(
            client, derived, {'values': [1, 2], 'ws_channel': 'test_channel', 'force': False}
        )

        assert response.status_code == 200
        assert response.json()['value'] == 3
        assert mock_func.call_count == 2


async def test_fetching_async_derived_variable():
    """Test that an async DerivedVariable can be fetched from the backend by passing the current values"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    async def calc(a, b):
        return a + b

    derived = DerivedVariable(calc, variables=[var1, var2])

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15

async def test_restoring_args_derived_variable():
    """Test that when a DerivedVariable is expecting a given type of an arg, the serialized value is restored to that type"""
    builder = ConfigurationBuilder()

    class CustomClass:
        value: int

        def __init__(self, value: int):
            self.value = value

    def serialize(value: CustomClass):
        return value.value

    def deserialize(value: Union[int, str]):
        return CustomClass(int(value))

    mock_deserialize = Mock(wraps=deserialize, side_effect=deserialize)
    mock_serialize = Mock(wraps=serialize, side_effect=serialize)

    builder.add_encoder(typ=CustomClass, serialize=mock_serialize, deserialize=mock_deserialize)

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a: CustomClass, b: int):
        assert isinstance(a, CustomClass)
        assert isinstance(b, int)
        return CustomClass(a.value + b)

    derived = DerivedVariable(calc, variables=[var1, var2])

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived, {'values': ['5', '10'], 'ws_channel': 'test_channel', 'force': False}
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15

        assert mock_deserialize.call_count == 1
        assert mock_deserialize.call_args[0][0] == '5'

        assert mock_serialize.call_count == 1

async def test_chained_derived_variable():
    """Test that derived variables can be chained"""
    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a, b):
        return a + b

    mock_func_1 = Mock(wraps=calc)
    mock_func_2 = Mock(wraps=calc)
    derived_var_1 = DerivedVariable(mock_func_1, variables=[var1, var2])
    derived_var_2 = DerivedVariable(mock_func_2, variables=[derived_var_1, var2])

    builder.add_page('Test', content=MockComponent(text=derived_var_1))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived_var_1, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func_1.assert_called_once()
        # API should first determine value of derived variable and then apply the function with that value + provided value
        response = await _get_derived_variable(
            client,
            derived_var_2,
            {
                'values': [{'type': 'derived', 'uid': str(derived_var_1.uid), 'values': [5, 10]}, 10],
                'ws_channel': 'test_channel',
                'force': False,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 25


async def test_fetching_session_based_derived_variable():
    """Test that a DerivedVariable can be cached on a session by session basis"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a, b):
        return a + b

    mock_func = Mock(wraps=calc)

    derived = DerivedVariable(mock_func, variables=[var1, var2], cache=CacheType.SESSION)

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )
        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func.assert_called_once()

        # Hit the endpoint again with the same arguments and make sure function hasn't been called again
        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()

        # Change session and call it again and make sure it gets called again
        alt_auth_headers = {
            'Authorization': f'Bearer {jwt.encode({"session_id": "token1", "identity_name": "user", "exp": datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),}, TEST_JWT_SECRET, algorithm=JWT_ALGO)}'
        }
        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}, alt_auth_headers
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15
        assert mock_func.call_count == 2


async def test_fetching_session_based_latest_derived_variable():
    """Test that a DerivedVariable latest value can be registered by session"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a, b):
        return a + b

    mock_func = Mock(wraps=calc)

    derived = DerivedVariable(mock_func, variables=[var1, var2], cache=CacheType.SESSION)

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        get_value = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )
        response = await _get_latest_derived_variable(client, derived)

        assert get_value.status_code == 200
        assert response.status_code == 200
        assert response.json() == 15
        mock_func.assert_called_once()


async def test_fetching_global_cache_latest_derived_variable():
    """Test that a DerivedVariable latest value can be registered without preset cache"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a, b):
        return a + b

    mock_func = Mock(wraps=calc)

    derived = DerivedVariable(mock_func, variables=[var1, var2])

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        get_value = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )
        response = await _get_latest_derived_variable(client, derived)

        assert get_value.status_code == 200
        assert response.status_code == 200
        assert response.json() == 15
        mock_func.assert_called_once()


async def test_fetching_user_based_derived_variable():
    """Test that a DerivedVariable can be cached on a user by user basis"""

    builder = ConfigurationBuilder()
    builder.add_auth(MultiBasicAuthConfig(users={'test_user_2': 'test', 'test_user_1': 'test'}))

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a, b):
        return a + b

    mock_func = Mock(wraps=calc)

    derived = DerivedVariable(mock_func, variables=[var1, var2], cache=CacheType.USER)

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )
        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func.assert_called_once()

        # Hit the endpoint again with the same arguments and make sure function hasn't been called again
        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()

        # Change user and call it again and make sure it gets called only once as it is a different user
        alt_auth_headers = {
            'Authorization': f'Bearer {jwt.encode({"session_id": "test_sess", "identity_name": "test_user_2", "exp": datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),}, TEST_JWT_SECRET, algorithm=JWT_ALGO)}'
        }
        response = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}, alt_auth_headers
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func.assert_called_once()


async def test_fetching_derived_variable_run_as_task():
    """Test that a DerivedVariable can be run as a task and it's result fetched via that interface"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    derived = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            response = await _get_derived_variable(
                client,
                derived,
                {'values': [5, 10], 'ws_channel': init.get('message', {}).get('channel'), 'force': False},
            )
            assert response.status_code == 200
            task_id = response.json().get('task_id')
            # mock_func.assert_called_once()

            # Listen on the websocket channel for the notification of task completion
            data = await websocket.receive_json()
            assert data == {'message': {'status': 'COMPLETE', 'task_id': str(task_id)}, 'type': 'message'}

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == '15'

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _get_derived_variable(
                client,
                derived,
                {'values': [5, 10], 'ws_channel': init.get('message', {}).get('channel'), 'force': False},
            )
            assert response.json()['value'] == '15'


async def test_cancel_derived_variable_run_as_task():
    """Test that a DerivedVariable can be run as a task and can be cancelled by a request"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    derived = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            response = await _get_derived_variable(
                client,
                derived,
                {'values': [5, 10], 'ws_channel': init.get('message', {}).get('channel'), 'force': False},
            )
            assert response.status_code == 200
            task_id = response.json().get('task_id')

            # Cancel the task
            response = await client.delete(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)

            # Listen on the websocket channel for ws messages
            messages = await get_ws_messages(websocket, 3)
            # There should be a cancellation notif
            assert {'message': {'status': 'CANCELED', 'task_id': str(task_id)}, 'type': 'message'} in messages
            # There shouldn't be a completion
            assert {'message': {'status': 'COMPLETE', 'task_id': str(task_id)}, 'type': 'message'} not in messages


async def test_fetching_latest_derived_variable_value_run_as_task():
    """Test that for a DerivedVariable run as task the latest value is set to pending while task is run and then can be fetched when finished."""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    derived = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            get_value = await _get_derived_variable(
                client,
                derived,
                {'values': [5, 10], 'ws_channel': init.get('message', {}).get('channel'), 'force': False},
            )

            response = await _get_latest_derived_variable(client, derived)
            assert get_value.status_code == 200
            assert response.json() == 'Pending...'

            task_id = get_value.json().get('task_id')
            # mock_func.assert_called_once()

            # Listen on the websocket channel for the notification of task completion
            data = await websocket.receive_json()
            assert data == {'message': {'status': 'COMPLETE', 'task_id': str(task_id)}, 'type': 'message'}

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == '15'

            # Hit the endpoint again with the same arguments and make sure the result is passed to latest value registry
            get_value = await _get_derived_variable(
                client,
                derived,
                {'values': [5, 10], 'ws_channel': init.get('message', {}).get('channel'), 'force': False},
            )
            response = await _get_latest_derived_variable(client, derived)
            assert response.json() == '15'


async def test_fetching_derived_variable_that_returns_task():
    """Test that a DerivedVariable can be run as a task and it's result fetched via that interface"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    def calc(a, b):
        return Task(calc_task, args=[a, b])

    derived = DerivedVariable(calc, variables=[var1, var2])

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            response = await _get_derived_variable(
                client,
                derived,
                {'values': [5, 10], 'ws_channel': init.get('message', {}).get('channel'), 'force': False},
            )
            assert response.status_code == 200
            task_id = response.json().get('task_id')

            # Listen on the websocket channel for the notification of task completion
            data = await websocket.receive_json()
            assert data == {'message': {'status': 'COMPLETE', 'task_id': str(task_id)}, 'type': 'message'}

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == '15'

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _get_derived_variable(
                client,
                derived,
                {'values': [5, 10], 'ws_channel': init.get('message', {}).get('channel'), 'force': False},
            )
            assert response.json()['value'] == '15'


async def test_chaining_derived_variable_run_as_task():
    """
    Test that a chained DerivedVariable can be run normally but that if a nested call is run as a task this will force
    the top level to run as a task as well
    """

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    derived_var_1 = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)
    derived_var_2 = DerivedVariable(calc_task, variables=[derived_var_1, var2])

    builder.add_page('Test', content=MockComponent(text=derived_var_2))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            response = await _get_derived_variable(
                client,
                derived_var_2,
                {
                    'values': [{'type': 'derived', 'uid': str(derived_var_1.uid), 'values': [5, 10]}, 10],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
            )
            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            # Listen on the websocket channel for the notification of task completion
            messages = await get_ws_messages(websocket)
            assert all(data['message']['status'] == 'COMPLETE' for data in messages)

            assert {'message': {'status': 'COMPLETE', 'task_id': task_id}, 'type': 'message'} in messages

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == '25'

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _get_derived_variable(
                client,
                derived_var_2,
                {
                    'values': [{'type': 'derived', 'uid': str(derived_var_1.uid), 'values': [5, 10]}, 10],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
            )
            assert response.json()['value'] == '25'


async def test_chaining_derived_variable_all_run_as_task():
    """Test that a set of chained DerivedVariables can all be ran as tasks"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    derived_var_1 = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)
    derived_var_2 = DerivedVariable(calc_task, variables=[derived_var_1, var2], run_as_task=True)
    derived_var_3 = DerivedVariable(calc_task, variables=[var1, derived_var_2], run_as_task=True)

    builder.add_page('Test', content=MockComponent(text=derived_var_3))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            response = await _get_derived_variable(
                client,
                derived_var_3,
                {
                    'values': [
                        5,
                        {
                            'type': 'derived',
                            'uid': str(derived_var_2.uid),
                            'values': [{'type': 'derived', 'uid': str(derived_var_1.uid), 'values': [5, 10]}, 10],
                        },
                    ],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
            )
            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            # Listen on the websocket channel for the notification of task completion
            messages = await get_ws_messages(websocket)
            assert all(data['message']['status'] == 'COMPLETE' for data in messages)

            assert {'message': {'status': 'COMPLETE', 'task_id': task_id}, 'type': 'message'} in messages

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == '30'

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _get_derived_variable(
                client,
                derived_var_3,
                {
                    'values': [
                        5,
                        {
                            'type': 'derived',
                            'uid': str(derived_var_2.uid),
                            'values': [{'type': 'derived', 'uid': str(derived_var_1.uid), 'values': [5, 10]}, 10],
                        },
                    ],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
            )
            assert response.json()['value'] == '30'


async def test_fetch_latest_derived_variable():
    """
    App with DerivedVariable, triggers calculation and check it is saved per cache type in latest registry
    """
    builder = ConfigurationBuilder()
    builder.add_auth(MultiBasicAuthConfig(users={'test_user_1': 'test', 'test_user_2': 'test', 'test_user_3': 'test'}))

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a, b):
        return a + b

    mock_func = Mock(wraps=calc)

    derived = DerivedVariable(mock_func, variables=[var1, var2], cache=CacheType.USER)

    builder.add_page('Test', content=MockComponent(text=derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # Checks value is correctly registered for one user
        get_value = await _get_derived_variable(
            client, derived, {'values': [5, 10], 'ws_channel': 'test_channel', 'force': False}
        )
        response = await _get_latest_derived_variable(client, derived)
        assert get_value.status_code == 200
        assert response.status_code == 200
        assert response.json() == 15
        mock_func.assert_called_once()

        # Check it returns None if there is no latest value for an user
        alt_auth_headers = {
            'Authorization': f'Bearer {jwt.encode({"session_id": "test_sess","identity_name": "test_user_1", "exp": datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),}, TEST_JWT_SECRET, algorithm=JWT_ALGO)}'
        }

        response = await _get_latest_derived_variable(client, derived, alt_auth_headers)

        assert response.status_code == 200
        assert response.json() == None
        mock_func.assert_called_once()

        # checks another user can add their value to the registry
        get_value = await _get_derived_variable(
            client, derived, {'values': [2, 6], 'ws_channel': 'test_channel', 'force': False}, alt_auth_headers
        )
        response = await _get_latest_derived_variable(client, derived, alt_auth_headers)

        assert get_value.status_code == 200
        assert response.status_code == 200
        assert response.json() == 8

        # checks user value still there even if another user's value is added for that DerivedVariable
        response = await _get_latest_derived_variable(client, derived)

        assert response.status_code == 200
        assert response.json() == 15

        # checks entries are overwritten if there is a new latest value
        get_value = await _get_derived_variable(
            client, derived, {'values': [7, 4], 'ws_channel': 'test_channel', 'force': False}
        )
        response = await _get_latest_derived_variable(client, derived)

        assert response.status_code == 200
        assert response.json() == 11


async def test_py_component_respects_dv_empty_deps():
    """
    Test a scenario where a requested py_component requires a previously calculated DerivedVariable with deps=[].
    The expected scenario is that the variable is not re-calculated because of deps=[].
    """
    builder = ConfigurationBuilder()

    counter = 0

    def mock_inc(x):
        # Keep track of number of executions
        nonlocal counter
        counter += 1
        return int(x) + 1

    var = Variable(1)
    dv = DerivedVariable(mock_inc, variables=[var], deps=[])

    @py_component
    def TestComp(variable: int):
        return MockComponent(text=str(variable))

    builder.add_page('Test', content=TestComp(dv))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:

        # Override the env
        response, status = await _get_template(client)

        # Check that a component with a uid name has been generated and inserted instead of the MockComponent
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        # Send a request to calculate the DV once with variable=1 - so it gets cached
        response = await _get_derived_variable(
            client, dv, data={'values': [1], 'ws_channel': 'test_channel', 'force': False}
        )
        assert response.json()['value'] == 2

        # DV should've been ran once
        assert counter == 1

        # Request the py_component that depends on the DV with variable=5
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'variable': dv},
            data={
                'uid': component.get('uid'),
                'values': {'variable': {'type': 'derived', 'uid': str(dv.uid), 'values': [5]}},
                'ws_channel': 'test_channel',
            },
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '2'}, 'uid': 'uid'}

        # The DV should've been ran once - should hit cache because updated value was not in deps
        assert counter == 1


async def test_py_component_respects_dv_non_empty_deps():
    """
    Test a scenario where a requested py_component requires a previously calculated DerivedVariable with variables=[var1, var2] deps=[var1].
    The expected scenario is that the variable is not re-calculated because of deps=[var1] if var2 changes.
    Then the test verifies that if the value present in deps changed, the DV is recalculated.
    Then we double check that if we change back to a previously cached value, we recalculate again because cache was purged.
    """
    builder = ConfigurationBuilder()

    counter = 0

    def mock_sum(x, y):
        # Keep track of number of executions
        nonlocal counter
        counter += 1
        return int(x) + int(y)

    var1 = Variable(1)
    var2 = Variable(1)
    dv = DerivedVariable(mock_sum, variables=[var1, var2], deps=[var1])

    @py_component
    def TestComp(variable: int):
        return MockComponent(text=str(variable))

    builder.add_page('Test', content=TestComp(dv))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:

        # Override the env
        response, status = await _get_template(client)

        # Check that a component with a uid name has been generated and inserted instead of the MockComponent
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        # Send a request to calculate the DV once with var1=1, var2=2 - so it gets cached
        response = await _get_derived_variable(
            client, dv, data={'values': [1, 2], 'ws_channel': 'test_channel', 'force': False}
        )
        assert response.json()['value'] == 3

        # DV should've been ran once
        assert counter == 1

        # Request the py_component that depends on the DV with var1=1, var2=3 - non-deps variable changed
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'variable': dv},
            data={
                'uid': component.get('uid'),
                'values': {'variable': {'type': 'derived', 'uid': str(dv.uid), 'values': [1, 3]}},
                'ws_channel': 'test_channel',
            },
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '3'}, 'uid': 'uid'}

        # The DV should've been ran once - should hit cache because updated value was not in deps
        assert counter == 1

        # Request the py_component that depends on the DV with var1=2,var2=3
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'variable': dv},
            data={
                'uid': component.get('uid'),
                'values': {'variable': {'type': 'derived', 'uid': str(dv.uid), 'values': [2, 3]}},
                'ws_channel': 'test_channel',
            },
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '5'}, 'uid': 'uid'}

        # The DV should've been ran again - variable which changed was in deps
        assert counter == 2

        # Now request py_component with var1=1,var2=6 - expected scenario is that cache is NOT hit because
        # it has been purged - to prevent stale cache issues - so result should be accurate
        # (as oppose to i.e. returning 3 or 4 as these results were cached for dep variable var1=1)
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'variable': dv},
            data={
                'uid': component.get('uid'),
                'values': {'variable': {'type': 'derived', 'uid': str(dv.uid), 'values': [1, 6]}},
                'ws_channel': 'test_channel',
            },
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '7'}, 'uid': 'uid'}

        # The DV should've been ran again - cache was purged
        assert counter == 3


async def test_derived_variable_task_chain_loop():
    """
    Test a scenario where the task chain forms a loop.
    The expected scenario is that there is no deadlock and the value resolves correctly.
    """
    builder = ConfigurationBuilder()

    var1 = Variable(1)
    var2 = Variable(2)
    task_var = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)   # 3
    meta_dv_2 = DerivedVariable(lambda _1: int(_1) + 2, variables=[task_var])   # 5
    meta_dv_1 = DerivedVariable(lambda _1: int(_1) + 3, variables=[meta_dv_2])   # 8
    parent_var = DerivedVariable(lambda _1, _2: int(_1) + int(_2), variables=[meta_dv_1, task_var])   # 11

    builder.add_page('Test', content=MockComponent(text=parent_var))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as ws:
            init = await ws.receive_json()

            response = await _get_derived_variable(
                client,
                parent_var,
                data={
                    'values': [
                        {
                            'type': 'derived',
                            'uid': str(meta_dv_1.uid),
                            'values': [
                                {
                                    'type': 'derived',
                                    'uid': str(meta_dv_2.uid),
                                    'values': [
                                        {
                                            'type': 'derived',
                                            'uid': str(task_var.uid),
                                            'values': [1, 2],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            'type': 'derived',
                            'uid': str(task_var.uid),
                            'values': [1, 2],
                        },
                    ],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
                expect_success=False,
            )

            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            # Wait for all websocket messages to come in
            messages = await get_ws_messages(ws)
            assert all(data['message']['status'] == 'COMPLETE' for data in messages)
            assert any(
                data['message']['task_id'] == task_id and data['message']['status'] == 'COMPLETE' for data in messages
            )

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == 11

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _get_derived_variable(
                client,
                parent_var,
                data={
                    'values': [
                        {
                            'type': 'derived',
                            'uid': str(meta_dv_1.uid),
                            'values': [
                                {
                                    'type': 'derived',
                                    'uid': str(meta_dv_2.uid),
                                    'values': [
                                        {
                                            'type': 'derived',
                                            'uid': str(task_var.uid),
                                            'values': [1, 2],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            'type': 'derived',
                            'uid': str(task_var.uid),
                            'values': [1, 2],
                        },
                    ],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
                expect_success=False,
            )
            assert response.json()['value'] == 11


async def test_task_error_later_reuse():
    """
    Test a scenario where a derived variable results in an error and is later re-used by another (meta) task.
    The expected scenario is that the re-use attempt results in an error caused by running the underlying task
    again rather than retrieving some cached error/corrupted state.
    """
    builder = ConfigurationBuilder()

    exc_dv = DerivedVariable(exception_task, variables=[], run_as_task=True)

    # this function doesn't matter as we expect an error before it reaches the function
    def calc(a):
        return a + 1

    meta_task = DerivedVariable(calc, variables=[exc_dv])

    builder.add_page('Test', content=MockComponent(text=meta_task))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    # Remove the exception handler so we can actually test the exception, otherwise the test crashes
    loop = asyncio.get_running_loop()

    def handler(loop, context):
        pass

    loop.set_exception_handler(handler)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as ws:
            init = await ws.receive_json()

            # First request the erroring task
            response = await _get_derived_variable(
                client,
                exc_dv,
                {
                    'values': [],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
                expect_success=False,
            )
            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            # Wait until the first task fails
            messages = await get_ws_messages(ws)
            assert any(
                data['message']['task_id'] == task_id and data['message']['status'] == 'ERROR' for data in messages
            )

            # Then request the metatask
            response_2 = await _get_derived_variable(
                client,
                meta_task,
                {
                    'values': [{'type': 'derived', 'uid': str(exc_dv.uid), 'values': []}],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
                expect_success=False,
            )
            assert response_2.status_code == 200
            task_id_2 = response_2.json().get('task_id')
            assert task_id_2 is not None

            # one of the two messages should be about the second task failing
            messages = await get_ws_messages(ws)
            assert any(
                data['message']['task_id'] == task_id_2 and data['message']['status'] == 'ERROR' for data in messages
            )


async def test_task_error_immediate_reuse():
    """
    Test a scenario where a derived variable results in an error and is immediately re-used by another (meta) task.
    The expected scenario is that the re-use attempt results in an error, rather than
    hanging on a PendingTask.
    """
    builder = ConfigurationBuilder()

    exc_dv = DerivedVariable(exception_task, variables=[], run_as_task=True)

    # this function doesn't matter as we expect an error before it reaches the function
    def calc(a):
        return a + 1

    meta_task = DerivedVariable(calc, variables=[exc_dv])

    builder.add_page('Test', content=MockComponent(text=meta_task))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    # Remove the exception handler so we can actually test the exception, otherwise the test crashes
    loop = asyncio.get_running_loop()

    def handler(loop, context):
        pass

    loop.set_exception_handler(handler)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # First request the erroring task
            response = await _get_derived_variable(
                client,
                exc_dv,
                {
                    'values': [],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
            )
            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            # Immediately request the metatask so it should use the underlying DV as a pending task
            response_2 = await _get_derived_variable(
                client,
                meta_task,
                {
                    'values': [{'type': 'derived', 'uid': str(exc_dv.uid), 'values': []}],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
            )
            assert response_2.status_code == 200
            task_id_2 = response_2.json().get('task_id')
            assert task_id_2 is not None

            # There should be an error ws message for both of the task_ids
            messages = await get_ws_messages(websocket)
            failed_tasks = [msg['message']['task_id'] for msg in messages if msg['message'].get('status') == 'ERROR']
            assert set(failed_tasks) == {task_id, task_id_2}


async def test_non_task_later_reuse():
    """
    Test a scenario where a derived variable results in an error and is later re-used by another DV.
    The expected scenario is that the re-use attempt results in an error caused by running the underlying DV
    again rather than retrieving some cached error/corrupted state.
    """
    builder = ConfigurationBuilder()

    exc_dv = DerivedVariable(exception_task, variables=[])

    # this function doesn't matter as we expect an error before it reaches the function
    def calc(a):
        return a + 1

    meta_task = DerivedVariable(calc, variables=[exc_dv])

    builder.add_page('Test', content=MockComponent(text=meta_task))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    # Remove the exception handler so we can actually test the exception, otherwise the test crashes
    loop = asyncio.get_running_loop()

    def handler(loop, context):
        pass

    loop.set_exception_handler(handler)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # First request the erroring DV, should error (500)
            with pytest.raises(Exception):
                response = await _get_derived_variable(
                    client,
                    exc_dv,
                    {
                        'values': [],
                        'ws_channel': init.get('message', {}).get('channel'),
                        'force': False,
                    },
                    expect_success=False,
                )

            # Then request the wrapping DV, should also error (500)
            with pytest.raises(Exception):
                response_2 = await _get_derived_variable(
                    client,
                    meta_task,
                    {
                        'values': [{'type': 'derived', 'uid': str(exc_dv.uid), 'values': []}],
                        'ws_channel': init.get('message', {}).get('channel'),
                        'force': False,
                    },
                    expect_success=False,
                )


async def test_non_task_immediate_reuse():
    """
    Test a scenario where a derived variable results in an error and is immediately re-used by another DV.
    The expected scenario is that the re-use attempt results in an error caused by the pending DV resolving
    to an error, rather than a hanging process.
    """
    builder = ConfigurationBuilder()

    exc_dv = DerivedVariable(delay_exception_task, variables=[])

    # this function doesn't matter as we expect an error before it reaches the function
    def calc(a):
        return a + 1

    meta_task = DerivedVariable(calc, variables=[exc_dv])

    builder.add_page('Test', content=MockComponent(text=meta_task))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    # Remove the exception handler so we can actually test the exception, otherwise the test crashes
    loop = asyncio.get_running_loop()

    def handler(loop, context):
        pass

    loop.set_exception_handler(handler)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as ws:
            init = await ws.receive_json()

            response_1_coro = _get_derived_variable(
                client,
                exc_dv,
                {
                    'values': [],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
                expect_success=False,
            )

            response_2_coro = _get_derived_variable(
                client,
                meta_task,
                {
                    'values': [{'type': 'derived', 'uid': str(exc_dv.uid), 'values': []}],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
                expect_success=False,
            )

            results = {}

            async def run_coro_until_result(coro, key: str, **kwargs):
                try:
                    if 'task_status' in kwargs:
                        kwargs['task_status'].started()
                    results[key] = await coro
                except BaseException as e:
                    results[key] = e

            async with create_task_group() as tg:
                # Make sure first request runs first
                await tg.start(run_coro_until_result, response_1_coro, 'response_1')
                tg.start_soon(run_coro_until_result, response_2_coro, 'response_2')

            assert isinstance(results['response_1'], BaseExceptionGroup)
            assert 'test exception' in str(results['response_1'].exceptions[0])
            assert isinstance(results['response_2'], BaseExceptionGroup)
            assert 'test exception' in str(results['response_2'].exceptions[0])


async def test_calling_an_action():
    """Test that an action can be called via the rest api"""
    builder = ConfigurationBuilder()
    config = create_app(builder)
    action = NavigateTo(url=lambda ctx: f'url/{ctx.inputs.value}')

    app = _start_application(config)

    async with AsyncClient(app) as client:
        res = await _call_action(client, action, {'inputs': {'value': 'test'}, 'extras': [], 'ws_channel': 'uid'})

        assert res.status_code == 200
        assert res.json() == 'url/test'


async def test_calling_async_action():
    """Test that an async def action can be called via the rest api"""
    builder = ConfigurationBuilder()
    config = create_app(builder)

    async def resolver(ctx: UpdateVariable.Ctx):
        await anyio.sleep(0.5)
        return f'{ctx.inputs.new}_{ctx.inputs.old}'

    var = Variable()

    action = UpdateVariable(resolver, var)

    app = _start_application(config)
    async with AsyncClient(app) as client:

        res = await _call_action(
            client, action, {'inputs': {'new': 'test', 'old': 'current'}, 'extras': [], 'ws_channel': 'uid'}
        )

        assert res.status_code == 200
        assert res.json() == 'test_current'

async def test_calling_an_action_with_extras():
    """Test that an action with extras can be called via the rest api"""
    builder = ConfigurationBuilder()
    config = create_app(builder)

    def resolver(ctx: UpdateVariable.Ctx):
        return f'{ctx.inputs.new}_{ctx.inputs.old}_{ctx.extras[0]}'

    var = Variable()
    var2 = Variable()

    action = UpdateVariable(resolver, var, extras=[var2])

    app = _start_application(config)
    async with AsyncClient(app) as client:

        res = await _call_action(
            client, action, {'inputs': {'new': 'test', 'old': 'current'}, 'extras': ['val2'], 'ws_channel': 'uid'}
        )

        assert res.status_code == 200
        assert res.json() == 'test_current_val2'


async def test_calling_an_action_returns_task():
    """
    Test that an action with an extra DV that has run_as_task returns correct task_id.
    """
    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()
    result = Variable()

    derived = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)
    action = UpdateVariable(lambda ctx: ctx.extras[0], variable=result, extras=[derived])

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        payload = {
            'inputs': {'old': None, 'new': None},
            'extras': [
                {
                    'type': 'derived',
                    'uid': str(derived.uid),
                    'values': [5, 10],
                },
            ],
        }

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            response = await _call_action(
                client, action, {**payload, 'ws_channel': init.get('message', {}).get('channel')}
            )

            task_id = response.json().get('task_id')

            # Listen on the websocket channel for the notification of task completion
            data = await websocket.receive_json()
            # This message is for the metatask completing so task_id won't match
            assert data['message']['status'] == 'COMPLETE'

            # Wait a little bit for the task to complete, flaky in CI
            await anyio.sleep(1)

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == '15'

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _call_action(
                client, action, {**payload, 'ws_channel': init.get('message', {}).get('channel')}
            )
            assert result.json() == '15'


async def test_calling_an_action_returns_meta_task():
    """
    Test that an action with multiple DVs that have run_as_task returns a single task_id.
    """
    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()
    var3 = Variable()
    var4 = Variable()

    result = Variable()

    derived_var_1 = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)
    derived_var_2 = DerivedVariable(calc_task, variables=[var3, var4], run_as_task=True)

    action = UpdateVariable(
        lambda ctx: f'{ctx.extras[0]}_{ctx.extras[1]}', variable=result, extras=[derived_var_1, derived_var_2]
    )

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        payload = {
            'inputs': {'old': None, 'new': None},
            'extras': [
                {
                    'type': 'derived',
                    'uid': str(derived_var_1.uid),
                    'values': [5, 10],
                },
                {
                    'type': 'derived',
                    'uid': str(derived_var_2.uid),
                    'values': [7, 9],
                },
            ],
        }

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            response = await _call_action(
                client, action, {**payload, 'ws_channel': init.get('message', {}).get('channel')}
            )

            response_json = response.json()
            assert 'task_id' in response_json

            meta_task_id = response_json['task_id']

            # Underlying task completion messages
            messages = await get_ws_messages(websocket)
            assert all([m['message']['status'] == 'COMPLETE' for m in messages])

            # MetaTask completion message
            assert {'message': {'status': 'COMPLETE', 'task_id': meta_task_id}, 'type': 'message'} in messages

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{meta_task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == '15_16'

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _call_action(
                client, action, {**payload, 'ws_channel': init.get('message', {}).get('channel')}
            )
            assert result.json() == '15_16'


async def test_calling_an_action_returns_task_loop():
    """
    Test a scenario where (meta)task chain returned by calling an action forms a loop.
    The expected scenario is that there is no deadlock and the value resolves correctly.
    """
    builder = ConfigurationBuilder()

    var1 = Variable(1)
    var2 = Variable(2)
    task_var = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)   # 3
    meta_dv_2 = DerivedVariable(lambda _1: int(_1) + 2, variables=[task_var])   # 5
    meta_dv_1 = DerivedVariable(lambda _1: int(_1) + 3, variables=[meta_dv_2])   # 8
    parent_var = DerivedVariable(lambda _1, _2: int(_1) + int(_2), variables=[meta_dv_1, task_var])   # 11

    result = Variable()
    action = UpdateVariable(lambda ctx: ctx.extras[0], variable=result, extras=[parent_var])

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        payload = {
            'inputs': {'old': None, 'new': None},
            'extras': [
                {
                    'type': 'derived',
                    'uid': str(parent_var.uid),
                    'values': [
                        {
                            'type': 'derived',
                            'uid': str(meta_dv_1.uid),
                            'values': [
                                {
                                    'type': 'derived',
                                    'uid': str(meta_dv_2.uid),
                                    'values': [
                                        {
                                            'type': 'derived',
                                            'uid': str(task_var.uid),
                                            'values': [1, 2],
                                        },
                                    ],
                                },
                            ],
                        },
                        {
                            'type': 'derived',
                            'uid': str(task_var.uid),
                            'values': [1, 2],
                        },
                    ],
                },
            ],
        }

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            response = await _call_action(
                client, action, {**payload, 'ws_channel': init.get('message', {}).get('channel')}
            )
            response_json = response.json()
            assert 'task_id' in response_json

            meta_task_id = response_json['task_id']

            # Wait for all websocket messages to come in
            messages = await get_ws_messages(websocket)
            assert all(data['message']['status'] == 'COMPLETE' for data in messages)
            assert any(data['message']['task_id'] == meta_task_id for data in messages)

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{meta_task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == 11

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _call_action(
                client, action, {**payload, 'ws_channel': init.get('message', {}).get('channel')}
            )
            assert result.json() == 11


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

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
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
    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
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

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
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
