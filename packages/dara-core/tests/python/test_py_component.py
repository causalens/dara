import os
from unittest.mock import Mock, patch

import anyio
import pytest
from async_asgi_testclient import TestClient as AsyncClient
from pydantic.main import BaseModel

from dara.core import DerivedVariable, Variable, py_component
from dara.core.base_definitions import Cache
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import BaseFallback, ComponentInstance
from dara.core.internal.normalization import denormalize
from dara.core.main import _start_application

from tests.python.tasks import (
    add,
    calc_task,
    leaf_1,
    leaf_2,
    root,
    track_longer_task,
    track_longer_task_2,
    track_task,
)
from tests.python.utils import (
    AUTH_HEADERS,
    _async_ws_connect,
    _get_py_component,
    _get_template,
    create_app,
    get_ws_messages,
)

pytestmark = pytest.mark.anyio

# Docker mode forces no JS build
os.environ['DARA_DOCKER_MODE'] = 'TRUE'


class MockComponent(ComponentInstance):
    text: str

    def __init__(self, text: str):
        super().__init__(text=text, uid='uid')


# inherits from BaseFallback to make it a valid fallback/placeholder
class MockFallbackComponent(BaseFallback, ComponentInstance):
    text: str

    def __init__(self, text: str):
        super().__init__(text=text, uid='uid')


class MockComponentTwo(ComponentInstance):
    text: str
    text2: str

    def __init__(self, text: str, text2: str):
        super().__init__(text=text, text2=text2, uid='uid')


async def test_simple_usecases():
    """Check that the py_component decorator works correctly for a simple usecases"""

    builder = ConfigurationBuilder()

    @py_component
    def TestSimpleComp():
        return MockComponent(text='test')

    @py_component
    def TestBasicComp(input_val: str):
        return MockComponent(text=input_val)

    builder.add_page('Test', content=TestSimpleComp())
    builder.add_page('Test2', content=TestBasicComp('test'))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        response, status = await _get_template(client)

        # Check that two components have been generated and inserted instead of the MockComponent
        components = response.get('layout').get('props').get('content').get('props').get('routes')
        assert len(components) == 2
        assert (
            isinstance(components[0].get('content').get('name'), str)
            and components[0].get('content').get('name') != 'MockComponent'
        )
        assert (
            isinstance(components[1].get('content').get('name'), str)
            and components[1].get('content').get('name') != 'MockComponent'
        )
        assert components[0].get('route') == '/test'
        assert components[1].get('route') == '/test2'

        # Check that arguments for both components
        assert components[0].get('content').get('props').get('dynamic_kwargs') == {}
        assert components[1].get('content').get('props').get('dynamic_kwargs') == {}


async def test_variables():
    """Check that the py_component decorator returns a PyComponentDef when Variables are passed in"""

    builder = ConfigurationBuilder()

    @py_component
    def TestBasicComp(input_val: str):
        return MockComponent(text=input_val)

    var = Variable()
    builder.add_page('Test', content=TestBasicComp(var))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Check that a component with a uid name has been generated and inserted instead of the MockComponent
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
        assert isinstance(component.get('name'), str) and component.get('name') != 'MockComponent'
        assert 'input_val' in component.get('props').get('dynamic_kwargs')

        # Check that the component can be fetched via the api, with input_val passed in the body
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': var},
            data={'uid': component.get('uid'), 'values': {'input_val': 'test'}, 'ws_channel': 'test_channel'},
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': 'test'}, 'uid': 'uid'}


async def test_async_py_comp():
    """Check that an async py_component can be called"""

    builder = ConfigurationBuilder()

    @py_component
    async def TestBasicComp(input_val: str):
        await anyio.sleep(0.5)
        return MockComponent(text=input_val)

    var = Variable()
    builder.add_page('Test', content=TestBasicComp(var))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Check that a component with a uid name has been generated and inserted instead of the MockComponent
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
        assert isinstance(component.get('name'), str) and component.get('name') != 'MockComponent'
        assert 'input_val' in component.get('props').get('dynamic_kwargs')

        # Check that the component can be fetched via the api, with input_val passed in the body
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': var},
            data={'uid': component.get('uid'), 'values': {'input_val': 'test'}, 'ws_channel': 'test_channel'},
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': 'test'}, 'uid': 'uid'}


