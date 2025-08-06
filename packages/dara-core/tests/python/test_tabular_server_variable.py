import datetime
import os
from contextvars import ContextVar
from typing import Optional, Union, cast
from unittest.mock import Mock, patch

import jwt
import pytest
from async_asgi_testclient import TestClient as AsyncClient
from pandas import DataFrame

from dara.core.auth.basic import BasicAuthConfig
from dara.core.auth.definitions import JWT_ALGO
from dara.core.base_definitions import Action, CacheType
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import DataVariable, Variable
from dara.core.interactivity.actions import UpdateVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.filtering import ClauseQuery, QueryCombinator, ValueQuery
from dara.core.interactivity.plain_variable import Variable
from dara.core.internal.dependency_resolution import ResolvedServerVariable
from dara.core.internal.pandas_utils import append_index, df_convert_to_internal
from dara.core.main import _start_application
from dara.core.visual.dynamic_component import py_component

from tests.python.utils import (
    TEST_JWT_SECRET,
    _async_ws_connect,
    _call_action,
    _get_derived_variable,
    _get_py_component,
    _get_tabular_server_variable,
    _get_template,
    get_action_results,
    wait_assert,
)

pytestmark = pytest.mark.anyio

TEST_DATA = DataFrame(
    {
        'col1': [1, 2, 3, 4, 1],
        'col2': [6, 7, 8, 6, 10],
        'col3': ['a', 'b', 'a', 'd', 'e'],
        'col4': ['f', 'f', 'h', 'i', 'j'],
    }
)
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
FINAL_TEST_DATA = cast(DataFrame, append_index(TEST_DATA))

os.environ['DARA_DOCKER_MODE'] = 'TRUE'


@pytest.fixture(autouse=True)
async def reset_data_variable_cache():
    """
    Reset the data variable cache between tests
    """
    from dara.core.internal.registries import server_variable_registry, utils_registry

    server_variable_registry.replace({})
    await utils_registry.get('Store').clear()
    yield


class MockComponent(ComponentInstance):
    text: Union[str, DataVariable, DerivedVariable]
    action: Optional[Action] = None

    def __init__(self, text: Union[str, DataVariable, DerivedVariable], action: Optional[Action] = None):
        super().__init__(text=text, uid='uid', action=action)


MockComponent.model_rebuild()


async def test_data_cache_combinations():
    """
    Test that DataVariable cannot be cached per session or per user if provided upfront
    """
    with pytest.raises(ValueError):
        DataVariable(data=TEST_DATA, cache=CacheType.USER)

    with pytest.raises(ValueError):
        DataVariable(data=TEST_DATA, cache=CacheType.SESSION)


async def test_fetching_global_data_variable():
    """
    Test that global DataVariable can be fetched from the backend
    """

    builder = ConfigurationBuilder()

    data_var = DataVariable(uid='uid', data=TEST_DATA)
    builder.add_page('Test', content=lambda: MockComponent(text=data_var))

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await _get_tabular_server_variable(
            client,
            data_var,
            {
                'ws_channel': 'test_channel',
            },
        )
        assert response.json()['data'] == df_convert_to_internal(FINAL_TEST_DATA).to_dict(orient='records')
        assert response.json()['count'] == 5
        data = response.json()['schema']
        assert {'name': '__col__1__col1', 'type': 'integer'} in data['fields']
        assert {'name': '__col__2__col2', 'type': 'integer'} in data['fields']
        assert {'name': '__col__3__col3', 'type': 'string'} in data['fields']
        assert {'name': '__col__4__col4', 'type': 'string'} in data['fields']
        assert {'name': '__index__0__index', 'type': 'integer'} in data['fields']


async def test_fetching_global_data_variable_filters():
    """
    Test that global DataVariable can be fetched from the backend with filters and pagination
    """

    builder = ConfigurationBuilder()

    # Should return indexes [0, 1, 2, 4]
    query = ClauseQuery(
        combinator=QueryCombinator.OR,
        clauses=[
            ValueQuery(column='col1', value=1),
            ValueQuery(column='col1', value=2),
            ClauseQuery(
                combinator=QueryCombinator.AND,
                clauses=[
                    ValueQuery(column='col3', value='a'),
                    ValueQuery(column='col4', value='h'),
                ],
            ),
        ],
    )

    data_var = DataVariable(uid='uid', data=TEST_DATA)
    builder.add_page('Test', content=lambda: MockComponent(text=data_var))

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        # also paginate from [0, 1, 2, 4] to [1, 2]
        response = await _get_tabular_server_variable(
            client,
            data_var,
            {
                'ws_channel': 'test_channel',
                'filters': query.dict(),
            },
            query_string={'limit': 2, 'offset': 1},
        )
        assert response.json()['data'] == df_convert_to_internal(FINAL_TEST_DATA).iloc[[1, 2]].to_dict(orient='records')
        assert response.json()['count'] == 4


