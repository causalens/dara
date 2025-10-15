import os
from contextvars import ContextVar
from multiprocessing import active_children
from typing import cast
from unittest.mock import Mock

import anyio
import pytest
from async_asgi_testclient import TestClient as AsyncClient
from pandas import DataFrame

from dara.core.base_definitions import Action
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.filtering import FilterQuery, Pagination, ValueQuery, apply_filters
from dara.core.interactivity.plain_variable import Variable
from dara.core.internal.dependency_resolution import ResolvedServerVariable
from dara.core.internal.pandas_utils import DataResponse, append_index, df_convert_to_internal
from dara.core.internal.registries import utils_registry
from dara.core.internal.tasks import TaskManager
from dara.core.main import _start_application

from tests.python.utils import (
    AUTH_HEADERS,
    _async_ws_connect,
    _get_tabular_derived_variable,
    create_app,
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
FINAL_TEST_DATA = cast(DataFrame, append_index(TEST_DATA))
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
        derived_variable_registry,
        server_variable_registry,
        utils_registry,
    )

    server_variable_registry.replace({})
    derived_variable_registry.replace({})
    await utils_registry.get('Store').clear()

    yield

    # Check no leftover children
    await wait_assert(lambda: len(active_children()) == 0, timeout=5)


class MockComponent(ComponentInstance):
    text: str | DataVariable | DerivedVariable
    action: Action | None = None

    def __init__(self, text: str | DataVariable | DerivedVariable, action: Action | None = None):
        super().__init__(text=text, uid='uid', action=action)


MockComponent.model_rebuild()


async def test_derived_tabular_variable_ws_channel_required():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def identity(a):
        return a

    mock_func = Mock(wraps=identity)

    derived = DerivedVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        data_response = await client.post(
            '/api/core/tabular-variable/uid', json={'dv_values': {'lookup': {}, 'data': []}}, headers=AUTH_HEADERS
        )
        assert data_response.status_code == 422


async def test_derived_tabular_variable_must_return_dataframe():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def identity(a):
        return a

    mock_func = Mock(wraps=identity, return_value=0)

    derived = DerivedVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await _get_tabular_derived_variable(
            client, derived, {'dv_values': [0], 'ws_channel': 'test_channel', 'force_key': None}, expect_success=False
        )
        assert response.status_code == 415
        assert 'expects a DataFrame' in response.json()['detail']
        assert mock_func.call_count == 1


async def test_tabular_derived_variable_no_filters():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def func(a: int, data=TEST_DATA):
        df = data.copy()
        numeric_cols = [col for col in df if df[col].dtype == 'int64' and col != '__index__']
        df[numeric_cols] += int(a)
        return df

    mock_func = Mock(wraps=func)

    derived = DerivedVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_tabular_derived_variable(
            client, derived, {'dv_values': [1], 'ws_channel': 'test_channel', 'force_key': None}
        )
        mock_func.assert_called_once()
        data_response: DataResponse = response.json()

        schema = data_response['schema']
        assert schema is not None
        assert {'name': '__col__1__col1', 'type': 'integer'} in schema['fields']
        assert {'name': '__col__2__col2', 'type': 'integer'} in schema['fields']
        assert {'name': '__col__3__col3', 'type': 'string'} in schema['fields']
        assert {'name': '__col__4__col4', 'type': 'string'} in schema['fields']
        assert {'name': '__index__0__index', 'type': 'integer'} in schema['fields']

        # Hit the endpoint again to make sure the cache is re-used
        await _get_tabular_derived_variable(
            client, derived, {'dv_values': [1], 'ws_channel': 'test_channel', 'force_key': None}
        )
        mock_func.assert_called_once()

        assert data_response['data'] == df_convert_to_internal(func(1, FINAL_TEST_DATA)).to_dict(orient='records')

        # Hit the derived endpoint again with different value, check that the function is called again
        third_response = await _get_tabular_derived_variable(
            client, derived, {'dv_values': [2], 'ws_channel': 'test_channel', 'force_key': None}
        )
        assert mock_func.call_count == 2
        data_third_response: DataResponse = third_response.json()
        assert data_third_response['data'] == df_convert_to_internal(func(2, FINAL_TEST_DATA)).to_dict(orient='records')
        assert data_third_response['count'] == 5
        schema = data_third_response['schema']
        assert schema is not None
        assert {'name': '__col__1__col1', 'type': 'integer'} in schema['fields']
        assert {'name': '__col__2__col2', 'type': 'integer'} in schema['fields']
        assert {'name': '__col__3__col3', 'type': 'string'} in schema['fields']
        assert {'name': '__col__4__col4', 'type': 'string'} in schema['fields']
        assert {'name': '__index__0__index', 'type': 'integer'} in schema['fields']


