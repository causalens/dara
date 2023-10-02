import datetime
import os
import re
from contextvars import ContextVar
from multiprocessing import active_children
from typing import Optional, Union
from unittest.mock import Mock

import jwt
import pytest
from anyio import move_on_after
from async_asgi_testclient import TestClient as AsyncClient
from pandas import DataFrame

from dara.core.auth.definitions import JWT_ALGO
from dara.core.auth.basic import BasicAuthConfig
from dara.core.base_definitions import Action, CacheType
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.actions import UpdateVariable
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.filtering import ValueQuery
from dara.core.interactivity.plain_variable import Variable
from dara.core.internal.pandas_utils import append_index
from dara.core.main import _start_application
from dara.core.visual.dynamic_component import py_component

from tests.python.utils import (
    AUTH_HEADERS,
    TEST_JWT_SECRET,
    _async_ws_connect,
    _call_action,
    _get_derived_variable,
    _get_py_component,
    _get_template,
    create_app,
    get_ws_messages,
    wait_assert,
)

from .tasks import data_task

pytestmark = pytest.mark.anyio
os.environ['DARA_DOCKER_MODE'] = 'TRUE'

TEST_DATA = DataFrame(
    {
        'col1': [1, 2, 3, 4, 1],
        'col2': [6, 7, 8, 6, 10],
        'col3': ['a', 'b', 'a', 'd', 'e'],
        'col4': ['f', 'f', 'h', 'i', 'j'],
    }
)
FINAL_TEST_DATA = append_index(TEST_DATA)
"""
```
   col1  col2 col3 col4
0     1     6    a    f
1     2     7    b    f
2     3     8    a    h
3     4     6    d    i
4     1     10   e    j
```
"""


@pytest.fixture(autouse=True)
async def reset_data_variable_cache():
    """
    Reset the data variable cache between tests
    """
    from dara.core.internal.registries import (
        data_variable_registry,
        derived_variable_registry,
        utils_registry,
    )

    data_variable_registry.replace({})
    derived_variable_registry.replace({})
    await utils_registry.get('Store').clear()

    yield

    # Check no leftover children
    await wait_assert(lambda: len(active_children()) == 0, timeout=5)


class MockComponent(ComponentInstance):
    text: Union[str, DataVariable, DerivedVariable, DerivedDataVariable]
    action: Optional[Action] = None

    def __init__(
        self, text: Union[str, DataVariable, DerivedVariable, DerivedDataVariable], action: Optional[Action] = None
    ):
        super().__init__(text=text, uid='uid', action=action)


async def test_derived_data_variable_dv_value_not_returned():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def identity(a):
        return a

    mock_func = Mock(wraps=identity)

    derived = DerivedDataVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [0], 'ws_channel': 'test_channel', 'force': False}
        )

        # Check no actual value is returned when is_data_variable is True
        assert response.json()['value'] == True


async def test_derived_data_variable_cache_key_required():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def identity(a):
        return a

    mock_func = Mock(wraps=identity)

    derived = DerivedDataVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        data_response = await client.post('/api/core/data-variable/uid', json={'filters': None}, headers=AUTH_HEADERS)
        assert data_response.status_code == 400


async def test_derived_data_variable_ws_channel_required():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def identity(a):
        return a

    mock_func = Mock(wraps=identity)

    derived = DerivedDataVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [0], 'ws_channel': 'test_channel', 'force': False}
        )
        cache_key = response.json()['cache_key']

        data_response = await client.post(
            '/api/core/data-variable/uid', json={'filters': None, 'cache_key': cache_key}, headers=AUTH_HEADERS
        )
        assert data_response.status_code == 400


async def test_derived_data_variable_must_return_dataframe():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def identity(a):
        return a

    mock_func = Mock(wraps=identity, return_value=0)

    derived = DerivedDataVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [0], 'ws_channel': 'test_channel', 'force': False}
        )
        cache_key = response.json()['cache_key']

        data_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )

        assert data_response.status_code == 400
        assert re.search(r'must be a DataFrame', data_response.json()['detail']) is not None
        assert mock_func.call_count == 1


