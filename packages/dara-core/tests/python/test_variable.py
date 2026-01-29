import unittest
from typing import Any

import pytest
from async_asgi_testclient import TestClient as AsyncClient
from fastapi.encoders import jsonable_encoder

from dara.core import DerivedVariable, Variable
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.url_variable import UrlVariable
from dara.core.main import _start_application
from dara.core.persistence import BrowserStore, QueryParamStore

from tests.python.utils import _get_derived_variable, create_app

from .tasks import root

pytestmark = pytest.mark.anyio


def test_resolver(*args):
    pass


class TestVariables(unittest.TestCase):
    """Test variables components"""

    def test_getter_plain(self):
        # Plain variable test
        variable = Variable()

        # Test these can be nested and separate from each other
        first = variable.get('a').get('b')
        second = variable.get('c')

        assert first.nested == ['a', 'b']
        assert second.nested == ['c']

    def test_getter_plain_serialization(self):
        """
        Test that the plain variable gets serialized correctly with the nested property
        """
        variable = Variable()
        first = variable.get('a').get('b')

        class Component(ComponentInstance):
            value: Variable[Any]

        component = Component(value=first)

        # Check that they get serialized correctly
        first_serialized = jsonable_encoder(component)
        assert first_serialized['props']['value']['__typename'] == 'Variable'
        assert first_serialized['props']['value']['nested'] == ['a', 'b']

    def test_getter_derived(self):
        variable = Variable()
        # Derived variable test
        derived_variable = DerivedVariable(test_resolver, variables=[variable])

        # Test these can be nested and separate from each other
        first_derived = derived_variable.get('a').get('b')
        second_derived = derived_variable.get('c').get('d')

        assert first_derived.nested == ['a', 'b']
        assert second_derived.nested == ['c', 'd']

    def test_getter_derived_serialization(self):
        """
        Test that the derived variable gets serialized correctly with the nested property
        """
        variable = Variable()
        derived_variable = DerivedVariable[Any](test_resolver, variables=[variable])
        first_derived = derived_variable.get('a').get('b')

        class Component(ComponentInstance):
            value: DerivedVariable[Any]

        component = Component(value=first_derived)

        # Check that they get serialized correctly
        first_serialized = jsonable_encoder(component)
        assert first_serialized['props']['value']['__typename'] == 'DerivedVariable'
        assert first_serialized['props']['value']['nested'] == ['a', 'b']

    def test_derived_variable_uid(self):
        """Test that when giving derived variables uid, that you can't have two with the same name"""
        variable = Variable()

        def test_resolve():
            return 2

        first_derived_variable = DerivedVariable(test_resolve, variables=[variable], uid='test_derived_var')
        second_derived_variable = DerivedVariable(test_resolve, variables=[variable], uid='test_another_derived_var')

        # Checks that two derived variables with different uids can be registered
        assert first_derived_variable.get_value is not None
        assert second_derived_variable.get_value is not None

        # Checks that if another tries to register with same uid we get a value error
        with self.assertRaises(ValueError):
            (DerivedVariable(test_resolve, variables=[variable], uid='test_derived_var'),)

    def test_derived_variable_uid_run_as_task(self):
        """Test that when giving derived variables uid and running as task, that you can't have two with the same name"""
        variable = Variable()

        first_derived_variable = DerivedVariable(root, variables=[variable], uid='test_task_var', run_as_task=True)
        second_derived_variable = DerivedVariable(
            root, variables=[variable], uid='test_another_task_var', run_as_task=True
        )

        # Checks that two derived variables with different uids can be registered
        assert first_derived_variable.get_value is not None
        assert second_derived_variable.get_value is not None

        # Checks that if another tries to register with same uid we get a value error
        with self.assertRaises(ValueError):
            (DerivedVariable(root, variables=[variable], uid='test_task_var', run_as_task=True),)

        with self.assertRaises(ValueError):
            (DerivedVariable(test_resolver, variables=[variable], uid='test_task_var'),)

    def test_getter_with_loop_variable(self):
        """Test that Variable.get() accepts LoopVariable for dynamic nested access"""
        from dara.core.interactivity.loop_variable import LoopVariable

        variable = Variable({'user1': 'Alice', 'user2': 'Bob'})
        items = Variable([{'id': 'user1'}, {'id': 'user2'}])

        # Get with LoopVariable
        nested_var = variable.get(items.list_item.get('id'))

        # Should have one element in nested, which is a LoopVariable
        assert len(nested_var.nested) == 1
        assert isinstance(nested_var.nested[0], LoopVariable)
        assert nested_var.nested[0].nested == ['id']

    def test_getter_with_loop_variable_chained(self):
        """Test chaining .get() with both strings and LoopVariable"""
        from dara.core.interactivity.loop_variable import LoopVariable

        variable = Variable({'data': {'user1': {'name': 'Alice'}, 'user2': {'name': 'Bob'}}})
        items = Variable([{'id': 'user1'}, {'id': 'user2'}])

        # Chain string and LoopVariable
        nested_var = variable.get('data').get(items.list_item.get('id')).get('name')

        # Should have: 'data', LoopVariable, 'name'
        assert len(nested_var.nested) == 3
        assert nested_var.nested[0] == 'data'
        assert isinstance(nested_var.nested[1], LoopVariable)
        assert nested_var.nested[2] == 'name'

    def test_getter_with_loop_variable_serialization(self):
        """Test that Variable with LoopVariable in nested serializes correctly"""
        from dara.core.interactivity.loop_variable import LoopVariable

        variable = Variable({})
        items = Variable([])
        nested_var = variable.get(items.list_item.get('key'))

        class Component(ComponentInstance):
            value: Variable[Any]

        component = Component(value=nested_var)

        # Check serialization
        serialized = jsonable_encoder(component)
        assert serialized['props']['value']['__typename'] == 'Variable'
        assert len(serialized['props']['value']['nested']) == 1
        # The LoopVariable should be serialized as a dict
        assert serialized['props']['value']['nested'][0]['__typename'] == 'LoopVariable'
        assert serialized['props']['value']['nested'][0]['nested'] == ['key']

    def test_derived_variable_getter_with_loop_variable(self):
        """Test that DerivedVariable.get() accepts LoopVariable"""
        from dara.core.interactivity.loop_variable import LoopVariable

        variable = Variable()
        derived_variable = DerivedVariable(test_resolver, variables=[variable])
        items = Variable([{'id': 'a'}])

        # Get with LoopVariable
        nested_dv = derived_variable.get(items.list_item.get('id'))

        assert len(nested_dv.nested) == 1
        assert isinstance(nested_dv.nested[0], LoopVariable)


