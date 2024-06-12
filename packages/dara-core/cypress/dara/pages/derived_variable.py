from dara.core.interactivity import DerivedVariable, ResetVariables, Variable
from dara.components import Button, Card, Input, Stack, Text


def derived_variable():
    # Create_from_derived
    input_var = Variable(default='Text')
    formatted_dv = DerivedVariable(func=lambda x: f'{x}%', variables=[input_var])
    mutable_from_dv = Variable.create_from_derived(formatted_dv)
    mutable_from_dv_persist = Variable(formatted_dv, persist_value=True)
    create_from_derived_scenario = Stack(
        Text('Input:'),
        Input(value=input_var),
        Text('Formatted:'),
        Text(text=formatted_dv),
        Text('Mutable:'),
        Input(value=mutable_from_dv),
        Text('Mutable Persist:'),
        Text(mutable_from_dv_persist),
        Button('Reset', onclick=ResetVariables(variables=[mutable_from_dv])),
    )

    return Stack(Card(create_from_derived_scenario, title='Create from derived'))