async def test_derived_data_variable_no_filters():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def func(a: int, data=TEST_DATA):
        df = data.copy()
        numeric_cols = [col for col in df if df[col].dtype == 'int64' and col != '__index__']
        df[numeric_cols] += int(a)
        return df

    mock_func = Mock(wraps=func)

    derived = DerivedDataVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()
        cache_key = response.json()['cache_key']

        # Hit the endpoint again to make sure the cache is re-used
        second_response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()
        assert second_response.json()['cache_key'] == cache_key

        data_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )

        assert data_response.json() == func(1, FINAL_TEST_DATA).to_dict(orient='records')
        mock_func.assert_called_once()

        # Hit the data endpoint again to make sure cache is re-used
        data_second_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )
        assert data_response.json() == data_second_response.json()
        mock_func.assert_called_once()

        # Hit the derived endpoint again with different value, check that the function is called again
        third_response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [2], 'ws_channel': 'test_channel', 'force': False}
        )
        assert third_response.json()['cache_key'] != cache_key
        assert mock_func.call_count == 2

        # Check that calling the data endpoint with new cache key gives the expected result
        data_third_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': third_response.json()['cache_key'], 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )
        assert data_third_response.json() == func(2, FINAL_TEST_DATA).to_dict(orient='records')
        assert mock_func.call_count == 2

        # Check count can be returned correctly
        count_response = await client.post(
            '/api/core/data-variable/uid/count',
            json={'cache_key': third_response.json()['cache_key']},
            headers=AUTH_HEADERS,
        )
        assert count_response.status_code == 200
        assert count_response.json() == 5
        assert mock_func.call_count == 2   # not called again


async def test_derived_data_variable_with_filters():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def func(a: int, data=TEST_DATA):
        df = data.copy()
        numeric_cols = [col for col in df if df[col].dtype == 'int64' and col != '__index__']
        df[numeric_cols] += int(a)
        return df

    mock_func = Mock(wraps=func)

    derived = DerivedDataVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False}
        )
        cache_key = response.json()['cache_key']

        data_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': {'column': 'col1', 'value': 1}, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )

        unfiltered = func(1, FINAL_TEST_DATA)

        assert data_response.json() == unfiltered[unfiltered['col1'] == 1].to_dict(orient='records')
        assert mock_func.call_count == 1

        # Make sure a different filter returns a different result (i.e. so the cache is not re-used)
        data_second_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': {'column': 'col1', 'value': 2}, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )
        assert data_second_response.json() == unfiltered[unfiltered['col1'] == 2].to_dict(orient='records')
        assert mock_func.call_count == 1

        # Check count cannot be returned for different filters
        invalid_count_response = await client.post(
            '/api/core/data-variable/uid/count',
            json={'cache_key': cache_key},
            headers=AUTH_HEADERS,
        )
        assert invalid_count_response.status_code == 400

        # Check count can be returned correctly with same filters
        count_response = await client.post(
            '/api/core/data-variable/uid/count',
            json={'filters': {'column': 'col1', 'value': 2}, 'cache_key': cache_key},
            headers=AUTH_HEADERS,
        )
        assert count_response.status_code == 200
        assert count_response.json() == len(unfiltered[unfiltered['col1'] == 2].index)
        assert mock_func.call_count == 1   # not called again