async def test_derived_variables_with_df_nan():
    """
    Test derived variable can return dataframe with nan and inf
    """
    import numpy
    import pandas

    builder = ConfigurationBuilder()

    dummy_var = Variable()

    def func(dummy_var):
        # Test DerivedVariable can handle df with nan/inf correctly
        return pandas.DataFrame({'a': [1, numpy.inf, numpy.nan], 'b': [2, float('nan'), float('inf')]})

    derived = DerivedVariable(func, variables=[dummy_var])
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        # Check that the component can be fetched via the api, with input_val passed in the body
        response = await _get_derived_variable(
            client, derived, {'is_data_variable': False, 'values': [0], 'ws_channel': 'test_channel', 'force_key': None}
        )
        assert response.status_code == 200
        assert response.json()['value'] == {
            'a': {'0': 1.0, '1': None, '2': None},
            'b': {'0': 2.0, '1': None, '2': None},
        }


async def test_variable_init_override():
    """
    Test that the variable init override works
    """
    counter = 0

    def override(kwargs):
        nonlocal counter
        kwargs['default'] = counter
        counter += 1
        return kwargs

    with Variable.init_override(override):
        variable = Variable(default='foo')
        variable2 = Variable(default='bar')

    assert variable.default == 0
    assert variable2.default == 1

    # check that the override is not active anymore
    new_variable = Variable(default='foo')
    assert new_variable.default == 'foo'


async def test_persist_value():
    """
    Test that persist_value is backwards compatible
    """
    var = Variable(persist_value=True)
    assert isinstance(var.store, BrowserStore)


async def test_url_variable():
    """
    Test that url variable is backwards compatible
    """
    var = UrlVariable(query='test')
    assert isinstance(var, Variable)  # subclass
    assert isinstance(var.store, QueryParamStore)
    assert var.store.query == 'test'
