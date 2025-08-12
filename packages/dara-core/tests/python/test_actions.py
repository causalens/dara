from collections.abc import Coroutine
from typing import Any

import anyio
import pytest
from async_asgi_testclient import TestClient
from async_asgi_testclient import TestClient as AsyncClient
from pandas import DataFrame
from pydantic import BaseModel

from dara.core import (
    DownloadContent,
    DownloadVariable,
    NavigateTo,
    SideEffect,
    UpdateVariable,
    UrlVariable,
    Variable,
)
from dara.core.base_definitions import ActionImpl, AnnotatedAction, TaskProgressUpdate
from dara.core.configuration import ConfigurationBuilder
from dara.core.interactivity.actions import (
    ACTION_CONTEXT,
    BOUND_PREFIX,
    ActionCtx,
    ResetVariables,
    TriggerVariable,
    UpdateVariableImpl,
    action,
)
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.internal.execute_action import _execute_action
from dara.core.internal.registries import action_registry, static_kwargs_registry
from dara.core.main import _start_application

from tests.python.tasks import add, calc_task, track_task
from tests.python.utils import (
    _async_ws_connect,
    _call_action,
    create_app,
    get_action_results,
)

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def reset_context():
    ACTION_CONTEXT.set(None)
    yield
    ACTION_CONTEXT.set(None)


async def test_side_effect():
    """Test that the SideEffect action registers the action correctly"""

    def test_function(x):
        return x * x

    var = Variable(0)
    action = SideEffect(function=test_function, extras=[var])

    # SideEffect is an AnnotatedAction instance
    serialized = action.dict()
    assert serialized['dynamic_kwargs'] == {'kwarg_0': var}

    assert action_registry.has(serialized['definition_uid'])


def test_navigate_to():
    """Test that the NavigateTo action serializes correctly and registers the action"""
    # Just a simple impl
    action = NavigateTo(url='http://www.google.com')
    assert isinstance(action, ActionImpl)

    # Legacy API - resolver
    action = NavigateTo(url=lambda x: f'url/{x}')
    assert action_registry.has(action.definition_uid)


def test_update_var():
    """Test that the UpdateVariable action serializes correctly and registers the action"""

    def resolver():
        return 'test'

    var = Variable()
    var2 = Variable()

    action = UpdateVariable(resolver, var, extras=[var2])
    assert action_registry.has(action.definition_uid)


def test_update_url_var():
    """Test that the UpdateVariable action does not error for UrlVariables"""

    def resolver():
        return 'test'

    var = UrlVariable(query='url_value', default='default_value')

    action = UpdateVariable(resolver, var)
    assert action_registry.has(action.definition_uid)


def test_download_var():
    """Test that the DownloadVariable action serialized correctly and registers the action"""

    var = Variable()

    action = DownloadVariable(variable=var, file_name='Name', type='csv')
    assert isinstance(action, ActionImpl)


def test_download_content():
    """Test that the DownloadContent action serialized correctly and registers the action"""

    var_a = Variable()

    def test_func(reserved):
        return './test/path'

    action = DownloadContent(test_func, extras=[var_a])
    assert action_registry.has(action.definition_uid)


def test_reset_shortcut():
    var = AnyVariable()
    action = var.reset()
    assert isinstance(action, ResetVariables)
    assert action.variables == [var]

    data_vara = DataVariable()
    with pytest.raises(NotImplementedError):
        data_vara.reset()

    # set context so it's not empty - check calling the shortcut is illegal
    ACTION_CONTEXT.set('foo')
    with pytest.raises(ValueError):
        var.reset()


def test_sync_shortcut():
    plain_var = Variable()
    action = plain_var.sync()
    assert isinstance(action, UpdateVariableImpl)
    assert action.variable == plain_var
    assert action.value == UpdateVariableImpl.INPUT

    url_var = UrlVariable(query='test')
    action = url_var.sync()
    assert isinstance(action, UpdateVariableImpl)
    assert action.variable == url_var
    assert action.value == UpdateVariableImpl.INPUT

    ACTION_CONTEXT.set('foo')
    with pytest.raises(ValueError):
        plain_var.sync()


