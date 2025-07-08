from random import random

from dara.components import Card, Input, Stack, Text
from dara.core.interactivity import DerivedVariable, Variable


def rand_func(x):
    return random() + int(x)


variable1 = Variable(1)
variable2 = Variable(2)

__reset_variables = [variable1, variable2]


def page_variables_1():
    """
    Display variables, make sure they are reset on page load
    """
    scenario = Stack(Text('Var1:'), Input(value=variable1), Text('Var2:'), Input(value=variable2))

    return Card(scenario, title='PageVariables1')
