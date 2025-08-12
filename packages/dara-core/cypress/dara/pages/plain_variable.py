from dara.components import Card, Input, Stack, Text
from dara.core.interactivity import Variable


def plain_variable():
    """
    Plain variable functionality
    """
    # Simple scenario
    var = Variable(default='Default text')

    simple_scenario = Stack(Text(text='Input:'), Input(value=var), Text(text='Output:'), Text(text=var))

    # Nested
    var_nested = Variable(default={'first': {'second': 'Default nested', 'static': 'STATIC'}})
    nested_scenario = Stack(
        Text('Static:'),
        Text(text=var_nested.get('first').get('static')),  # to make sure other nsted values aren't changed
        Text(text='Nested Input:'),
        Input(value=var_nested.get('first').get('second')),
        Text(text='Nested Output:'),
        Text(text=var_nested.get('first').get('second')),
    )

    return Stack(Card(simple_scenario, title='Simple scenario'), Card(nested_scenario, title='Nested scenario'))