def test_toggle_shortcut():
    plain_var = Variable()
    action = plain_var.toggle()
    assert isinstance(action, UpdateVariableImpl)
    assert action.variable == plain_var
    assert action.value == UpdateVariableImpl.TOGGLE

    url_var = UrlVariable(query='test')
    action = url_var.toggle()
    assert isinstance(action, UpdateVariableImpl)
    assert action.variable == url_var
    assert action.value == UpdateVariableImpl.TOGGLE

    ACTION_CONTEXT.set('foo')
    with pytest.raises(ValueError):
        plain_var.toggle()


async def test_update_shortcut():
    plain_var = Variable()
    action = plain_var.update('test')
    assert isinstance(action, UpdateVariableImpl)
    assert action.variable == plain_var
    assert action.value == 'test'

    url_var = UrlVariable(query='test')
    action = url_var.update('test')
    assert isinstance(action, UpdateVariableImpl)
    assert action.variable == url_var
    assert action.value == 'test'

    data_var = DataVariable()
    data = DataFrame()
    action = data_var.update(data)
    assert isinstance(action, UpdateVariableImpl)
    assert action.variable == data_var
    assert isinstance(action.value, DataFrame)
    assert action.value.equals(data)

    ACTION_CONTEXT.set('foo')
    with pytest.raises(ValueError):
        plain_var.update('test')


def test_trigger_shortcut():
    der_var = DerivedVariable(lambda x: x, variables=[])
    action = der_var.trigger()
    assert isinstance(action, TriggerVariable)
    assert action.variable == der_var

    der_data_var = DerivedDataVariable(lambda x: x, variables=[])
    action = der_data_var.trigger()
    assert isinstance(action, TriggerVariable)
    assert action.variable == der_data_var

    ACTION_CONTEXT.set('foo')
    with pytest.raises(ValueError):
        der_var.trigger()


def test_annotated_action_no_params():
    with pytest.raises(ValueError):

        @action
        def test_action():
            pass


def test_annotated_action_no_params_instance():
    with pytest.raises(ValueError):

        class TestClass:
            @action
            def test_action(self):
                pass


def test_annotated_action_no_params_class():
    with pytest.raises(ValueError):

        class TestClass:
            @classmethod
            @action
            def test_action(cls):
                pass


def test_annotated_action_no_params_static():
    with pytest.raises(ValueError):

        class TestClass:
            @staticmethod
            @action
            def test_action():
                pass


def test_annotated_action_missing_ctx():
    # Fake being within an @action already
    ACTION_CONTEXT.set('foo')

    @action
    def test_action(ctx, arg: int):
        pass

    with pytest.raises(TypeError):
        # should fail because ctx is not passed
        test_action(1)


def test_annotated_action_missing_ctx_instance():
    # Fake being within an @action already
    ACTION_CONTEXT.set('foo')

    class TestClass:
        @action
        def test_action(self, arg: int):
            pass

    with pytest.raises(TypeError):
        # should fail because ctx is not passed
        TestClass().test_action(1)


def test_annotated_action_missing_ctx_class():
    # Fake being within an @action already
    ACTION_CONTEXT.set('foo')

    class TestClass:
        @classmethod
        @action
        def test_action(cls, arg: int):
            pass

    with pytest.raises(TypeError):
        # should fail because ctx is not passed
        TestClass.test_action(1)


def test_annotated_action_missing_ctx_static():
    # Fake being within an @action already
    ACTION_CONTEXT.set('foo')

    class TestClass:
        @staticmethod
        @action
        def test_action(arg: int):
            pass

    with pytest.raises(TypeError):
        # should fail because ctx is not passed
        TestClass.test_action(1)


def test_annotated_action_redundant_ctx():
    @action
    def test_action(ctx, arg: int):
        pass

    with pytest.raises(TypeError):
        # ctx should not be passed
        test_action(ActionCtx(None, None))


def test_annotated_action_redundant_ctx_instance():
    class TestClass:
        @action
        def test_action(self, arg: int):
            pass

    with pytest.raises(TypeError):
        # ctx should not be passed
        TestClass().test_action(ActionCtx(None, None))


def test_annotated_action_redundant_ctx_class():
    class TestClass:
        @classmethod
        @action
        def test_action(cls, arg: int):
            pass

    with pytest.raises(TypeError):
        # ctx should not be passed
        TestClass.test_action(ActionCtx(None, None))


def test_annotated_action_redundant_ctx_static():
    class TestClass:
        @staticmethod
        @action
        def test_action(arg: int):
            pass

    with pytest.raises(TypeError):
        # ctx should not be passed
        TestClass.test_action(ActionCtx(None, None))