async def test_derived_data_variable_cache_user():
    """
    Test derived data variable works correctly with cache=CacheType.USER (or SESSION, same principle applies)
    """
    builder = ConfigurationBuilder()
    builder.add_auth(BasicAuthConfig('test', 'password'))

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def func(a: int, data=TEST_DATA):
        df = data.copy()
        numeric_cols = [col for col in df if df[col].dtype == 'int64' and col != '__index__']
        df[numeric_cols] += int(a)
        return df

    mock_func = Mock(wraps=func)

    derived = DerivedDataVariable(mock_func, variables=[var1], uid='uid', cache=CacheType.USER)

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()
        cache_key = response.json()['cache_key']

        # Hit the endpoint again to make sure the cache is re-used
        second_response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()
        assert second_response.json()['cache_key'] == cache_key

        data_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )

        assert data_response.json() == func(1, FINAL_TEST_DATA).to_dict(orient='records')
        mock_func.assert_called_once()

        # Hit the data endpoint again to make sure cache is re-used
        data_second_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )
        assert data_response.json() == data_second_response.json()
        mock_func.assert_called_once()

        # Hit the derived endpoint again with different value, check that the function is called again
        third_response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [2], 'ws_channel': 'test_channel', 'force': False}
        )
        assert third_response.json()['cache_key'] != cache_key
        assert mock_func.call_count == 2

        # Check that calling the data endpoint with new cache key gives the expected result
        data_third_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': third_response.json()['cache_key'], 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )
        assert data_third_response.json() == func(2, FINAL_TEST_DATA).to_dict(orient='records')
        assert mock_func.call_count == 2

        # Check count can be returned correctly
        count_response = await client.post(
            '/api/core/data-variable/uid/count',
            json={'cache_key': third_response.json()['cache_key']},
            headers=AUTH_HEADERS,
        )
        assert count_response.status_code == 200
        assert count_response.json() == 5
        assert mock_func.call_count == 2   # not called again

        # Test different user, count cannot be fetched and function is re-ran again
        ALT_TOKEN = jwt.encode(
            {
                'session_id': 'token2',
                'identity_name': 'test_user',
                'groups': [],
                'exp': datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
            },
            TEST_JWT_SECRET,
            algorithm=JWT_ALGO,
        )
        ALT_AUTH_HEADERS = {'Authorization': f'Bearer {ALT_TOKEN}'}
        count_response_alt = await client.post(
            '/api/core/data-variable/uid/count',
            json={'cache_key': third_response.json()['cache_key']},
            headers=ALT_AUTH_HEADERS,
        )
        assert count_response_alt.status_code == 400

        response = await _get_derived_variable(
            client,
            derived,
            {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False},
            headers=ALT_AUTH_HEADERS,
        )
        assert mock_func.call_count == 3


async def test_derived_data_variable_cache_session():
    """
    Test derived data variable works correctly with cache=CacheType.SESSION
    """
    builder = ConfigurationBuilder()
    builder.add_auth(BasicAuthConfig('test', 'password'))

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def func(a: int, data=TEST_DATA):
        df = data.copy()
        numeric_cols = [col for col in df if df[col].dtype == 'int64' and col != '__index__']
        df[numeric_cols] += int(a)
        return df

    mock_func = Mock(wraps=func)

    derived = DerivedDataVariable(mock_func, variables=[var1], uid='uid', cache=CacheType.SESSION)

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()
        cache_key = response.json()['cache_key']

        # Hit the endpoint again to make sure the cache is re-used
        second_response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False}
        )
        mock_func.assert_called_once()
        assert second_response.json()['cache_key'] == cache_key

        data_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )

        assert data_response.json() == func(1, FINAL_TEST_DATA).to_dict(orient='records')
        mock_func.assert_called_once()

        # Hit the data endpoint again to make sure cache is re-used
        data_second_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )
        assert data_response.json() == data_second_response.json()
        mock_func.assert_called_once()

        # Hit the derived endpoint again with different value, check that the function is called again
        third_response = await _get_derived_variable(
            client, derived, {'is_data_variable': True, 'values': [2], 'ws_channel': 'test_channel', 'force': False}
        )
        assert third_response.json()['cache_key'] != cache_key
        assert mock_func.call_count == 2

        # Check that calling the data endpoint with new cache key gives the expected result
        data_third_response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': third_response.json()['cache_key'], 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )
        assert data_third_response.json() == func(2, FINAL_TEST_DATA).to_dict(orient='records')
        assert mock_func.call_count == 2

        # Check count can be returned correctly
        count_response = await client.post(
            '/api/core/data-variable/uid/count',
            json={'cache_key': third_response.json()['cache_key']},
            headers=AUTH_HEADERS,
        )
        assert count_response.status_code == 200
        assert count_response.json() == 5
        assert mock_func.call_count == 2   # not called again

        # Test different session, count cannot be fetched and function is re-ran again
        ALT_TOKEN = jwt.encode(
            {
                'session_id': 'token',
                'identity_name': 'test_user2',
                'groups': [],
                'exp': datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
            },
            TEST_JWT_SECRET,
            algorithm=JWT_ALGO,
        )
        ALT_AUTH_HEADERS = {'Authorization': f'Bearer {ALT_TOKEN}'}
        count_response_alt = await client.post(
            '/api/core/data-variable/uid/count',
            json={'cache_key': third_response.json()['cache_key']},
            headers=ALT_AUTH_HEADERS,
        )
        assert count_response_alt.status_code == 400

        response = await _get_derived_variable(
            client,
            derived,
            {'is_data_variable': True, 'values': [1], 'ws_channel': 'test_channel', 'force': False},
            headers=ALT_AUTH_HEADERS,
        )
        assert mock_func.call_count == 3


