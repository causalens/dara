from dara.core.interactivity import DerivedVariable, Variable
from dara.components import Button, Card, Input, Stack, Text


def trigger_variable():
    """
    Test TriggerVariable action.
    """
    # Simple scenario - trigger a single DV with deps=[] - most common use case
    input_var = Variable(1)
    dv = DerivedVariable(lambda x: int(x) + 2, variables=[input_var], deps=[], uid='trigger_var_dv', cache=None)

    simple_scenario = Stack(
        Text('SIMPLE_INPUT:'),
        Input(value=input_var),
        Text('SIMPLE_OUTPUT:'),
        Text(dv),
        Button('SIMPLE_TRIGGER', onclick=dv.trigger()),
    )

    # Complex scenario - trigger a variable in a chain

    return Stack(Card(simple_scenario, title='Simple scenario'))