def test_annotated_action_missing_param():
    @action
    def test_action(ctx, arg: int, arg2: int):
        pass

    with pytest.raises(TypeError):
        # should fail because 2 args are expected
        test_action(1)


def test_annotated_action_missing_param_instance():
    class TestClass:
        @action
        def test_action(self, ctx, arg: int, arg2: int):
            pass

    with pytest.raises(TypeError):
        # should fail because 2 args are expected
        TestClass().test_action(1)


def test_annotated_action_missing_param_class():
    class TestClass:
        @classmethod
        @action
        def test_action(cls, ctx, arg: int, arg2: int):
            pass

    with pytest.raises(TypeError):
        # should fail because 2 args are expected
        TestClass.test_action(1)


def test_annotated_action_missing_param_static():
    class TestClass:
        @staticmethod
        @action
        def test_action(ctx, arg: int, arg2: int):
            pass

    with pytest.raises(TypeError):
        # should fail because 2 args are expected
        TestClass.test_action(1)


def test_annotated_action_can_be_called():
    def _raw_test_action(ctx, arg: int, arg2: str):
        return arg

    # Calling decorator manually to have access to raw func
    test_action = action(_raw_test_action)

    # Test passing static, dynamic, or mix of kwargs
    # For each check:
    # - action definition is correctly registered
    # - action instance has correct dynamic_kwargs
    # - static_kwargs_registry has correct static kwargs
    static_instance = test_action(1, 'two')
    assert isinstance(static_instance, AnnotatedAction)
    act_def = action_registry.get(static_instance.definition_uid)
    assert act_def.resolver == _raw_test_action
    assert static_instance.dynamic_kwargs == {}
    assert static_kwargs_registry.get(static_instance.uid) == {'arg': 1, 'arg2': 'two'}

    var_1 = Variable(1)
    var_2 = Variable('two')
    dynamic_instance = test_action(var_1, var_2)
    assert isinstance(dynamic_instance, AnnotatedAction)
    act_def = action_registry.get(dynamic_instance.definition_uid)
    assert act_def.resolver == _raw_test_action
    assert dynamic_instance.dynamic_kwargs == {'arg': var_1, 'arg2': var_2}
    assert static_kwargs_registry.get(dynamic_instance.uid) == {}

    mixed_instance = test_action(var_1, 'two')
    assert isinstance(mixed_instance, AnnotatedAction)
    act_def = action_registry.get(mixed_instance.definition_uid)
    assert act_def.resolver == _raw_test_action
    assert mixed_instance.dynamic_kwargs == {'arg': var_1}
    assert static_kwargs_registry.get(mixed_instance.uid) == {'arg2': 'two'}


async def test_annotated_action_instance_method():
    class TestClass:
        def _raw_test_action(self, ctx, arg: int, arg2: str):
            return (self, ctx, arg, arg2)

        test_action = action(_raw_test_action)

    var = Variable(1)
    instance = TestClass()
    mixed_instance = instance.test_action(var, 'two')
    assert isinstance(mixed_instance, AnnotatedAction)

    act_def = action_registry.get(mixed_instance.definition_uid)
    assert act_def.resolver is not None
    assert act_def.resolver == TestClass._raw_test_action

    dynamic_kwargs = mixed_instance.dynamic_kwargs
    assert dynamic_kwargs == {'arg': var}

    static_kwargs = static_kwargs_registry.get(mixed_instance.uid)
    assert static_kwargs == {'arg2': 'two', BOUND_PREFIX + 'self': instance}

    # Test the wrapped function can be invoked - we're skipping the variable->value resolution
    # but here we're just testing the correct values are received
    ctx = ActionCtx(None, None)
    assert await _execute_action(act_def.resolver, ctx, {**static_kwargs, 'arg': 1}) == (instance, ctx, var, 'two')


async def test_annotated_action_class_method():
    class TestClass:
        def _raw_test_action(cls, ctx, arg: int, arg2: str):
            return (cls, ctx, arg, arg2)

        test_action = classmethod(action(_raw_test_action))

    var = Variable(1)
    mixed_instance = TestClass.test_action(var, 'two')
    assert isinstance(mixed_instance, AnnotatedAction)

    act_def = action_registry.get(mixed_instance.definition_uid)
    assert act_def.resolver is not None
    assert act_def.resolver == TestClass._raw_test_action

    dynamic_kwargs = mixed_instance.dynamic_kwargs
    assert dynamic_kwargs == {'arg': var}

    static_kwargs = static_kwargs_registry.get(mixed_instance.uid)
    assert static_kwargs == {'arg2': 'two', BOUND_PREFIX + 'cls': TestClass}

    ctx = ActionCtx(None, None)
    assert await _execute_action(act_def.resolver, ctx, {**static_kwargs, 'arg': 1}) == (TestClass, ctx, var, 'two')


