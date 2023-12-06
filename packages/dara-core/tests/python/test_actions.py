import pytest
from pandas import DataFrame

from dara.core import DownloadContent, DownloadVariable, NavigateTo, SideEffect, UpdateVariable, UrlVariable, Variable
from dara.core.base_definitions import ActionImpl, AnnotatedAction
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

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def reset_context():
    ACTION_CONTEXT.set(None)
    yield
    ACTION_CONTEXT.set(None)


async def test_side_effect():
    """Test that the SideEffect action registers the action correctly"""
    test_function = lambda x: x * x
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


def test_update_shortcut():
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


def test_annotated_action_missing_ctx():

    # Fake being within an @action already
    ACTION_CONTEXT.set('foo')

    @action
    def test_action(ctx, arg: int):
        pass

    with pytest.raises(TypeError):
        # should fail because ctx is not passed
        test_action(1)


def test_annotated_action_redundant_ctx():
    @action
    def test_action(ctx):
        pass

    with pytest.raises(TypeError):
        # ctx should not be passed
        test_action(ActionCtx(None, None))


def test_annotated_action_missing_param():
    @action
    def test_action(ctx, arg: int, arg2: int):
        pass

    with pytest.raises(TypeError):
        # should fail because 2 args are expected
        test_action(1)


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