@pytest.mark.parametrize('cache', [('session'), ('global')])
async def test_derived_data_variable_filter_metatask(cache):
    """
    Test filtering when DV returns a task
    Parametrized to run with both global and non-global cache, to make sure correct caching is used for results/counts
    """
    builder = ConfigurationBuilder()

    var1 = Variable()

    print('Cache:', cache)
    derived = DerivedDataVariable(data_task, variables=[var1], uid='uid', run_as_task=True, cache=cache)

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    def get_expected_data(x: int, data=TEST_DATA):
        df = data.copy()
        df[['col1', 'col2']] += x
        return df

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()

            response = await _get_derived_variable(
                client,
                derived,
                {
                    'is_data_variable': True,
                    'values': [1],
                    'ws_channel': init.get('message').get('channel'),
                    'force': False,
                },
            )
            cache_key = response.json()['cache_key']
            assert 'task_id' in response.json()

            # Hit the data endpoint
            data_response = await client.post(
                '/api/core/data-variable/uid',
                json={
                    'filters': {'column': 'col1', 'value': 2},
                    'cache_key': cache_key,
                    'ws_channel': init.get('message').get('channel'),
                },
                headers=AUTH_HEADERS,
            )

            # Since underlying DV returned a task we should get a task_id in the response as well
            assert 'task_id' in data_response.json()

            # Requesting count while task is running should result in an error - count is not cached yet
            count_response = await client.post(
                '/api/core/data-variable/uid/count',
                json={'filters': {'column': 'col1', 'value': 2}, 'cache_key': cache_key},
                headers=AUTH_HEADERS,
            )
            assert count_response.status_code == 400

            # # Hit the data endpoint again to check that we get the same task id (via a pending task)
            second_data_response = await client.post(
                '/api/core/data-variable/uid',
                json={
                    'filters': {'column': 'col1', 'value': 2},
                    'cache_key': cache_key,
                    'ws_channel': init.get('message').get('channel'),
                },
                headers=AUTH_HEADERS,
            )
            assert second_data_response.json()['task_id'] == data_response.json()['task_id']

            raw_messages = await get_ws_messages(websocket, timeout=6)
            assert all(data['message']['status'] == 'COMPLETE' for data in raw_messages)
            messages = set(data['message']['task_id'] for data in raw_messages)

            # check we received messages for the underlying task and the filter metatask
            expected_messages = ['uid_Task', 'uid_Filter_MetaTask']
            assert len(messages) == len(expected_messages)
            task_id = None
            meta_task_id = None
            for msg in messages:
                if msg.startswith(expected_messages[0]):
                    task_id = msg
                elif msg.startswith(expected_messages[1]):
                    meta_task_id = msg
                assert any(msg.startswith(x) for x in expected_messages)

            # Check we can get the result of the underlying task
            underlying_data = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
            assert underlying_data.json() == get_expected_data(1).to_dict(orient='records')

            # Check we can get the result of the filter metatask
            filter_data = await client.get(f'/api/core/tasks/{meta_task_id}', headers=AUTH_HEADERS)
            expected_data = get_expected_data(1, FINAL_TEST_DATA)
            expected_data = expected_data[expected_data['col1'] == 2]
            assert filter_data.json() == expected_data.to_dict(orient='records')

            # Check we can request the same filtered data again and receive the result directly
            response = await client.post(
                '/api/core/data-variable/uid',
                json={
                    'filters': {'column': 'col1', 'value': 2},
                    'cache_key': cache_key,
                    'ws_channel': init.get('message').get('channel'),
                },
                headers=AUTH_HEADERS,
            )
            assert response.json() == expected_data.to_dict(orient='records')

            # Check we can get count correctly now that task is finished
            count_response = await client.post(
                '/api/core/data-variable/uid/count',
                json={'filters': {'column': 'col1', 'value': 2}, 'cache_key': cache_key},
                headers=AUTH_HEADERS,
            )
            assert count_response.status_code == 200
            assert count_response.json() == len(expected_data.index)