async def test_annotated_action_static_method():
    class TestClass:
        def _raw_test_action(ctx, arg: int, arg2: str):
            return (ctx, arg, arg2)

        test_action = staticmethod(action(_raw_test_action))

    var = Variable(1)
    mixed_instance = TestClass.test_action(var, 'two')
    assert isinstance(mixed_instance, AnnotatedAction)

    act_def = action_registry.get(mixed_instance.definition_uid)
    assert act_def.resolver is not None
    assert act_def.resolver == TestClass._raw_test_action

    dynamic_kwargs = mixed_instance.dynamic_kwargs
    assert dynamic_kwargs == {'arg': var}

    static_kwargs = static_kwargs_registry.get(mixed_instance.uid)
    assert static_kwargs == {'arg2': 'two'}

    ctx = ActionCtx(None, None)
    assert await _execute_action(act_def.resolver, ctx, {**static_kwargs, 'arg': 1}) == (ctx, var, 'two')


async def test_action_run_task_with_args(monkeypatch: pytest.MonkeyPatch):
    config = ConfigurationBuilder()
    config.task_module = 'tests.python.tasks'
    config = config._to_configuration()

    # patch workers to speed up the test
    monkeypatch.setenv('DARA_POOL_MAX_WORKERS', '1')

    app = _start_application(config)

    # start the app normally, booting up the task pool etc
    async with TestClient(app):
        result = None

        async def _raw_test_action(ctx: ActionCtx, x: int, y: int):
            nonlocal result
            # test both args and kwargs
            result = await ctx.run_task(add, args=[x], kwargs={'y': y})

        # Calling decorator manually to have access to raw func
        test_action = action(_raw_test_action)
        act_def = action_registry.get(test_action.definition_uid)

        ctx = ActionCtx(None, None)
        await _execute_action(act_def.resolver, ctx, values={'x': 13, 'y': 7})
        # result should be the sum
        assert result == 20


async def test_action_run_task_progress(monkeypatch: pytest.MonkeyPatch):
    config = ConfigurationBuilder()
    config.task_module = 'tests.python.tasks'
    config = config._to_configuration()

    # patch workers to speed up the test
    monkeypatch.setenv('DARA_POOL_MAX_WORKERS', '1')

    app = _start_application(config)

    # start the app normally, booting up the task pool etc
    async with TestClient(app):
        updates: list[TaskProgressUpdate] = []
        result = None

        async def _raw_test_action(ctx: ActionCtx):
            nonlocal result
            result = await ctx.run_task(track_task, on_progress=lambda update: updates.append(update))

        # Calling decorator manually to have access to raw func
        test_action = action(_raw_test_action)
        act_def = action_registry.get(test_action.definition_uid)

        ctx = ActionCtx(None, None)
        await _execute_action(act_def.resolver, ctx, values={})
        # result as defined in the task
        assert result == 'result'

        assert len(updates) == 5

        # check updates were received in the correct order
        for i in range(1, 6):
            assert updates[i - 1].progress == (i / 5) * 100


async def test_calling_an_action():
    """Test that an action can be called via the rest api"""
    builder = ConfigurationBuilder()
    config = create_app(builder)
    action = NavigateTo(url=lambda ctx: f'url/{ctx.inputs.value}')

    app = _start_application(config)

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_id'
        res = await _call_action(
            client,
            action,
            {
                'input': 'value',
                'values': {},
                'ws_channel': init.get('message', {}).get('channel'),
                'execution_id': exec_uid,
            },
        )
        assert res.status_code == 200
        actions = await get_action_results(websocket, exec_uid)
        assert len(actions) == 1
        assert actions[0]['name'] == 'NavigateTo'
        assert actions[0]['url'] == 'url/value'


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
    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_id'
        res = await _call_action(
            client,
            action,
            {
                'input': 'test',
                'values': {
                    'old': 'current',
                },
                'ws_channel': init.get('message', {}).get('channel'),
                'execution_id': exec_uid,
            },
        )
        assert res.status_code == 200

        actions = await get_action_results(websocket, exec_uid)
        assert len(actions) == 1
        assert actions[0]['name'] == 'UpdateVariable'
        assert actions[0]['value'] == 'test_current'


