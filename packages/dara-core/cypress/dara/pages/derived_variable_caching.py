import random

from dara.core.interactivity import DerivedVariable, Variable
from dara.components import Card, Input, Stack, Text


def derived_variable_caching():
    """
    Test the different options for derived variable caching
    """

    def add_random_number():
        return random.random()

    var = Variable(0)
    derived_var_default = DerivedVariable(func=add_random_number, variables=[var])
    derived_var_global = DerivedVariable(func=add_random_number, variables=[var], cache='global')
    derived_var_session = DerivedVariable(func=add_random_number, variables=[var], cache='session')
    derived_var_none = DerivedVariable(func=add_random_number, variables=[var], cache=None)

    default_scenario = Stack(Text('DEFAULT SCENARIO: '), Text(derived_var_default))
    global_scenario = Stack(Text('GLOBAL SCENARIO: '), Text(derived_var_global))
    session_scenario = Stack(Text('SESSION SCENARIO: '), Text(derived_var_session))
    none_scenario = Stack(Text('NONE SCENARIO: '), Text(derived_var_none))

    return Card(
        Stack(
            Input(value=var),
            Text('Results:'),
            default_scenario,
            global_scenario,
            session_scenario,
            none_scenario,
        ),
        title='Derived Variables',
    )
