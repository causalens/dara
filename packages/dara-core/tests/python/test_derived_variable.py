import asyncio
import datetime
from contextvars import ContextVar
from typing import Union
from unittest.mock import Mock

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
    text: Union[str, Variable, DerivedVariable]

    def __init__(self, text: Union[str, Variable, DerivedVariable]):
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
            assert response.json() == '15'

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
                'force': False,
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
                'force': False,
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
                'force': False,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 5
        assert func.call_count == 3


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

            assert isinstance(results['response_1'], Exception)
            assert 'test exception' in str(results['response_1'])
            assert isinstance(results['response_2'], Exception)
            assert 'test exception' in str(results['response_2'])
