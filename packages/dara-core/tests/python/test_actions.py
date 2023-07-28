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


def test_side_effect():
    """Test that the SideEffect action registers the action correctly"""
    test_function = lambda x: x * x
    var = Variable(0)
    action = SideEffect(function=test_function, extras=[var])
    assert action.dict() == {
        'name': 'SideEffect',
        'uid': action.uid,
        'function': test_function,
        'extras': [var.dict()],
        'block': False,
    }
    assert action_registry.get(action.uid)(2) == 4


def test_navigate_to():
    """Test that the NavigateTo action serializes correctly and registers the action"""
    action = NavigateTo(url='http://www.google.com')

    assert action.dict() == {
        'name': 'NavigateTo',
        'new_tab': False,
        'uid': action.uid,
        'url': 'http://www.google.com',
        'extras': None,
    }
    with pytest.raises(KeyError):
        action_registry.get(action.uid)

    action = NavigateTo(url=lambda x: f'url/{x}')

    assert action.dict() == {
        'name': 'NavigateTo',
        'new_tab': False,
        'uid': action.uid,
        'url': None,
        'extras': None,
    }
    assert action_registry.get(action.uid)('test') == 'url/test'


def test_update_var():
    """Test that the UpdateVariable action serializes correctly and registers the action"""

    def resolver():
        return 'test'

    var = Variable()
    var2 = Variable()

    action = UpdateVariable(resolver, var, extras=[var2])

    assert action.dict() == {
        'name': 'UpdateVariable',
        'uid': action.uid,
        'variable': var.dict(),
        'extras': [var2.dict()],
    }
    assert action_registry.get(action.uid)() == 'test'


def test_update_url_var():
    """Test that the UpdateVariable action does not error for UrlVariables"""

    def resolver():
        return 'test'

    var = UrlVariable(query='url_value', default='default_value')

    action = UpdateVariable(resolver, var)

    assert action.dict() == {'name': 'UpdateVariable', 'uid': action.uid, 'variable': var.dict(), 'extras': None}
    assert action_registry.get(action.uid)() == 'test'


def test_download_var():
    """Test that the DownloadVariable action serialized correctly and registers the action"""

    var = Variable()

    action = DownloadVariable(variable=var, file_name='Name', type='csv')

    assert action.dict() == {
        'name': 'DownloadVariable',
        'uid': action.uid,
        'variable': var.dict(),
        'file_name': 'Name',
        'type': 'csv',
    }


def test_download_content():
    """Test that the DownloadContent action serialized correctly and registers the action"""

    var_a = Variable()

    def test_func(reserved):
        return './test/path'

    action = DownloadContent(test_func, extras=[var_a])

    assert action.dict() == {
        'name': 'DownloadContent',
        'uid': action.uid,
        'extras': [var_a.dict()],
        'cleanup_file': None,
    }
