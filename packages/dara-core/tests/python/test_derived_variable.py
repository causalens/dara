import asyncio
import datetime
from contextvars import ContextVar
from unittest.mock import Mock
from uuid import uuid4

import jwt
import pytest
from anyio import create_task_group
from async_asgi_testclient import TestClient as AsyncClient

from dara.core import DerivedVariable, Variable
from dara.core.auth.basic import MultiBasicAuthConfig
from dara.core.auth.definitions import JWT_ALGO
from dara.core.base_definitions import CacheType
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.switch_variable import SwitchVariable
from dara.core.internal.dependency_resolution import ResolvedDerivedVariable
from dara.core.internal.tasks import Task
from dara.core.main import _start_application

from tests.python.tasks import calc_task, delay_exception_task, exception_task
from tests.python.utils import (
    AUTH_HEADERS,
    TEST_JWT_SECRET,
    _async_ws_connect,
    _get_derived_variable,
    _get_latest_derived_variable,
    create_app,
    get_ws_messages,
)

pytestmark = pytest.mark.anyio


class MockComponent(ComponentInstance):
    text: str | Variable | DerivedVariable

    def __init__(self, text: str | Variable | DerivedVariable):
        super().__init__(text=text, uid='uid')


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
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func.assert_called_once()

        # Hit the endpoint again with the same arguments and make sure function hasn't been called again
        response = await _get_derived_variable(
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
        )
        mock_func.assert_called_once()

        # Call it with different vars and check the response
        response = await _get_derived_variable(
            client,
            derived,
            {'values': [1, 2], 'ws_channel': 'test_channel', 'force_key': None},
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
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
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

    def deserialize(value: int | str):
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
            client,
            derived,
            {'values': ['5', '10'], 'ws_channel': 'test_channel', 'force_key': None},
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
            client,
            derived_var_1,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func_1.assert_called_once()
        # API should first determine value of derived variable and then apply the function with that value + provided value
        response = await _get_derived_variable(
            client,
            derived_var_2,
            {
                'values': [
                    {
                        'type': 'derived',
                        'uid': str(derived_var_1.uid),
                        'values': [5, 10],
                    },
                    10,
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
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
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
        )
        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func.assert_called_once()

        # Hit the endpoint again with the same arguments and make sure function hasn't been called again
        response = await _get_derived_variable(
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
        )
        mock_func.assert_called_once()

        # Change session and call it again and make sure it gets called again
        alt_auth_headers = {
            'Authorization': f'Bearer {jwt.encode({"session_id": "token1", "identity_id": "user", "identity_name": "user", "exp": datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1)}, TEST_JWT_SECRET, algorithm=JWT_ALGO)}'
        }
        response = await _get_derived_variable(
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
            alt_auth_headers,
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
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
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
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
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
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
        )
        assert response.status_code == 200
        assert response.json()['value'] == 15
        mock_func.assert_called_once()

        # Hit the endpoint again with the same arguments and make sure function hasn't been called again
        response = await _get_derived_variable(
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
        )
        mock_func.assert_called_once()

        # Change user and call it again and make sure it gets called only once as it is a different user
        alt_auth_headers = {
            'Authorization': f'Bearer {jwt.encode({"session_id": "test_sess", "identity_id": "test_user_2", "identity_name": "test_user_2", "exp": datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1)}, TEST_JWT_SECRET, algorithm=JWT_ALGO)}'
        }
        response = await _get_derived_variable(
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
            alt_auth_headers,
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        init = await websocket.receive_json()

        response = await _get_derived_variable(
            client,
            derived,
            {
                'values': [5, 10],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
        )
        assert response.status_code == 200
        task_id = response.json().get('task_id')
        # mock_func.assert_called_once()

        # Listen on the websocket channel for the notification of task completion
        data = await websocket.receive_json()
        assert data == {
            'message': {'status': 'COMPLETE', 'task_id': str(task_id)},
            'type': 'message',
        }

        # Try to fetch the result via the rest api
        result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
        assert result.status_code == 200
        assert result.json() == '15'

        # Hit the endpoint again with the same arguments and make sure the result is returned directly
        response = await _get_derived_variable(
            client,
            derived,
            {
                'values': [5, 10],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        init = await websocket.receive_json()

        response = await _get_derived_variable(
            client,
            derived,
            {
                'values': [5, 10],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
        )
        assert response.status_code == 200
        task_id = response.json().get('task_id')

        # Cancel the task
        response = await client.delete(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)

        # Listen on the websocket channel for ws messages
        messages = await get_ws_messages(websocket, 3)
        # There should be a cancellation notif
        assert {
            'message': {'status': 'CANCELED', 'task_id': str(task_id)},
            'type': 'message',
        } in messages
        # There shouldn't be a completion
        assert {
            'message': {'status': 'COMPLETE', 'task_id': str(task_id)},
            'type': 'message',
        } not in messages


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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        init = await websocket.receive_json()

        get_value = await _get_derived_variable(
            client,
            derived,
            {
                'values': [5, 10],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
        )

        response = await _get_latest_derived_variable(client, derived)
        assert get_value.status_code == 200
        assert response.json() == '15'

        # Hit the endpoint again with the same arguments and make sure the result is passed to latest value registry
        get_value = await _get_derived_variable(
            client,
            derived,
            {
                'values': [5, 10],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        init = await websocket.receive_json()

        response = await _get_derived_variable(
            client,
            derived,
            {
                'values': [5, 10],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
        )
        assert response.status_code == 200
        task_id = response.json().get('task_id')

        # Listen on the websocket channel for the notification of task completion
        data = await websocket.receive_json()
        assert data == {
            'message': {'status': 'COMPLETE', 'task_id': str(task_id)},
            'type': 'message',
        }

        # Try to fetch the result via the rest api
        result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
        assert result.status_code == 200
        assert result.json() == '15'

        # Hit the endpoint again with the same arguments and make sure the result is returned directly
        response = await _get_derived_variable(
            client,
            derived,
            {
                'values': [5, 10],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        init = await websocket.receive_json()

        response = await _get_derived_variable(
            client,
            derived_var_2,
            {
                'values': [
                    {
                        'type': 'derived',
                        'uid': str(derived_var_1.uid),
                        'values': [5, 10],
                    },
                    10,
                ],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
        )
        assert response.status_code == 200
        task_id = response.json().get('task_id')
        assert task_id is not None

        # Listen on the websocket channel for the notification of task completion
        messages = await get_ws_messages(websocket)
        assert all(data['message']['status'] == 'COMPLETE' for data in messages)

        assert {
            'message': {'status': 'COMPLETE', 'task_id': task_id},
            'type': 'message',
        } in messages

        # Try to fetch the result via the rest api
        result = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
        assert result.status_code == 200
        assert result.json() == '25'

        # Hit the endpoint again with the same arguments and make sure the result is returned directly
        response = await _get_derived_variable(
            client,
            derived_var_2,
            {
                'values': [
                    {
                        'type': 'derived',
                        'uid': str(derived_var_1.uid),
                        'values': [5, 10],
                    },
                    10,
                ],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
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
                        'values': [
                            {
                                'type': 'derived',
                                'uid': str(derived_var_1.uid),
                                'values': [5, 10],
                            },
                            10,
                        ],
                    },
                ],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
        )
        assert response.status_code == 200
        task_id = response.json().get('task_id')
        assert task_id is not None

        # Listen on the websocket channel for the notification of task completion
        messages = await get_ws_messages(websocket)
        assert all(data['message']['status'] == 'COMPLETE' for data in messages)

        assert {
            'message': {'status': 'COMPLETE', 'task_id': task_id},
            'type': 'message',
        } in messages

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
                        'values': [
                            {
                                'type': 'derived',
                                'uid': str(derived_var_1.uid),
                                'values': [5, 10],
                            },
                            10,
                        ],
                    },
                ],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
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
            client,
            derived,
            {'values': [5, 10], 'ws_channel': 'test_channel', 'force_key': None},
        )
        response = await _get_latest_derived_variable(client, derived)
        assert get_value.status_code == 200
        assert response.status_code == 200
        assert response.json() == 15
        mock_func.assert_called_once()

        # Check it returns None if there is no latest value for an user
        alt_auth_headers = {
            'Authorization': f'Bearer {jwt.encode({"session_id": "test_sess", "identity_id": "test_user_1", "identity_name": "test_user_1", "exp": datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1)}, TEST_JWT_SECRET, algorithm=JWT_ALGO)}'
        }

        response = await _get_latest_derived_variable(client, derived, alt_auth_headers)

        assert response.status_code == 200
        assert response.json() is None
        mock_func.assert_called_once()

        # checks another user can add their value to the registry
        get_value = await _get_derived_variable(
            client,
            derived,
            {'values': [2, 6], 'ws_channel': 'test_channel', 'force_key': None},
            alt_auth_headers,
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
            client,
            derived,
            {'values': [7, 4], 'ws_channel': 'test_channel', 'force_key': None},
        )
        response = await _get_latest_derived_variable(client, derived)

        assert response.status_code == 200
        assert response.json() == 11


async def test_derived_variable_with_switch_variable_condition():
    """
    Test that SwitchVariable can be used with Condition objects that compare variables
    """
    from dara.core.interactivity.condition import Condition

    builder = ConfigurationBuilder()

    dv = ContextVar('dv')

    def calc(a, switch_result):
        return a + switch_result

    func = Mock(wraps=calc)

    def page():
        var1 = Variable(5)
        threshold_var = Variable(10)

        # Create a condition that compares var1 to threshold_var
        condition = Condition(variable=var1, operator=Condition.Operator.GREATER_THAN, other=threshold_var)

        # Create a switch variable that uses the condition
        switch_var = SwitchVariable.when(
            condition=condition,
            true_value=100,
            false_value=200,
            uid='switch_condition_uid',
        )

        derived = DerivedVariable(func, variables=[var1, switch_var])
        dv.set(derived)
        return MockComponent(text=derived)

    builder.add_page('Test', page)

    config = builder._to_configuration()

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # Test with var1=5, threshold=10: 5 > 10 is False, should return 5 + 200 = 205
        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    5,
                    {
                        'type': 'switch',
                        'uid': 'switch_condition_uid',
                        'value': {
                            '__typename': 'Condition',
                            'variable': 5,
                            'operator': 'greater_than',
                            'other': 10,
                        },
                        'value_map': {True: 100, False: 200},
                        'default': 0,
                    },
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 205
        assert func.call_count == 1

        # Test with var1=15, threshold=10: 15 > 10 is True, should return 15 + 100 = 115
        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    15,
                    {
                        'type': 'switch',
                        'uid': 'switch_condition_uid',
                        'value': {
                            '__typename': 'Condition',
                            'variable': 15,
                            'operator': 'greater_than',
                            'other': 10,
                        },
                        'value_map': {True: 100, False: 200},
                        'default': 0,
                    },
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 115
        assert func.call_count == 2


async def test_derived_variable_task_chain_loop():
    """
    Test a scenario where the task chain forms a loop.
    The expected scenario is that there is no deadlock and the value resolves correctly.

        +-------+     +-------+
        | var1  |     | var2  |
        |  (1)  |     |  (2)  |
        +-------+     +-------+
             |            |
             |            |
             v            v
        +--------------------+
        |  [Task] task_var   |
        |        (3)         |
        +--------------------+
                   | \\
                   |  \\  (task_var is also
                   |   \\  an input to the
                   |    \\ parent_var)
                   v     \\
        +----------------+\\
        |  meta_dv_2 (5) |  |
        +----------------+  |
                   |        |
                   v        |
        +----------------+  |
        |  meta_dv_1 (8) |  |
        +----------------+  |
                   |        |
                   |        |
                   |        |
                   v        v
        +------------------------------+
        |        parent_var (11)       |
        +------------------------------+
    """
    builder = ConfigurationBuilder()

    var1 = Variable(1)
    var2 = Variable(2)
    task_var = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True, uid='task_var')  # 3
    meta_dv_2 = DerivedVariable(lambda _1: int(_1) + 2, variables=[task_var], uid='meta_dv_2')  # 5
    meta_dv_1 = DerivedVariable(lambda _1: int(_1) + 3, variables=[meta_dv_2], uid='meta_dv_1')  # 8
    parent_var = DerivedVariable(
        lambda _1, _2: int(_1) + int(_2), variables=[meta_dv_1, task_var], uid='parent_var'
    )  # 11

    builder.add_page('Test', content=MockComponent(text=parent_var))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client, _async_ws_connect(client) as ws:
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
                'force_key': None,
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
                'force_key': None,
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as ws:
        init = await ws.receive_json()

        # First request the erroring task
        response = await _get_derived_variable(
            client,
            exc_dv,
            {
                'values': [],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
            expect_success=False,
        )
        assert response.status_code == 200
        task_id = response.json().get('task_id')
        assert task_id is not None

        # Wait until the first task fails
        messages = await get_ws_messages(ws)
        assert any(data['message']['task_id'] == task_id and data['message']['status'] == 'ERROR' for data in messages)

        # Then request the metatask
        response_2 = await _get_derived_variable(
            client,
            meta_task,
            {
                'values': [{'type': 'derived', 'uid': str(exc_dv.uid), 'values': []}],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        init = await websocket.receive_json()

        # First request the erroring task
        response = await _get_derived_variable(
            client,
            exc_dv,
            {
                'values': [],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
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
                'force_key': None,
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        # Receive the init message
        init = await websocket.receive_json()

        # First request the erroring DV, should error (500)
        with pytest.raises(Exception):
            await _get_derived_variable(
                client,
                exc_dv,
                {
                    'values': [],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force_key': None,
                },
                expect_success=False,
            )

        # Then request the wrapping DV, should also error (500)
        with pytest.raises(Exception):
            await _get_derived_variable(
                client,
                meta_task,
                {
                    'values': [{'type': 'derived', 'uid': str(exc_dv.uid), 'values': []}],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force_key': None,
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as ws:
        init = await ws.receive_json()

        response_1_coro = _get_derived_variable(
            client,
            exc_dv,
            {
                'values': [],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
            },
            expect_success=False,
        )

        response_2_coro = _get_derived_variable(
            client,
            meta_task,
            {
                'values': [{'type': 'derived', 'uid': str(exc_dv.uid), 'values': []}],
                'ws_channel': init.get('message', {}).get('channel'),
                'force_key': None,
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

        assert isinstance(results['response_1'], Exception)
        assert 'test exception' in str(results['response_1'])
        assert isinstance(results['response_2'], Exception)
        assert 'test exception' in str(results['response_2'])


async def test_force_key_prevents_double_execution():
    """
    Test that using the same force key prevents double execution of the same DerivedVariable.
    """
    import time

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Track execution count
    execution_count = {'count': 0}

    def slow_calc(a, b):
        execution_count['count'] += 1
        time.sleep(0.1)  # Simulate slow computation
        return a + b

    mock_func = Mock(wraps=slow_calc)
    derived_var = DerivedVariable(mock_func, variables=[var1, var2])

    builder.add_page('Test', content=MockComponent(text=derived_var))

    config = create_app(builder)
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # First call with a specific force_key
        response1 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [5, 10],
                'ws_channel': 'test_channel',
                'force_key': 'unique_force_key_456',
            },
        )

        assert response1.status_code == 200
        assert response1.json()['value'] == 15
        assert execution_count['count'] == 1

        # Second call with the same force_key should NOT force execution again
        response2 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [5, 10],
                'ws_channel': 'test_channel',
                'force_key': 'unique_force_key_456',  # Same key
            },
        )

        assert response2.status_code == 200
        assert response2.json()['value'] == 15
        # Should still be 1 because the force key was already seen
        assert execution_count['count'] == 1, f'Expected 1 execution, got {execution_count["count"]}'

        # Third call with a different force_key should force execution
        response3 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [5, 10],
                'ws_channel': 'test_channel',
                'force_key': 'different_force_key_789',  # Different key
            },
        )

        assert response3.status_code == 200
        assert response3.json()['value'] == 15
        # Should be 2 now because we used a different force key
        assert execution_count['count'] == 2, f'Expected 2 executions, got {execution_count["count"]}'

        # Fourth call without the force key should reuse the cache
        response4 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [5, 10],
                'ws_channel': 'test_channel',
                'force_key': None,  # no force key
            },
        )
        assert response4.status_code == 200
        assert response4.json()['value'] == 15
        # Should still be 2
        assert execution_count['count'] == 2, f'Expected 2 executions, got {execution_count["count"]}'


async def test_force_key_busts_nested_dv_and_parent():
    """
    Test that when including a force_key in a nested derived variable,
    both the nested dv and the parent dv are forced to re-execute.
    """
    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Track execution count
    execution_count = {'derived': 0, 'nested': 0}

    def nested_calc(a, b):
        execution_count['nested'] += 1
        return a + b

    def derived_calc(a):
        execution_count['derived'] += 1
        return a * a

    mock_nested_func = Mock(wraps=nested_calc)
    mock_derived_func = Mock(wraps=derived_calc)
    # var1,var2 -> nested -> derived chain
    nested_var = DerivedVariable(mock_nested_func, variables=[var1, var2])
    derived_var = DerivedVariable(mock_derived_func, variables=[nested_var])

    builder.add_page('Test', content=MockComponent(text=derived_var))

    config = create_app(builder)
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # First call normally
        response1 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [
                    ResolvedDerivedVariable(
                        type='derived',
                        uid=str(nested_var.uid),
                        force_key=None,
                        values=[5, 10],
                    )
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response1.status_code == 200
        assert response1.json()['value'] == (5 + 10) ** 2
        assert execution_count['derived'] == 1
        assert execution_count['nested'] == 1

        # Force the nested dv to re-execute
        response2 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [
                    ResolvedDerivedVariable(
                        type='derived',
                        uid=str(nested_var.uid),
                        force_key=str(uuid4()),
                        values=[5, 10],
                    )
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        assert response2.status_code == 200
        assert response2.json()['value'] == (5 + 10) ** 2
        # Both variables should be re-executed
        assert execution_count['derived'] == 2
        assert execution_count['nested'] == 2

        # Now force the top-level dv to re-execute
        response3 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [
                    ResolvedDerivedVariable(
                        type='derived',
                        uid=str(nested_var.uid),
                        force_key=None,
                        values=[5, 10],
                    )
                ],
                'ws_channel': 'test_channel',
                'force_key': str(uuid4()),
            },
        )
        assert response3.status_code == 200
        assert response3.json()['value'] == (5 + 10) ** 2
        # Top-level dv should have been forced, +1
        assert execution_count['derived'] == 3
        # Nested reuses cache
        assert execution_count['nested'] == 2


async def test_force_key_busts_grandparent():
    """
    Test that when including a force_key in a nested nested derived variable,
    busts the parent and grandparent.
    """
    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Track execution count
    execution_count = {'grandchild': 0, 'child': 0, 'root': 0}

    def grandchild_calc(a, b):
        execution_count['grandchild'] += 1
        return a + b

    def child_calc(a):
        execution_count['child'] += 1
        return a * a

    def root_calc(a):
        execution_count['root'] += 1
        return a * a

    # var1+var2 -> grandchild -> child -> root chain
    grandchild_var = DerivedVariable(grandchild_calc, variables=[var1, var2])
    child_var = DerivedVariable(child_calc, variables=[grandchild_var])
    root_var = DerivedVariable(root_calc, variables=[child_var])

    builder.add_page('Test', content=MockComponent(text=root_var))

    config = create_app(builder)
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # First call normally
        response1 = await _get_derived_variable(
            client,
            root_var,
            {
                'values': [
                    ResolvedDerivedVariable(
                        type='derived',
                        uid=str(child_var.uid),
                        force_key=None,
                        values=[
                            ResolvedDerivedVariable(
                                type='derived',
                                uid=str(grandchild_var.uid),
                                force_key=None,
                                values=[5, 10],
                            )
                        ],
                    )
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response1.status_code == 200
        assert response1.json()['value'] == (5 + 10) ** 2**2
        assert execution_count['root'] == 1
        assert execution_count['child'] == 1
        assert execution_count['grandchild'] == 1

        # First force the child
        response2 = await _get_derived_variable(
            client,
            root_var,
            {
                'values': [
                    ResolvedDerivedVariable(
                        type='derived',
                        uid=str(child_var.uid),
                        force_key=str(uuid4()),
                        values=[
                            ResolvedDerivedVariable(
                                type='derived',
                                uid=str(grandchild_var.uid),
                                force_key=None,
                                values=[5, 10],
                            )
                        ],
                    )
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        assert response2.status_code == 200
        assert response2.json()['value'] == (5 + 10) ** 2**2
        # Child and root should be forced, +1
        assert execution_count['root'] == 2
        assert execution_count['child'] == 2
        # grand child was below force, was re-used
        assert execution_count['grandchild'] == 1

        # Then force the grandchild
        response3 = await _get_derived_variable(
            client,
            root_var,
            {
                'values': [
                    ResolvedDerivedVariable(
                        type='derived',
                        uid=str(child_var.uid),
                        force_key=None,
                        values=[
                            ResolvedDerivedVariable(
                                type='derived',
                                uid=str(grandchild_var.uid),
                                force_key=str(uuid4()),
                                values=[5, 10],
                            )
                        ],
                    )
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        assert response3.status_code == 200
        assert response3.json()['value'] == (5 + 10) ** 2**2
        # All three variables should be forced, +1
        assert execution_count['root'] == 3
        assert execution_count['child'] == 3
        assert execution_count['grandchild'] == 2


async def test_none_value_is_valid():
    """
    Test that None is a valid value for a derived variable and isn't interpreted as a cache
    miss.
    """
    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Track execution count
    execution_count = {'count': 0}

    def slow_calc(a, b):
        execution_count['count'] += 1

    mock_func = Mock(wraps=slow_calc)
    derived_var = DerivedVariable(mock_func, variables=[var1, var2])

    builder.add_page('Test', content=MockComponent(text=derived_var))

    config = create_app(builder)
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # First call with 10, 20
        response1 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [10, 20],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        assert response1.status_code == 200
        assert response1.json()['value'] is None
        assert execution_count['count'] == 1

        # call with 5, 6
        response2 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [5, 6],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        assert response2.status_code == 200
        assert response2.json()['value'] is None
        assert execution_count['count'] == 2

        # call with 10, 20 again, should reuse the cached None value
        response3 = await _get_derived_variable(
            client,
            derived_var,
            {
                'values': [10, 20],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        assert response3.status_code == 200
        assert response3.json()['value'] is None
        assert execution_count['count'] == 2


async def test_derived_variable_with_switch_variable():
    """
    Test that SwitchVariable can be used in a DerivedVariable.variables
    """
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')

    def calc(a, switch_result):
        return a + switch_result

    func = Mock(wraps=calc)

    def page():
        var1 = Variable(5)
        condition_var = Variable(True)

        # Create a switch variable that returns 10 when True, 20 when False
        switch_var = SwitchVariable.when(condition=condition_var, true_value=10, false_value=20, uid='switch_uid')

        derived = DerivedVariable(func, variables=[var1, switch_var])
        dv.set(derived)
        return MockComponent(text=derived)

    builder.add_page('Test', page)

    config = builder._to_configuration()

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # Test with condition=True, should return 5 + 10 = 15
        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    5,
                    {
                        'type': 'switch',
                        'uid': 'switch_uid',
                        'value': True,
                        'value_map': {True: 10, False: 20},
                        'default': 0,
                    },
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 15
        assert func.call_count == 1

        # Test with condition=False, should return 5 + 20 = 25
        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    5,
                    {
                        'type': 'switch',
                        'uid': 'switch_uid',
                        'value': False,
                        'value_map': {True: 10, False: 20},
                        'default': 0,
                    },
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 25
        assert func.call_count == 2

        # Test with unknown value, should use default (0), return 5 + 0 = 5
        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    5,
                    {
                        'type': 'switch',
                        'uid': 'switch_uid',
                        'value': 'unknown',
                        'value_map': {True: 10, False: 20},
                        'default': 0,
                    },
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 5
        assert func.call_count == 3


async def test_nested_derived_variable_as_input():
    """
    Test that a DerivedVariable with nested property can be used as input to another DerivedVariable,
    and the nested value is properly resolved on the backend.
    """
    builder = ConfigurationBuilder()

    var1 = Variable()

    def inner_func(a):
        return {'data': {'value': a * 2, 'extra': 'ignored'}}

    def outer_func(nested_value):
        # nested_value should be just the 'value' field (a * 2)
        return nested_value + 100

    inner_mock = Mock(wraps=inner_func)
    outer_mock = Mock(wraps=outer_func)

    inner_dv = DerivedVariable(inner_mock, variables=[var1])
    outer_dv = DerivedVariable(outer_mock, variables=[inner_dv.get('data').get('value')])

    builder.add_page('Test', content=MockComponent(text=outer_dv))

    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        # Request outer_dv with nested inner_dv
        # Inner returns {'data': {'value': 10, 'extra': 'ignored'}} for input 5
        # Nested path ['data', 'value'] should extract 10
        # Outer should receive 10 and return 10 + 100 = 110
        response = await _get_derived_variable(
            client,
            outer_dv,
            {
                'values': [
                    {
                        'type': 'derived',
                        'uid': str(inner_dv.uid),
                        'values': [5],
                        'nested': ['data', 'value'],
                    }
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 110
        assert inner_mock.call_count == 1
        assert outer_mock.call_count == 1


async def test_nested_derived_variable_missing_path():
    """
    Test that when nested path doesn't exist, None is returned.
    """
    builder = ConfigurationBuilder()

    var1 = Variable()

    def inner_func(a):
        return {'data': {'value': a * 2}}

    def outer_func(nested_value):
        # nested_value should be None if path doesn't exist
        return nested_value

    inner_mock = Mock(wraps=inner_func)
    outer_mock = Mock(wraps=outer_func)

    inner_dv = DerivedVariable(inner_mock, variables=[var1])
    outer_dv = DerivedVariable(outer_mock, variables=[inner_dv.get('nonexistent').get('path')])

    builder.add_page('Test', content=MockComponent(text=outer_dv))

    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        # Request with a nested path that doesn't exist
        response = await _get_derived_variable(
            client,
            outer_dv,
            {
                'values': [
                    {
                        'type': 'derived',
                        'uid': str(inner_dv.uid),
                        'values': [5],
                        'nested': ['nonexistent', 'path'],
                    }
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] is None


async def test_deeply_nested_derived_variable_chain():
    """
    Test a chain of derived variables where nested properties are used at multiple levels.
    """
    builder = ConfigurationBuilder()

    var1 = Variable()

    def level1_func(a):
        return {'l1': {'data': a * 2}}

    def level2_func(l1_val):
        return {'l2': {'data': l1_val + 10}}

    def level3_func(l2_val):
        return l2_val * 3

    l1_mock = Mock(wraps=level1_func)
    l2_mock = Mock(wraps=level2_func)
    l3_mock = Mock(wraps=level3_func)

    level1_dv = DerivedVariable(l1_mock, variables=[var1])
    level2_dv = DerivedVariable(l2_mock, variables=[level1_dv.get('l1').get('data')])
    level3_dv = DerivedVariable(l3_mock, variables=[level2_dv.get('l2').get('data')])

    builder.add_page('Test', content=MockComponent(text=level3_dv))

    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        # Input: 5
        # Level1: {'l1': {'data': 10}} -> nested extracts 10
        # Level2: receives 10, returns {'l2': {'data': 20}} -> nested extracts 20
        # Level3: receives 20, returns 20 * 3 = 60
        response = await _get_derived_variable(
            client,
            level3_dv,
            {
                'values': [
                    {
                        'type': 'derived',
                        'uid': str(level2_dv.uid),
                        'values': [
                            {
                                'type': 'derived',
                                'uid': str(level1_dv.uid),
                                'values': [5],
                                'nested': ['l1', 'data'],
                            }
                        ],
                        'nested': ['l2', 'data'],
                    }
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 60
        assert l1_mock.call_count == 1
        assert l2_mock.call_count == 1
        assert l3_mock.call_count == 1