async def test_derived_data_variable_in_derived_variable():
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')

    def calc(a, b: DataFrame):
        assert '__index__' not in b.columns
        return len(b.index) + a

    func = Mock(wraps=calc)

    def page():
        var1 = Variable(2)
        data_var = DerivedDataVariable(lambda: TEST_DATA, uid='uid', variables=[])

        derived = DerivedVariable(func, variables=[var1, data_var])
        dv.set(derived)
        return MockComponent(text=derived)

    builder.add_page('Test', page)
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    2,
                    {
                        'type': 'derived-data',
                        'uid': 'uid',
                        'values': [],
                        'filters': ValueQuery(column='col1', value=1).dict(),
                    },
                ],
                'ws_channel': 'test_channel',
                'force': False,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == 4
        func.assert_called_once()


async def test_derived_data_variable_run_as_task_in_derived_variable():
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')

    def calc(a, b: DataFrame):
        assert '__index__' not in b.columns
        return len(b.index) + a

    func = Mock(wraps=calc)

    def page():
        var1 = Variable()
        data_var = DerivedDataVariable(data_task, uid='uid', variables=[var1], run_as_task=True)

        derived = DerivedVariable(func, variables=[var1, data_var])
        dv.set(derived)
        return MockComponent(text=derived)

    builder.add_page('Test', content=page)
    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        # Wait for the websocket task finish message to be returned
        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()
            derived = dv.get()

            response = await _get_derived_variable(
                client,
                derived,
                {
                    # 2 rows + 2 = 4
                    'values': [
                        2,
                        {
                            # Returns 2 rows
                            'type': 'derived-data',
                            'uid': 'uid',
                            'values': [1],
                            'filters': ValueQuery(column='col1', value=2).dict(),
                        },
                    ],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
            )
            assert 'task_id' in response.json()
            task_id = response.json().get('task_id')

            # we get a few notifications about the underlying task/metatask as well
            raw_messages = await get_ws_messages(websocket, timeout=6)
            assert all(data['message']['status'] == 'COMPLETE' for data in raw_messages)
            messages = set(data['message']['task_id'] for data in raw_messages)

            assert str(task_id) in messages

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == 4

            # Hit the endpoint again with the same arguments and make sure the result is returned directly
            response = await _get_derived_variable(
                client,
                derived,
                {
                    # 2 rows + 2 = 4
                    'values': [
                        2,
                        {
                            # Returns 2 rows
                            'type': 'derived-data',
                            'uid': 'uid',
                            'values': [1],
                            'filters': ValueQuery(column='col1', value=2).dict(),
                        },
                    ],
                    'ws_channel': init.get('message', {}).get('channel'),
                    'force': False,
                },
            )
            assert response.json()['value'] == 4


async def test_py_component_with_derived_data_variable():
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')
    data_v = ContextVar('data_var')

    def page():
        var1 = Variable(2)
        data_var = DerivedDataVariable(lambda: TEST_DATA, variables=[], uid='uid_data')
        data_v.set(data_var)

        def calc(a, b: DataFrame):
            return a + len(b.index)

        derived = DerivedVariable(calc, variables=[var1, data_var], uid='uid_derived')
        dv.set(derived)

        @py_component
        def TestBasicComp(input_val: DataFrame, input_val_2: int):
            assert '__index__' not in input_val.columns
            return MockComponent(text=str(len(input_val.index) + input_val_2))

        return TestBasicComp(data_var, derived)

    builder.add_page('Test', content=page)
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': data_v.get(), 'input_val_2': dv.get()},
            data={
                'uid': component.get('uid'),
                'values': {
                    'input_val': {
                        'type': 'derived-data',
                        'values': [],
                        'uid': 'uid_data',
                        'filters': ValueQuery(column='col1', value=1).dict(),
                    },
                    'input_val_2': {
                        'type': 'derived',
                        'uid': 'uid_derived',
                        'values': [
                            2,
                            {
                                'type': 'derived-data',
                                'values': [],
                                'uid': 'uid_data',
                                'filters': ValueQuery(column='col1', value=3).dict(),
                            },
                        ],
                    },
                },
                'ws_channel': 'test_channel',
                'force': False,
            },
        )

        # Should return (2 + len(df, where df.col1=3)) + len(df, where df.col1=1), so (2 + 1 + 2) = 5
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '5', 'action': None}, 'uid': 'uid'}