async def test_tabular_derived_variable_with_filters():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def func(a: int, data=TEST_DATA):
        df = data.copy()
        numeric_cols = [col for col in df if df[col].dtype == 'int64' and col != '__index__']
        df[numeric_cols] += int(a)
        return df

    mock_func = Mock(wraps=func)

    derived = DerivedVariable(mock_func, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await _get_tabular_derived_variable(
            client,
            derived,
            {
                'dv_values': [1],
                'ws_channel': 'test_channel',
                'force_key': None,
                'filters': {'column': 'col1', 'value': 1},
            },
        )
        data_response: DataResponse = response.json()
        unfiltered = df_convert_to_internal(func(1, FINAL_TEST_DATA))
        expected = unfiltered[unfiltered['__col__1__col1'] == 1].to_dict(orient='records')
        assert data_response['data'] == expected
        assert data_response['count'] == len(expected)
        assert mock_func.call_count == 1

        # Make sure a different filter returns a different result (dv is not re-ran but the filtering is)
        data_second_response = await _get_tabular_derived_variable(
            client,
            derived,
            {
                'dv_values': [1],
                'ws_channel': 'test_channel',
                'force_key': None,
                'filters': {'column': 'col1', 'value': 2},
            },
        )
        expected = unfiltered[unfiltered['__col__1__col1'] == 2].to_dict(orient='records')
        assert data_second_response.json()['data'] == expected
        assert data_second_response.json()['count'] == len(expected)
        assert mock_func.call_count == 1


async def test_tabular_derived_variable_with_custom_filter_resolver():
    builder = ConfigurationBuilder()

    var1 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def func(a: int):
        return a + 1

    async def filter_resolver(data: int, filters: FilterQuery | None = None, pagination: Pagination | None = None):
        slice = cast(DataFrame, TEST_DATA[TEST_DATA['col1'] == data])
        return apply_filters(slice, filters, pagination)

    mock_func = Mock(wraps=func)
    mock_filter_resolver = Mock(wraps=filter_resolver)

    derived = DerivedVariable(mock_func, filter_resolver=mock_filter_resolver, variables=[var1], uid='uid')

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # First call with no filters - should return all sliced data
        response = await _get_tabular_derived_variable(
            client,
            derived,
            {
                'dv_values': [0],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        data_response: DataResponse = response.json()
        # == 1 since we filter with 0+1
        expected = df_convert_to_internal(TEST_DATA[TEST_DATA['col1'] == 1]).to_dict(orient='records')
        assert data_response['data'] == expected
        assert data_response['count'] == len(expected)
        assert data_response['count'] == 2  # sanity check, should be 2
        assert mock_func.call_count == 1
        assert mock_filter_resolver.call_count == 1

        # Then filter where col2==6, should narrow down result to 1 row
        response = await _get_tabular_derived_variable(
            client,
            derived,
            {
                'dv_values': [0],
                'ws_channel': 'test_channel',
                'force_key': None,
                'filters': ValueQuery(column='col2', value=6).dict(),
            },
        )
        data_response: DataResponse = response.json()
        # == 1 since we filter with 0+1
        dv_result = df_convert_to_internal(TEST_DATA[TEST_DATA['col1'] == 1])
        # extra filter specified
        expected = dv_result[dv_result['__col__2__col2'] == 6].to_dict(orient='records')
        assert data_response['data'] == expected
        assert data_response['count'] == len(expected)
        assert data_response['count'] == 1
        assert mock_func.call_count == 1  # not called again, different filters
        assert mock_filter_resolver.call_count == 2  # called again on every request


@pytest.mark.parametrize('cache', [('session'), ('global')])
async def test_tabular_derived_variable_filter_metatask(cache):
    """
    Test filtering when DV returns a task
    Parametrized to run with both global and non-global cache, to make sure correct caching is used for results/counts
    """
    builder = ConfigurationBuilder()

    var1 = Variable()

    derived = DerivedVariable(data_task, variables=[var1], uid='uid', run_as_task=True, cache=cache)

    builder.add_page('Test', content=MockComponent(text=derived))
    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    def get_expected_data(x: int, data=TEST_DATA):
        df = data.copy()
        df[['col1', 'col2']] += x
        return df

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        task_mgr: TaskManager = utils_registry.get('TaskManager')
        init = await websocket.receive_json()

        response = await _get_tabular_derived_variable(
            client,
            derived,
            {
                'dv_values': [1],
                'ws_channel': init.get('message').get('channel'),
                'filters': {'column': 'col1', 'value': 2},
                'force_key': None,
            },
        )
        assert 'task_id' in response.json()
        assert len(task_mgr.tasks) == 2  # task + filter metatask

        # Hit the data endpoint again, we'll get a different meta-task since we don't cache the filtered results
        second_response = await _get_tabular_derived_variable(
            client,
            derived,
            {
                'dv_values': [1],
                'ws_channel': init.get('message').get('channel'),
                'filters': {'column': 'col1', 'value': 2},
                'force_key': None,
            },
        )
        assert second_response.json()['task_id'] != response.json()['task_id']
        assert len(task_mgr.tasks) == 3  # task + 2 filter metatasks

        meta_task_ids = [response.json()['task_id'], second_response.json()['task_id']]
        received_meta_completions = []

        while True:
            with anyio.move_on_after(6) as scope:
                msg = await websocket.receive_json()
                if msg['message']['status'] == 'COMPLETE' and msg['message']['task_id'] in meta_task_ids:
                    received_meta_completions.append(msg['message']['task_id'])

                if len(received_meta_completions) == 2:
                    break

            if scope.cancel_called:
                break

        # there should be two metatasks, but the underlying DV should only have one
        assert len(meta_task_ids) == 2
        # give the task mgr extra time to set the results, sometimes it can be too fast in the tests
        await anyio.sleep(1)

        for meta_task_id in meta_task_ids:
            # Check we can get the result of the filter metatask
            filter_data = await client.get(f'/api/core/tasks/{meta_task_id}', headers=AUTH_HEADERS)
            expected_data = get_expected_data(1, FINAL_TEST_DATA)
            expected_data = expected_data[expected_data['col1'] == 2]
            assert filter_data.json()['data'] == df_convert_to_internal(expected_data).to_dict(orient='records')

        # Check we can request the same filtered data again and receive the result directly
        response = await _get_tabular_derived_variable(
            client,
            derived,
            {
                'dv_values': [1],
                'ws_channel': init.get('message').get('channel'),
                'filters': {'column': 'col1', 'value': 2},
                'force_key': None,
            },
        )
        assert response.json()['data'] == df_convert_to_internal(expected_data).to_dict(orient='records')
        assert response.json()['count'] == len(expected_data.index)


async def test_tabular_derived_variable_with_derived_variable():
    """
    Test that a tabular DerivedVariable can use a DerivedVariable.
    This is a regression test for a bug causing tabular DV to improperly get value from a child DV.
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
        derived = DerivedVariable(lambda x: x, variables=[var1], uid='dv')  # identity
        data = DataVariable(TEST_DATA, uid='data')
        data_var = DerivedVariable(calc, uid='uid', variables=[data, derived])

        dv.set(data_var)
        return MockComponent(text=data_var)

    builder.add_page('Test', page)
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_tabular_derived_variable(
            client,
            dv.get(),
            {
                'uid': 'uid',
                'dv_values': [
                    ResolvedServerVariable(type='server', uid='data', sequence_number=1),
                    {'type': 'derived', 'values': [10], 'uid': 'dv'},
                ],
                'filters': None,
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        data_response: DataResponse = response.json()
        resp_data = DataFrame(data_response['data'])
        assert all(resp_data['__col__1__col1'] == (TEST_DATA['col1'] + 10))


async def test_tabular_derived_variable_pending_value():
    """
    Test that DerivedVariable handles the case where it's being recalculated twice
    while being requested.
    This is a regression test for a bug where a PendingValue would instead be returned from the
    DerivedVariable.
    """
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')

    ev = anyio.Event()

    call_count = 0

    async def calc(a: DataFrame, b: int):
        nonlocal call_count

        # First call we compute a value normally
        if call_count == 0:
            call_count += 1
        elif call_count == 1:
            # second call we control when we unlock the computation
            await ev.wait()
        else:
            assert False, 'too many calls'

        assert '__index__' not in a.columns
        cp = a.copy()
        cp['col1'] += int(b)
        return cp

    def page():
        data = DataVariable(TEST_DATA, uid='data')
        data_var = DerivedVariable(calc, uid='uid', variables=[data, Variable(10)])

        dv.set(data_var)

        return MockComponent(text=data_var)

    builder.add_page('Test', page)

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        # invoke the derived part once
        response = await _get_tabular_derived_variable(
            client,
            dv.get(),
            {
                'uid': 'uid',
                'dv_values': [
                    ResolvedServerVariable(type='server', uid='data', sequence_number=1),
                    10,
                ],
                'filters': None,
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        async with anyio.create_task_group() as tg:
            # kick off the second calculation
            tg.start_soon(
                _get_tabular_derived_variable,
                client,
                dv.get(),
                {
                    'uid': 'uid',
                    'dv_values': [
                        ResolvedServerVariable(type='server', uid='data', sequence_number=1),
                        10,
                    ],
                    'filters': None,
                    'ws_channel': 'test_channel',
                    'force_key': 'test_force_key',  # force recalculation
                },
            )

            response3 = None

            async def _get_data():
                nonlocal response3
                response3 = await _get_tabular_derived_variable(
                    client,
                    dv.get(),
                    {
                        'dv_values': [
                            ResolvedServerVariable(type='server', uid='data', sequence_number=1),
                            10,
                        ],
                        'ws_channel': 'test_channel',
                        'force_key': None,
                    },
                )

            # Kick off a request to get the data
            await anyio.sleep(0.5)
            tg.start_soon(_get_data)

            # unblock the request and wait for data to complete
            assert response3 is None
            await anyio.sleep(0.5)
            ev.set()
            await wait_assert(lambda: response3 is not None, timeout=3)
            assert response3 is not None

            # check response3 is the correct data
            assert response3.status_code == 200
            resp_data = DataFrame(response3.json()['data'])
            assert all(resp_data['__col__1__col1'] == (TEST_DATA['col1'] + 10))
