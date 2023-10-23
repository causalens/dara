import unittest

import pytest
from async_asgi_testclient import TestClient as AsyncClient

from dara.core import DerivedVariable, Variable
from dara.core.configuration import ConfigurationBuilder
from dara.core.main import _start_application

from tests.python.utils import _get_derived_variable, create_app

from .tasks import root

pytestmark = pytest.mark.anyio
def test_resolver(*args):
    pass


class TestVariables(unittest.TestCase):
    """Test variables components"""

    def test_getter(self):
        # Plain variable test
        variable = Variable()

        # Test these can be nested and separate from each other
        first = variable.get('a').get('b')
        second = variable.get('c').get('d')

        assert first.nested == ['a', 'b']
        assert second.nested == ['c', 'd']

        # Derived variable test
        derived_variable = DerivedVariable(test_resolver, variables=[variable])

        # Test these can be nested and separate from each other
        first_derived = derived_variable.get('a').get('b')
        second_derived = derived_variable.get('c').get('d')

        assert first_derived.nested == ['a', 'b']
        assert second_derived.nested == ['c', 'd']

    def test_derived_variable_uid(self):
        """Test that when giving derived variables uid, that you can't have two with the same name"""
        variable = Variable()

        def test_resolve():
            return 2

        first_derived_variable = DerivedVariable(test_resolve, variables=[variable], uid='test_derived_var')
        second_derived_variable = DerivedVariable(test_resolve, variables=[variable], uid='test_another_derived_var')

        # Checks that two derived variables with different uids can be registered
        assert first_derived_variable.get_value != None
        assert second_derived_variable.get_value != None

        # Checks that if another tries to register with same uid we get a value error
        with self.assertRaises(ValueError):
            DerivedVariable(test_resolve, variables=[variable], uid='test_derived_var'),

    def test_derived_variable_uid_run_as_task(self):
        """Test that when giving derived variables uid and running as task, that you can't have two with the same name"""
        variable = Variable()

        first_derived_variable = DerivedVariable(root, variables=[variable], uid='test_task_var', run_as_task=True)
        second_derived_variable = DerivedVariable(
            root, variables=[variable], uid='test_another_task_var', run_as_task=True
        )

        # Checks that two derived variables with different uids can be registered
        assert first_derived_variable.get_value != None
        assert second_derived_variable.get_value != None

        # Checks that if another tries to register with same uid we get a value error
        with self.assertRaises(ValueError):
            DerivedVariable(root, variables=[variable], uid='test_task_var', run_as_task=True),

        with self.assertRaises(ValueError):
            DerivedVariable(test_resolver, variables=[variable], uid='test_task_var'),

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
        return pandas.DataFrame({'a':[1,numpy.inf,numpy.nan],'b':[2,float('nan'),float('inf')]})

    derived = DerivedVariable(func, variables=[dummy_var])
    config = create_app(builder)

    # Run the app so the component is initialized
    app = _start_application(config)
    async with AsyncClient(app) as client:
        # Check that the component can be fetched via the api, with input_val passed in the body
        response = await _get_derived_variable(
            client, derived, {'is_data_variable': False, 'values': [0], 'ws_channel': 'test_channel', 'force': False}
        )
        assert response.status_code == 200
        assert response.json()['value'] == {'a': {'0': 1.0, '1': None, '2': None}, 'b': {'0': 2.0, '1': None, '2': None}}