async def test_py_component_with_derived_data_variable_run_as_task():
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')
    data_v = ContextVar('data_var')

    def page():
        var = Variable()
        data_var = DerivedDataVariable(data_task, variables=[var], uid='uid_data', run_as_task=True)
        data_v.set(data_var)

        def calc(a, b: DataFrame):
            return a + len(b.index)

        var1 = Variable(2)
        derived = DerivedVariable(calc, variables=[var1, data_var], uid='uid_derived')
        dv.set(derived)

        @py_component
        def TestBasicComp(input_val: DataFrame, input_val_2: int):
            assert '__index__' not in input_val.columns
            return MockComponent(text=str(len(input_val.index) + input_val_2))

        return TestBasicComp(data_var, derived)

    builder.add_page('Test', content=page)
    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()
            ws_channel = init.get('message', {}).get('channel')

            response, status = await _get_template(client)
            component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

            response = await _get_py_component(
                client,
                component.get('name'),
                kwargs={'input_val': data_v.get(), 'input_val_2': dv.get()},
                data={
                    'uid': component.get('uid'),
                    'values': {
                        'input_val': {
                            # Returns 2 rows
                            'type': 'derived-data',
                            'values': [1],
                            'uid': 'uid_data',
                            'filters': ValueQuery(column='col1', value=2).dict(),
                        },
                        'input_val_2': {
                            'type': 'derived',
                            'uid': 'uid_derived',
                            'values': [
                                2,
                                {
                                    # returns 1 row
                                    'type': 'derived-data',
                                    'values': [1],
                                    'uid': 'uid_data',
                                    'filters': ValueQuery(column='col1', value=3).dict(),
                                },
                            ],
                        },
                    },
                    'ws_channel': ws_channel,
                    'force': False,
                },
            )

            assert 'task_id' in response.json()
            task_id = response.json().get('task_id')

            raw_messages = await get_ws_messages(websocket, timeout=6)
            assert all(data['message']['status'] == 'COMPLETE' for data in raw_messages)
            messages = set(data['message']['task_id'] for data in raw_messages)

            assert task_id in messages

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
            assert result.status_code == 200

            # Should return (2 + len(df, where df.col1=2)) + len(df, where df.col1=3), so (2 + 2 + 1) = 5
            assert result.json() == {'name': 'MockComponent', 'props': {'text': '5', 'action': None}, 'uid': 'uid'}


