import unittest

from dara.core import DerivedVariable, Variable

from .tasks import root


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