async def test_calling_update_action_with_get_api():
    """Test UpdateVariable with variable.get() as the target"""
    builder = ConfigurationBuilder()
    config = create_app(builder)

    var = Variable({'nested': 'value'})

    action = UpdateVariable(lambda ctx: ctx.inputs.new, var.get('nested'))

    app = _start_application(config)
    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_id'
        res = await _call_action(
            client,
            action,
            {
                'input': 'test',
                'values': {'old': None},
                'ws_channel': init.get('message', {}).get('channel'),
                'execution_id': exec_uid,
            },
        )
        assert res.status_code == 200

        actions = await get_action_results(websocket, exec_uid)
        assert len(actions) == 1
        assert actions[0]['name'] == 'UpdateVariable'
        assert actions[0]['value'] == 'test'
        # Check nested property is passed through correctly
        assert actions[0]['variable']['nested'] == ['nested']


async def test_calling_annotated_action():
    """
    Test calling a custom @action annotated action
    """
    builder = ConfigurationBuilder()
    config = create_app(builder)

    var = Variable()

    @action
    async def test_action(ctx: action.Ctx, previous_value, static_kwarg):
        assert ACTION_CONTEXT.get() == ctx
        await ctx.update(variable=var, value=previous_value + ctx.input + static_kwarg + 1)
        await ctx.reset_variables(var)

    action_instance = test_action(previous_value=var, static_kwarg=10)

    app = _start_application(config)

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_id'
        res = await _call_action(
            client,
            action_instance,
            {
                'input': 5,
                'values': {
                    'previous_value': 10,
                },
                'ws_channel': init.get('message', {}).get('channel'),
                'execution_id': exec_uid,
            },
        )
        assert res.status_code == 200

        actions = await get_action_results(websocket, exec_uid)
        assert len(actions) == 2

        assert actions[0]['name'] == 'UpdateVariable'
        assert actions[0]['value'] == 26  # 10 (prev dynamic kwarg) + 5 (input) + 10 (static kwarg) + 1

        assert actions[1]['name'] == 'ResetVariables'
        assert actions[1]['variables'] == [var.dict()]


async def test_calling_annotated_action_execute_arbitrary_impl():
    """Test calling an action which calls ctx.execute_action on arbitrary impl objects"""
    builder = ConfigurationBuilder()
    config = create_app(builder)

    var = Variable()

    custom_exec_called_with = None

    class CustomImpl(ActionImpl):
        foo: str

        async def execute(self, ctx: action.Ctx) -> Coroutine[Any, Any, Any]:
            nonlocal custom_exec_called_with
            custom_exec_called_with = ctx.input
            return await super().execute(ctx)

    @action
    async def test_action(ctx: action.Ctx, previous_value, static_kwarg):
        assert ACTION_CONTEXT.get() == ctx
        await ctx.execute_action(UpdateVariableImpl(variable=var, value=previous_value + ctx.input + static_kwarg + 1))
        await ctx.execute_action(CustomImpl(foo='bar'))

    action_instance = test_action(previous_value=var, static_kwarg=10)

    app = _start_application(config)

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_id'
        res = await _call_action(
            client,
            action_instance,
            {
                'input': 5,
                'values': {
                    'previous_value': 10,
                },
                'ws_channel': init.get('message', {}).get('channel'),
                'execution_id': exec_uid,
            },
        )
        assert res.status_code == 200

        actions = await get_action_results(websocket, exec_uid)
        assert len(actions) == 2

        assert actions[0]['name'] == 'UpdateVariable'
        assert actions[0]['value'] == 26  # 10 (prev dynamic kwarg) + 5 (input) + 10 (static kwarg) + 1

        assert actions[1]['name'] == 'CustomImpl'
        assert actions[1]['foo'] == 'bar'
        assert custom_exec_called_with == 5  # called with input=5