async def test_derived_variables():
    """
    Check that the py_component decorator returns a PyComponentDef when DerivedVariables are passed in and that it
    processes DerivedVariables correctly when passed back in
    """

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a, b):
        return a + b

    mock_func = Mock(wraps=calc)

    derived = DerivedVariable(mock_func, variables=[var1, var2])

    @py_component
    def TestBasicComp(input_val: int):
        return MockComponent(text=str(input_val))

    builder.add_page('Test', content=TestBasicComp(derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Check that a component with a uid name has been generated and inserted instead of the MockComponent
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
        assert isinstance(component.get('name'), str) and component.get('name') != 'MockComponent'
        assert 'input_val' in component.get('props').get('dynamic_kwargs')

        # Check that the component can be fetched via the api, with input_val passed in the body
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': derived},
            data={
                'uid': component.get('uid'),
                'values': {
                    'input_val': {'type': 'derived', 'uid': str(derived.uid), 'values': [5, 10]},
                },
                'ws_channel': 'test_channel',
            },
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '15'}, 'uid': 'uid'}
        mock_func.assert_called_once()

        # Check that the derived state is cached on a subsequent request with the same args
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': derived},
            data={
                'uid': component.get('uid'),
                'values': {
                    'input_val': {'type': 'derived', 'uid': str(derived.uid), 'values': [5, 10]},
                },
                'ws_channel': 'test_channel',
            },
        )
        mock_func.assert_called_once()

        # Check that calling it with different arguments calls the underlying function again
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': derived},
            data={
                'uid': component.get('uid'),
                'values': {
                    'input_val': {'type': 'derived', 'uid': str(derived.uid), 'values': [1, 2]},
                },
                'ws_channel': 'test_channel',
            },
        )
        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '3'}, 'uid': 'uid'}
        assert mock_func.call_count == 2

async def test_mixed_inputs():
    """
    Check that the py_component decorator returns a PyComponentDef when a mix of Variables and static args are
    passed in
    """
    builder = ConfigurationBuilder()

    @py_component
    def TestBasicComp(input_val: str, input_2: int):
        return MockComponent(text=f'{input_val}_{input_2}')

    var = Variable()
    builder.add_page('Test', content=TestBasicComp(var, 2))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Check that a component with a uid name has been generated and inserted instead of the MockComponent
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
        assert isinstance(component.get('name'), str) and component.get('name') != 'MockComponent'
        assert 'input_val' in component.get('props').get('dynamic_kwargs')

        # Check that the component can be fetched via the api, with input_val passed in the body
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': var},
            data={
                'uid': component.get('uid'),
                'values': {'input_val': 'test', 'input_2': 2},
                'ws_channel': 'test_channel',
            },
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': 'test_2'}, 'uid': 'uid'}


async def test_default_arguments():
    """Test that default arguments can be used with the decorator"""
    builder = ConfigurationBuilder()

    @py_component
    def TestBasicComp(input_val: str, input_2: int = 3):
        return MockComponent(text=f'{input_val}_{input_2}')

    var = Variable()
    builder.add_page('Test', content=TestBasicComp(var))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        # Get the components ID from the template
        response, status = await _get_template(client)
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        # Check that the component can be fetched via the api, with input_val passed in the body
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': var},
            data={'uid': component.get('uid'), 'values': {'input_val': 'test'}, 'ws_channel': 'test_channel'},
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': 'test_3'}, 'uid': 'uid'}