async def test_update_variable_extras_derived_data_variable_run_as_task():
    builder = ConfigurationBuilder()

    action = ContextVar('action')

    def resolver(ctx: UpdateVariable.Ctx):
        data = ctx.extras[0]
        assert '__index__' not in data.columns
        return len(data.index)

    def page():
        var1 = Variable()
        data_var = DerivedDataVariable(data_task, uid='data_uid', variables=[var1], run_as_task=True)

        var = Variable()
        act = UpdateVariable(resolver, variable=var, extras=[data_var])
        action.set(act)
        return MockComponent(text=data_var, action=act)

    builder.add_page('Test', content=page)
    config = create_app(builder, use_tasks=True)

    app = _start_application(config)
    async with AsyncClient(app) as client:

        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()
            act = action.get()

            response = await _call_action(
                client,
                act,
                data={
                    'inputs': {'old': None, 'new': None},
                    'extras': [
                        {
                            # Returns 2 rows
                            'type': 'derived-data',
                            'values': [1],
                            'uid': 'data_uid',
                            'filters': ValueQuery(column='col1', value=2).dict(),
                        },
                    ],
                    'ws_channel': init.get('message', {}).get('channel'),
                },
            )

            assert 'task_id' in response.json()
            task_id = response.json().get('task_id')

            raw_messages = await get_ws_messages(websocket, timeout=6)
            assert all(data['message']['status'] == 'COMPLETE' for data in raw_messages)
            messages = set(data['message']['task_id'] for data in raw_messages)

            assert str(task_id) in messages

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == 2


async def test_update_variable_extras_derived_data_variable():
    builder = ConfigurationBuilder()

    action = ContextVar('action')

    def resolver(ctx: UpdateVariable.Ctx):
        data = ctx.extras[0]
        assert '__index__' not in data.columns
        return len(data.index)

    def page():
        data_var = DerivedDataVariable(uid='data_uid', func=lambda: TEST_DATA, variables=[])
        var = Variable()
        act = UpdateVariable(resolver, variable=var, extras=[data_var])
        action.set(act)
        return MockComponent(text=data_var, action=act)

    builder.add_page('Test', content=page)
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _call_action(
            client,
            action.get(),
            data={
                'inputs': {'old': None, 'new': None},
                'extras': [
                    {
                        'type': 'derived-data',
                        'values': [],
                        'uid': 'data_uid',
                        'filters': ValueQuery(column='col1', value=1).dict(),
                    },
                ],
                'ws_channel': 'uid',
            },
        )
        assert response.json() == 2


async def test_derived_data_variable_with_derived_variable():
    """
    Test that a DerivedDataVariable can use a DerivedVariable.
    This is a regression test for a bug causing DDV to improperly get value from a child DV.
    """
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')

    def calc(a: DataFrame, b: int):
        assert '__index__' not in a.columns
        cp = a.copy()
        cp['col1'] += int(b)
        return cp

    def page():
        var1 = Variable(10)
        derived = DerivedVariable(lambda x: x, variables=[var1], uid='dv')   # identity
        data = DataVariable(TEST_DATA, uid='data')
        data_var = DerivedDataVariable(calc, uid='uid', variables=[data, derived])

        dv.set(data_var)
        return MockComponent(text=data_var)

    builder.add_page('Test', page)
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'type': 'derived-data',
                'uid': 'uid',
                'values': [{'type': 'data', 'uid': 'data'}, {'type': 'derived', 'values': [10], 'uid': 'dv'}],
                'filters': None,
                'ws_channel': 'test_channel',
                'force': False,
                'is_data_variable': True,
            },
        )

        assert response.status_code == 200
        assert response.json()['value'] == True
        cache_key = response.json()['cache_key']

        response = await client.post(
            '/api/core/data-variable/uid',
            json={'filters': None, 'cache_key': cache_key, 'ws_channel': 'test_channel'},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 200
        resp_data = DataFrame(response.json())
        assert all(resp_data['col1'] == (TEST_DATA['col1'] + 10))