async def test_calling_action_restores_args():
    """
    Test calling an @action annotated action restores arguments to their original types based on type annotations
    """
    builder = ConfigurationBuilder()
    config = create_app(builder)

    var = Variable()

    class CustomClass(BaseModel):
        value: int

    @action
    async def test_action(ctx: action.Ctx, class_1: CustomClass, class_2: CustomClass):
        await ctx.update(variable=var, value=class_1.value + class_2.value)

    action_instance = test_action(class_1=var, class_2=CustomClass(value=10))

    app = _start_application(config)

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_id'
        res = await _call_action(
            client,
            action_instance,
            {
                'input': None,
                'values': {'class_1': {'value': 10}},
                'ws_channel': init.get('message', {}).get('channel'),
                'execution_id': exec_uid,
            },
        )
        assert res.status_code == 200

        actions = await get_action_results(websocket, exec_uid)
        assert len(actions) == 1

        assert actions[0]['name'] == 'UpdateVariable'
        assert actions[0]['value'] == 20


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
    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_id'
        res = await _call_action(
            client,
            action,
            {
                'input': 'test',
                'values': {'old': 'current', 'kwarg_0': 'val2'},
                'ws_channel': init.get('message', {}).get('channel'),
                'execution_id': exec_uid,
            },
        )

        assert res.status_code == 200

        actions = await get_action_results(websocket, exec_uid)
        assert len(actions) == 1
        assert actions[0]['name'] == 'UpdateVariable'
        assert actions[0]['value'] == 'test_current_val2'


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
            'input': None,
            'values': {
                'old': None,
                'kwarg_0': {
                    'type': 'derived',
                    'uid': str(derived.uid),
                    'values': [5, 10],
                },
            },
        }

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()
            exec_uid = 'exec_id'
            response = await _call_action(
                client,
                action,
                {**payload, 'execution_id': exec_uid, 'ws_channel': init.get('message', {}).get('channel')},
            )
            assert 'task_id' in response.json()

            # We can just wait for action results, assuming the task will finish and then actions will be immediately sent
            # if all went well
            actions = await get_action_results(websocket, exec_uid, timeout=6)

            assert len(actions) == 1
            assert actions[0]['name'] == 'UpdateVariable'
            assert actions[0]['value'] == '15'


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
            'input': None,
            'values': {
                'old': None,
                'kwarg_0': {
                    'type': 'derived',
                    'uid': str(derived_var_1.uid),
                    'values': [5, 10],
                },
                'kwarg_1': {
                    'type': 'derived',
                    'uid': str(derived_var_2.uid),
                    'values': [7, 9],
                },
            },
        }

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()
            exec_uid = 'exec_id'
            response = await _call_action(
                client,
                action,
                {**payload, 'execution_id': exec_uid, 'ws_channel': init.get('message', {}).get('channel')},
            )

            response_json = response.json()
            assert 'task_id' in response_json

            # We can just wait for action results, assuming the task will finish and then actions will be immediately sent
            # if all went well
            actions = await get_action_results(websocket, exec_uid, timeout=6)

            assert len(actions) == 1
            assert actions[0]['name'] == 'UpdateVariable'
            assert actions[0]['value'] == '15_16'


async def test_calling_an_action_returns_task_loop():
    """
    Test a scenario where (meta)task chain returned by calling an action forms a loop.
    The expected scenario is that there is no deadlock and the value resolves correctly.
    """
    builder = ConfigurationBuilder()

    var1 = Variable(1)
    var2 = Variable(2)
    task_var = DerivedVariable(calc_task, variables=[var1, var2], run_as_task=True)  # 3
    meta_dv_2 = DerivedVariable(lambda _1: int(_1) + 2, variables=[task_var])  # 5
    meta_dv_1 = DerivedVariable(lambda _1: int(_1) + 3, variables=[meta_dv_2])  # 8
    parent_var = DerivedVariable(lambda _1, _2: int(_1) + int(_2), variables=[meta_dv_1, task_var])  # 11

    result = Variable()
    action = UpdateVariable(lambda ctx: ctx.extras[0], variable=result, extras=[parent_var])

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        payload = {
            'input': None,
            'values': {
                'old': None,
                'kwarg_0': {
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
            },
        }

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()
            exec_uid = 'exec_id'
            response = await _call_action(
                client,
                action,
                {**payload, 'execution_id': exec_uid, 'ws_channel': init.get('message', {}).get('channel')},
            )
            response_json = response.json()
            assert 'task_id' in response_json

            # We can just wait for action results, assuming the task will finish and then actions will be immediately sent
            # if all went well
            actions = await get_action_results(websocket, exec_uid, timeout=6)

            assert len(actions) == 1
            assert actions[0]['name'] == 'UpdateVariable'
            assert actions[0]['value'] == 11