async def test_error_handling():
    """Test that the decorator raises errors in expected scenarios"""
    builder = ConfigurationBuilder()

    @py_component
    def TestBasicComp(input_val: str, input_2: int):
        return MockComponent(text=f'{input_val}_{input_2}')

    # Missing Argument
    with pytest.raises(TypeError):
        builder.add_page('Test', content=TestBasicComp('test'))

    # Type Validation
    with pytest.raises(TypeError):
        builder.add_page('Test', content=TestBasicComp(123, 12))

    @py_component
    def TestDefaultedComp(input_val: str, input_2: int, input_3: int = 3):
        return MockComponent(text=f'{input_val}_{input_2}_{input_3}')

    # Missing Argument when there are default arguments
    with pytest.raises(TypeError):
        builder.add_page('Test', content=TestDefaultedComp('test'))


async def test_base_model_args_are_restored():
    """Test that when a BaseModel type is expected by a PyComponent handler that the dict is restored to an instance"""
    builder = ConfigurationBuilder()

    class InputClass(BaseModel):
        val: str

    @py_component
    def TestBasicComp(input_val: InputClass):
        return MockComponent(text=input_val.val)

    var = Variable()
    builder.add_page('Test', content=TestBasicComp(var))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        # Get the components ID from the template
        response, status = await _get_template(client)
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        # Check that the component can be fetched via the api, with input dict passed in the body
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': var},
            data={'uid': component.get('uid'), 'values': {'input_val': {'val': 'test'}}, 'ws_channel': 'test_channel'},
        )
        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': 'test'}, 'uid': 'uid'}

async def test_base_model_not_restored_when_already_instance():
    """Test that when a type is expected by a PyComponent handler that an already instantiated instance is not restored"""
    builder = ConfigurationBuilder()

    class InputClass(BaseModel):
        val: str

    @py_component
    def TestBasicComp(input_val: InputClass):
        return MockComponent(text=input_val.val)

    var = Variable('foo')
    dv = DerivedVariable(lambda x: InputClass(val=x), variables=[var])
    builder.add_page('Test', content=TestBasicComp(dv))
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        # Get the components ID from the template
        response, status = await _get_template(client)
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        # Check that the component can be fetched via the api, with input dict passed in the body
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': dv},
            data={
                'uid': component.get('uid'),
                'values': {
                    'input_val': {
                        'type': 'derived',
                        'uid': str(dv.uid),
                        'values': ['foo']
                    }
                },
                'ws_channel': 'test_channel'
            },
        )
        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': 'foo'}, 'uid': 'uid'}

async def test_compatibility_with_polling():
    """Test that a py_component with polling gets passed the param correctly"""

    builder = ConfigurationBuilder()

    @py_component(polling_interval=2)
    def TestSimpleComp():
        return MockComponent(text='test')

    @py_component
    def TestBasicComp(input_val: str):
        return MockComponent(text=input_val)

    builder.add_page('Test', content=TestSimpleComp())
    builder.add_page('Test2', content=TestBasicComp('test'))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Check that two components have been generated and polling_interval is correctly set
        components = response.get('layout').get('props').get('content').get('props').get('routes')
        assert len(components) == 2
        assert components[0].get('content').get('props').get('polling_interval') == 2
        assert components[1].get('content').get('props').get('polling_interval') == None


async def test_derived_variables_restore_base_models():
    """
    Check that DerivedVariables whose Variables inherit from BaseModel correctly restore those model when calculating
    the new derived state.
    """

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()

    class InputClass(BaseModel):
        val: int

    # Define a mock function that can be spied on so we can check the caching system
    def calc(a: InputClass, b: int):
        return a.val + b

    derived = DerivedVariable(calc, variables=[var1, var2])

    @py_component
    def TestBasicComp(input_val: int):
        return MockComponent(text=str(input_val))

    builder.add_page('Test', content=TestBasicComp(derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Retrieve the component from the response
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        # Check that the component can be fetched via the api, with a passed as a dict
        response = await _get_py_component(
            client,
            name=component.get('name'),
            kwargs={'input_val': derived},
            data={
                'uid': component.get('uid'),
                'values': {'input_val': {'type': 'derived', 'uid': str(derived.uid), 'values': [{'val': 5}, 10]}},
                'ws_channel': 'test_channel',
            },
        )
        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '15'}, 'uid': 'uid'}


