from dara.core.base_definitions import ActionImpl
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
