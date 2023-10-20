from dara.core.base_definitions import ActionImpl
from dara.core.interactivity.actions import ResetVariables, TriggerVariable, UpdateVariableImpl
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from pandas import DataFrame
import pytest

from dara.core import (
    DownloadContent,
    DownloadVariable,
    NavigateTo,
    SideEffect,
    UpdateVariable,
    UrlVariable,
    Variable,
)
from dara.core.internal.registries import action_registry

pytestmark = pytest.mark.anyio


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

    data_vara  = DataVariable()
    with pytest.raises(NotImplementedError):
        data_vara.reset()

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

def test_trigger_shortcut():
    der_var = DerivedVariable(lambda x: x, variables=[])
    action = der_var.trigger()
    assert isinstance(action, TriggerVariable)
    assert action.variable == der_var

    der_data_var = DerivedDataVariable(lambda x: x, variables=[])
    action = der_data_var.trigger()
    assert isinstance(action, TriggerVariable)
    assert action.variable == der_data_var