@patch('dara.core.interactivity.actions.uuid.uuid4', return_value='uid')
async def test_update_variable_extras_data_variable(_uid):
    """
    Test that DataVariable can be used within extras in UpdateVariable and that the data does not get the extra __index__ column
    """
    builder = ConfigurationBuilder()

    action = ContextVar('action')

    def resolver(ctx: UpdateVariable.Ctx):
        data = ctx.extras[0]
        assert '__index__' not in data.columns
        return len(data.index)

    def page():
        data_var = DataVariable(uid='data_uid', data=TEST_DATA)
        var = Variable()
        act = UpdateVariable(resolver, variable=var, extras=[data_var])
        action.set(act)
        return MockComponent(text=data_var, action=act)

    builder.add_page('Test', content=page)

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client, _async_ws_connect(client) as ws:
        exec_uid = 'execution_id'
        await _call_action(
            client,
            action.get(),
            data={
                'input': None,
                'values': {
                    'old': None,
                    'kwarg_0': ResolvedServerVariable(
                        type='server',
                        uid='data_uid',
                        sequence_number=0,
                    ),
                },
                'ws_channel': 'uid',
                'execution_id': exec_uid,
            },
        )
        actions = await get_action_results(ws, exec_uid)
        assert len(actions) == 1
        assert actions[0]['value'] == len(TEST_DATA.index)  # entire data length
        assert actions[0]['name'] == 'UpdateVariable'
        assert actions[0]['variable']['uid'] == 'uid'