async def test_derived_variables_with_args():
    """Test that a DerivedVariable can use *args for catching a variable number of inputs"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()
    var3 = Variable()

    class InputClass(BaseModel):
        val: int

    def calc(a: InputClass, *args):
        return sum([a.val, *args])

    derived = DerivedVariable(calc, variables=[var1, var2, var3])

    @py_component
    def TestBasicComp(input_val: int):
        return MockComponent(text=str(input_val))

    builder.add_page('Test', content=TestBasicComp(derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Retrieve the component from the response
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        # Check that the component can be fetched via the api, with a passed as a dict
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': derived},
            data={
                'uid': component.get('uid'),
                'values': {'input_val': {'type': 'derived', 'uid': str(derived.uid), 'values': [{'val': 5}, 10, 10]}},
                'ws_channel': 'test_channel',
            },
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '25'}, 'uid': 'uid'}


async def test_derived_variables_with_polling():
    """Test that a DerivedVariable with polling_interval gets passed a polling_interval param"""

    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()
    var3 = Variable()

    class InputClass(BaseModel):
        val: int

    def calc(a: InputClass, *args):
        return sum([a.val, *args])

    derived = DerivedVariable(calc, variables=[var1, var2, var3], polling_interval=2)

    @py_component
    def TestBasicComp(input_val: int):
        return MockComponent(text=str(input_val))

    builder.add_page('Test', content=TestBasicComp(derived))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Retrieve the component from the response and check polling_interval and cache
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
        assert component.get('props').get('dynamic_kwargs').get('input_val').get('polling_interval') == 2
        assert component.get('props').get('dynamic_kwargs').get('input_val').get('cache') == Cache.Policy.from_arg('global')


async def test_chained_derived_variables():
    """Test that a DerivedVariable can be chained"""
    builder = ConfigurationBuilder()

    var1 = Variable()
    var2 = Variable()
    var3 = Variable()

    def calc(a, b):
        return a + b

    derived_1 = DerivedVariable(calc, variables=[var1, var2])
    derived_2 = DerivedVariable(calc, variables=[derived_1, var3])

    @py_component
    def TestBasicComp(input_val: int):
        return MockComponent(text=str(input_val))

    builder.add_page('Test', content=TestBasicComp(derived_2))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Retrieve the component from the response
        component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

        # Check that the component can be fetched via the api, with a passed as a dict
        response = await _get_py_component(
            client,
            component.get('name'),
            kwargs={'input_val': derived_2},
            data={
                'uid': component.get('uid'),
                'values': {
                    'input_val': {
                        'type': 'derived',
                        'uid': str(derived_2.uid),
                        'values': [{'type': 'derived', 'uid': str(derived_1.uid), 'values': [5, 10]}, 10],
                    }
                },
                'ws_channel': 'test_channel',
            },
        )

        assert response.status_code == 200
        assert response.json() == {'name': 'MockComponent', 'props': {'text': '25'}, 'uid': 'uid'}


async def test_placeholder():
    """Check that the py_component decorator works correctly with and without a placeholder"""

    builder = ConfigurationBuilder()

    @py_component(placeholder=MockFallbackComponent(text='test placeholder'))
    def TestPlaceholderComp(input_val: str):
        return MockComponent(text=input_val)

    @py_component
    def TestBasicComp(input_val: str):
        return MockComponent(text=input_val)

    builder.add_page('Test', content=TestPlaceholderComp('test'))
    builder.add_page('Test2', content=TestBasicComp('test 2'))

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        response, status = await _get_template(client)

        # Check that two components have been generated and inserted instead of the MockComponent
        components = response.get('layout').get('props').get('content').get('props').get('routes')
        assert len(components) == 2
        assert (
            isinstance(components[0].get('content').get('name'), str)
            and components[0].get('content').get('name') != 'MockFallbackComponent'
        )
        assert (
            isinstance(components[1].get('content').get('name'), str)
            and components[1].get('content').get('name') != 'MockFallbackComponent'
        )
        assert components[0].get('route') == '/test'
        assert components[1].get('route') == '/test2'

        # Check that placeholders for both components
        assert (
            components[0].get('content').get('props').get('fallback')
            == MockFallbackComponent(text='test placeholder').dict()
        )
        assert components[1].get('content').get('props').get('fallback') == None


async def test_derive_var_with_run_as_task_flag():
    """
    Check that a DerivedVariable with run_as_task flag can be passed to a py_component. This action should cause the
    py_component to be returned as a task as well
    """

    builder = ConfigurationBuilder()

    @py_component
    def TestSimpleComp(var: str):
        return MockComponent(text=var)

    var1 = Variable()
    var2 = Variable()

    derived = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)

    builder.add_page('Test', content=TestSimpleComp(derived))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Request the template and extract the component
            response, status = await _get_template(client)
            component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

            # Check that the fetching the component returns a task_id response
            response = await _get_py_component(
                client,
                component.get('name'),
                kwargs={'var': derived},
                data={
                    'uid': component.get('uid'),
                    'values': {'var': {'type': 'derived', 'uid': str(derived.uid), 'values': [5, 10]}},
                    'ws_channel': init.get('message', {}).get('channel'),
                },
            )
            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            # Listen on the websocket channel for the notification of task completion
            messages = await get_ws_messages(websocket)

            # There should be only success notifications
            assert all(
                [isinstance(message, dict) and message['message']['status'] == 'COMPLETE' for message in messages]
            )
            # One of them should be the task we just created
            assert any([message['message']['task_id'] == task_id for message in messages])

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == {'name': 'MockComponent', 'props': {'text': '15'}, 'uid': 'uid'}


async def test_chain_derived_var_with_run_as_task_flag():
    """
    Check that a chain of derived variables with run_as_task is passed the py_component resolves correctly.
    """
    input = Variable(1)

    dv_root = DerivedVariable(root, variables=[input], run_as_task=True)   # 1 + 1 = 2
    dv_leaf_1 = DerivedVariable(leaf_1, variables=[dv_root])   # 2 + 2 = 4
    dv_leaf_2 = DerivedVariable(leaf_2, variables=[dv_leaf_1])   # 4 + 3 = 7
    dv_top = DerivedVariable(add, variables=[dv_leaf_1, dv_leaf_2])   # 4 + 7 = 11 - RESULT

    builder = ConfigurationBuilder()

    @py_component
    def TestSimpleComp(var: str):
        return MockComponent(text=var)

    builder.add_page('Test', content=TestSimpleComp(var=dv_top))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Request the template and extract the component
            response, status = await _get_template(client)
            component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

            # Check that the fetching the component returns a task_id response
            response = await _get_py_component(
                client,
                component.get('name'),
                kwargs={'var': dv_top},
                data={
                    'uid': component.get('uid'),
                    'values': {
                        'var': {
                            'type': 'derived',
                            'uid': str(dv_top.uid),
                            'values': [
                                {
                                    'type': 'derived',
                                    'uid': str(dv_leaf_1.uid),
                                    'values': [
                                        {
                                            'type': 'derived',
                                            'uid': str(dv_root.uid),
                                            'values': [1],
                                            'force': False,
                                        }
                                    ],
                                    'force': False,
                                },
                                {
                                    'type': 'derived',
                                    'uid': str(dv_leaf_2.uid),
                                    'values': [
                                        {
                                            'type': 'derived',
                                            'uid': str(dv_leaf_1.uid),
                                            'values': [
                                                {
                                                    'type': 'derived',
                                                    'uid': str(dv_root.uid),
                                                    'values': [1],
                                                    'force': False,
                                                }
                                            ],
                                            'force': False,
                                        }
                                    ],
                                    'force': False,
                                },
                            ],
                            'force': False,
                        }
                    },
                    'ws_channel': init.get('message', {}).get('channel'),
                },
            )

            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            # Listen on the websocket channel for messages
            updates = await get_ws_messages(websocket)

            # Last should be the py_component task completing
            assert {'message': {'status': 'COMPLETE', 'task_id': task_id}, 'type': 'message'} in updates

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == {'name': 'MockComponent', 'props': {'text': '11'}, 'uid': 'uid'}


async def test_single_dv_track_progress():
    """
    Check that a single Derived Variable with run_as_task passed into a py_component with @track_progress
    sends progress updates

    This is an end-to-end test of the @track_progress feature
    """
    builder = ConfigurationBuilder()

    @py_component
    def TestSimpleComp(var: str):
        return MockComponent(text=var)

    derived = DerivedVariable(track_task, variables=[], run_as_task=True)

    builder.add_page('Test', content=TestSimpleComp(derived))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Request the template and extract the component
            response, status = await _get_template(client)
            component = response.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')

            # Check that the fetching the component returns a task_id response
            response = await _get_py_component(
                client,
                component.get('name'),
                kwargs={'var': derived},
                data={
                    'uid': component.get('uid'),
                    'values': {'var': {'type': 'derived', 'uid': str(derived.uid), 'values': []}},
                    'ws_channel': init.get('message', {}).get('channel'),
                },
            )

            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            # Expect 5 progress updates in order
            for i in range(1, 6):
                progress_update = await websocket.receive_json()
                assert progress_update == {
                    'message': {
                        'progress': (i / 5) * 100,
                        'message': f'Track1 step {i}',
                        'status': 'PROGRESS',
                        'task_id': task_id,
                    },
                    'type': 'message',
                }

            # Listen on the websocket channel for two notifications of underlying DV task completion
            complete_messages = await get_ws_messages(websocket)
            # All of them should be completions at this point
            assert all([m['message']['status'] == 'COMPLETE' for m in complete_messages])
            # One of them should be the py_component task completing
            assert {'message': {'status': 'COMPLETE', 'task_id': task_id}, 'type': 'message'} in complete_messages

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == {'name': 'MockComponent', 'props': {'text': 'result'}, 'uid': 'uid'}


async def test_multiple_dv_track_progress():
    """
    Check that multiple Derived Variable with run_as_task passed into a py_component with @track_progress
    sends progress updates
    """

    builder = ConfigurationBuilder()

    @py_component
    def TestSimpleComp(var1: str, var2: str):
        return MockComponentTwo(text=var1, text2=var2)

    derived = DerivedVariable(track_longer_task, variables=[], run_as_task=True)
    derived_2 = DerivedVariable(track_longer_task_2, variables=[], run_as_task=True)

    builder.add_page('Test', content=TestSimpleComp(derived, derived_2))

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Request the template and extract the component
            response = await client.get(f'/api/core/template/default', headers=AUTH_HEADERS)
            res = response.json()
            template_data = denormalize(res['data'], res['lookup'])
            component = (
                template_data.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
            )

            # Check that the fetching the component returns a task_id response
            response = await _get_py_component(
                client,
                component.get('name'),
                kwargs={'var1': derived, 'var2': derived_2},
                data={
                    'uid': component.get('uid'),
                    'values': {
                        'var1': {'type': 'derived', 'uid': str(derived.uid), 'values': []},
                        'var2': {'type': 'derived', 'uid': str(derived_2.uid), 'values': []},
                    },
                    'ws_channel': init.get('message', {}).get('channel'),
                },
                expect_success=False,
            )

            assert response.status_code == 200
            task_id = response.json().get('task_id')
            assert task_id is not None

            messages = await get_ws_messages(websocket)
            progress_updates = [
                x.get('message').get('message') for x in messages if x.get('message').get('status') == 'PROGRESS'
            ]
            completion_messages = [
                x.get('message').get('task_id') for x in messages if x.get('message').get('status') == 'COMPLETE'
            ]

            # We can't check their order since they are concurrent so just check all progress updates arrived
            for i in range(1, 6):
                assert f'Track1 step {i}' in progress_updates
                assert f'Track2 step {i}' in progress_updates

            #  task_id should be completed
            assert task_id in completion_messages

            # Try to fetch the result via the rest api
            result = await client.get(f'/api/core/tasks/{task_id}', headers=AUTH_HEADERS)
            assert result.status_code == 200
            assert result.json() == {
                'name': 'MockComponentTwo',
                'props': {'text': 'result', 'text2': 'result2'},
                'uid': 'uid',
            }


@pytest.mark.parametrize('primitive', [(True), (False), (1), (-2.5), ('test_string')])
async def test_handles_primitives(primitive):
    """
    Test that py_component handles primitive types by returning RawString with the primitive value
    """
    builder = ConfigurationBuilder()

    @py_component
    def TestSimpleComp():
        return primitive

    builder.add_page('Test', content=TestSimpleComp())

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Request the template and extract the component
            response = await client.get(f'/api/core/template/default', headers=AUTH_HEADERS)
            res = response.json()
            template_data = denormalize(res['data'], res['lookup'])
            component = (
                template_data.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
            )

            # Check that the fetching the component returns a RawString with the primitive value
            response = await _get_py_component(
                client,
                component.get('name'),
                kwargs={},
                data={
                    'uid': component.get('uid'),
                    'values': {},
                    'ws_channel': init.get('message', {}).get('channel'),
                },
                expect_success=False,
            )

            assert response.status_code == 200
            assert response.json()['props']['content'] == str(primitive)
            assert response.json()['name'] == 'RawString'


async def test_handles_none():
    """
    Test that py_component handles None by returning None
    """
    builder = ConfigurationBuilder()

    @py_component
    def TestSimpleComp():
        return None

    builder.add_page('Test', content=TestSimpleComp())

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Request the template and extract the component
            response = await client.get(f'/api/core/template/default', headers=AUTH_HEADERS)
            res = response.json()
            template_data = denormalize(res['data'], res['lookup'])
            component = (
                template_data.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
            )

            # Check that the fetching the component returns a RawString with the value 'None'
            response = await _get_py_component(
                client,
                component.get('name'),
                kwargs={},
                data={
                    'uid': component.get('uid'),
                    'values': {},
                    'ws_channel': init.get('message', {}).get('channel'),
                },
                expect_success=False,
            )

            assert response.status_code == 200
            assert response.json() == None


async def test_handles_invalid_value():
    """
    Test that py_component handles invalid values by returning InvalidComponent
    """
    builder = ConfigurationBuilder()

    @py_component
    def TestSimpleComp():
        return {'random': 'value'}

    builder.add_page('Test', content=TestSimpleComp())

    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Request the template and extract the component
            response = await client.get(f'/api/core/template/default', headers=AUTH_HEADERS)
            res = response.json()
            template_data = denormalize(res['data'], res['lookup'])
            component = (
                template_data.get('layout').get('props').get('content').get('props').get('routes')[0].get('content')
            )

            # Check that the fetching the component returns an InvalidComponent
            response = await _get_py_component(
                client,
                component.get('name'),
                kwargs={},
                data={
                    'uid': component.get('uid'),
                    'values': {},
                    'ws_channel': init.get('message', {}).get('channel'),
                },
                expect_success=False,
            )

            assert response.status_code == 200
            assert response.json()['name'] == 'InvalidComponent'
            assert 'did not return a ComponentInstance' in response.json()['props']['error']
