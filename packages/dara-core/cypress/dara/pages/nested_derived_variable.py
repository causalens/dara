"""
Test page for DerivedVariable with .get() nested extraction.

This tests that using .get() on a DerivedVariable correctly resolves the nested value
when passed to:
1. Another DerivedVariable
2. A py_component
3. An action
"""

from dara.components import Button, Card, Input, Stack, Text
from dara.core import action, py_component
from dara.core.interactivity import DerivedVariable, Variable


@py_component
def display_nested_value(nested_value: int):
    """
    py_component that receives a nested value from a DerivedVariable.
    The nested_value should be the extracted 'value' field, not the whole dict.
    """
    # If nested extraction works, nested_value will be an int
    # If it doesn't work, it will be a dict and this will fail
    result = nested_value * 2
    return Text(text=f'PyComponent Result: {result}')


@action
async def notify_nested_value(ctx: action.Ctx, nested_value: int):
    """
    Action that receives a nested value from a DerivedVariable.
    The nested_value should be the extracted 'value' field, not the whole dict.
    """
    # If nested extraction works, nested_value will be an int
    # If it doesn't work, it will be a dict and this will fail
    result = nested_value + 1000
    await ctx.notify(f'Action Result: {result}', title='Nested Value', status='SUCCESS')


def nested_derived_variable():
    # Input variable that drives the test
    input_var = Variable(default=5)

    # Inner DerivedVariable that returns a nested dict structure
    inner_dv = DerivedVariable(
        func=lambda x: {'data': {'value': int(x) * 10, 'extra': 'ignored'}},
        variables=[input_var],
    )

    # Test 1: Pass .get() to another DerivedVariable
    # The outer DV should receive just the nested value (x * 10), not the whole dict
    outer_dv = DerivedVariable(
        func=lambda nested_value: int(nested_value) + 100,
        variables=[inner_dv.get('data').get('value')],
    )

    # Test 2: Pass .get() to a py_component
    # The py_component should receive just the nested value (x * 10), not the whole dict
    py_component_result = display_nested_value(inner_dv.get('data').get('value'))

    # Test 3: Pass .get() to an action
    # The action should receive just the nested value (x * 10), not the whole dict
    action_button = Button(
        'Trigger Action',
        onclick=notify_nested_value(nested_value=inner_dv.get('data').get('value')),
    )

    return Stack(
        Card(
            Stack(
                Text('Input (x):'),
                Input(value=input_var),
                Text('Inner DV returns: {"data": {"value": x*10, "extra": "ignored"}}'),
            ),
            title='Test Setup',
        ),
        Card(
            Stack(
                Text('Outer DV receives inner.get("data").get("value") and adds 100'),
                Text('Expected: x*10 + 100'),
                Text('Outer DV Result:'),
                Text(text=outer_dv),
            ),
            title='DV.get() -> DerivedVariable',
        ),
        Card(
            Stack(
                Text('py_component receives inner.get("data").get("value") and multiplies by 2'),
                Text('Expected: x*10 * 2'),
                py_component_result,
            ),
            title='DV.get() -> py_component',
        ),
        Card(
            Stack(
                Text('Action receives inner.get("data").get("value") and adds 1000'),
                Text('Expected notification: x*10 + 1000'),
                action_button,
            ),
            title='DV.get() -> action',
        ),
    )