@patch('dara.core.interactivity.actions.uuid.uuid4', return_value='uid')
@patch('dara.core.interactivity.any_variable.uuid.uuid4', return_value='uid')
async def test_update_variable_session_data_variable(_uid1, _uid2):
    """
    Test that DataVariable can be used as a target for UpdateVariable with session
    """
    builder = ConfigurationBuilder()

    call_count = 0

    def resolver(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return TEST_DATA

    action = ContextVar('action')

    data_var = DataVariable(uid='data_uid', cache=CacheType.SESSION)

    def page():
        act = UpdateVariable(resolver, variable=data_var)
        action.set(act)
        return MockComponent(text=data_var, action=act)

    builder.add_page('Test', content=page)

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        # Verify variable is null at first
        response = await _get_tabular_server_variable(
            client,
            data_var,
            {
                'ws_channel': 'test_channel',
            },
        )
        assert response.json()['data'] is None

        # Update variable for user1
        response = await _call_action(
            client,
            action.get(),
            data={
                'input': None,
                'values': {
                    'old': None,
                },
                'ws_channel': 'uid',
            },
        )
        assert response.status_code == 200
        await wait_assert(lambda: call_count == 1)

        # Check variable is updated for session1
        response = await _get_tabular_server_variable(
            client,
            data_var,
            {
                'ws_channel': 'test_channel',
            },
        )
        assert response.json()['data'] == df_convert_to_internal(FINAL_TEST_DATA).to_dict(orient='records')
        assert response.json()['count'] == len(TEST_DATA.index)

        # Check variable for session2 is unchanged as it's session based
        another_token = jwt.encode(
            {
                'session_id': 'another_token',
                'identity_id': 'user',
                'identity_name': 'user',
                'exp': datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
            },
            TEST_JWT_SECRET,
            algorithm=JWT_ALGO,
        )

        response = await _get_tabular_server_variable(
            client,
            data_var,
            {
                'ws_channel': 'test_channel',
            },
            headers={'Authorization': f'Bearer {another_token}'},
        )
        assert response.status_code == 200
        assert response.json()['data'] is None
        assert response.json()['count'] == 0


@patch('dara.core.interactivity.actions.uuid.uuid4', return_value='uid')
@patch('dara.core.interactivity.any_variable.uuid.uuid4', return_value='uid')
async def test_update_variable_user_data_variable(_uid1, _uid2):
    """
    Test that DataVariable can be used as a target for UpdateVariable with user cache
    """
    builder = ConfigurationBuilder()
    builder.add_auth(BasicAuthConfig('user', 'pass'))

    call_count = 0

    def resolver(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return TEST_DATA

    action = ContextVar('action')

    data_var = DataVariable(uid='data_uid', cache=CacheType.USER)

    def page():
        act = UpdateVariable(resolver, variable=data_var)
        action.set(act)
        return MockComponent(text=data_var, action=act)

    builder.add_page('Test', content=page)

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        # Verify variable is null at first
        response = await _get_tabular_server_variable(
            client,
            data_var,
            {
                'ws_channel': 'test_channel',
            },
        )
        assert response.json()['data'] is None

        # Update variable for user1
        response = await _call_action(
            client,
            action.get(),
            data={
                'input': None,
                'values': {
                    'old': None,
                },
                'ws_channel': 'uid',
            },
        )
        assert response.status_code == 200
        await wait_assert(lambda: call_count == 1)

        # Check variable is updated for user1
        response = await _get_tabular_server_variable(
            client,
            data_var,
            {
                'ws_channel': 'test_channel',
            },
        )
        assert response.json()['data'] == df_convert_to_internal(FINAL_TEST_DATA).to_dict(orient='records')
        assert response.json()['count'] == len(TEST_DATA.index)

        # Check variable for user2 is unchanged as it's user based
        another_token = jwt.encode(
            {
                'session_id': 'token2',
                'identity_id': 'test_user_another',
                'identity_name': 'test_user_another',
                'exp': datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
            },
            TEST_JWT_SECRET,
            algorithm=JWT_ALGO,
        )

        response = await _get_tabular_server_variable(
            client,
            data_var,
            {
                'ws_channel': 'test_channel',
            },
            headers={'Authorization': f'Bearer {another_token}'},
        )
        assert response.json()['data'] is None
        assert response.json()['count'] == 0


async def test_derived_variable_with_data_variable():
    """
    Test that DataVariable can be used in a DerivedVariable.variables
    """
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')

    def calc(a, b: DataFrame):
        assert '__index__' not in b.columns
        return len(b.index) + a

    func = Mock(wraps=calc)

    data_var = DataVariable(data=TEST_DATA, uid='uid')

    def page():
        var1 = Variable(2)
        derived = DerivedVariable(func, variables=[var1, data_var])
        dv.set(derived)
        return MockComponent(text=derived)

    builder.add_page('Test', page)

    config = builder._to_configuration()

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    2,
                    ResolvedServerVariable(
                        type='server',
                        uid='uid',
                        sequence_number=0,
                    ),
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        assert response.json()['value'] == 7  # 2 + 5 (len)
        assert func.call_count == 1

        # If requesting again, the calculation should not be called again
        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    2,
                    ResolvedServerVariable(
                        type='server',
                        uid='uid',
                        sequence_number=0,
                    ),
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        assert response.json()['value'] == 7  # 2 + 5 (len)
        assert func.call_count == 1

        # If requested with different seq number, calculation should be called again
        response = await _get_derived_variable(
            client,
            dv.get(),
            {
                'values': [
                    2,
                    ResolvedServerVariable(
                        type='server',
                        uid='uid',
                        sequence_number=1,
                    ),
                ],
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )
        assert response.status_code == 200
        assert response.json()['value'] == 7  # 2 + 5 (len)
        assert func.call_count == 2


async def test_py_component_with_data_variable():
    """
    Test that DataVariable can be used in a py_component
    """
    builder = ConfigurationBuilder()

    dv = ContextVar('dv')
    data_v = ContextVar('data_var')

    def page():
        var1 = Variable(2)
        data_var = DataVariable(data=TEST_DATA, uid='uid_data')
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

    config = builder._to_configuration()

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        response, status = await _get_template(client)
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        data = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': data_v.get(), 'input_val_2': dv.get()},
            data={
                'uid': component.get('uid'),
                'values': {
                    'input_val': ResolvedServerVariable(
                        type='server',
                        uid='uid_data',
                        sequence_number=0,
                    ),
                    'input_val_2': {
                        'type': 'derived',
                        'uid': 'uid_derived',
                        'values': [
                            2,
                            ResolvedServerVariable(
                                type='server',
                                uid='uid_data',
                                sequence_number=0,
                            ),
                        ],
                    },
                },
                'ws_channel': 'test_channel',
                'force_key': None,
            },
        )

        # Should return (2 + len(df)) + len(df), so (2 + 5 + 5) = 12
        assert data == {'name': 'MockComponent', 'props': {'text': '12', 'action': None}, 'uid': 'uid'}
