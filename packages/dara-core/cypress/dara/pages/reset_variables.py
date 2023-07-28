from random import random

from dara.core.interactivity import DerivedVariable, ResetVariables, Variable
from dara.components import Button, Card, Input, Stack, Text


def reset_variables():
    def append_random(string: str):
        rand = random()
        return f'{string}{rand}'

    input_var = Variable(default='text')
    dv = DerivedVariable(func=append_random, variables=[input_var])

    dv_scenario = Stack(
        Text('Input:'),
        Input(value=input_var),
        Text('Output:'),
        Text(text=dv),
        Button('Reset Root', onclick=[ResetVariables(variables=[input_var])]),
        Button('Reset DV', onclick=[ResetVariables(variables=[dv])]),
    )

    return Card(dv_scenario, title='DerivedVariable scenario')
