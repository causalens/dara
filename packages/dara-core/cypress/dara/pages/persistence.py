from dara.components import Card, Input, Stack, Text
from dara.core.interactivity import Variable


def persistence():
    """
    Test Persistence API
    """
    # Basic scenario
    persisted_value = Variable('test', persist_value=True)
    static_value = Variable('static')

    simple_scenario = Stack(
        Text('PERSISTED_VALUE:'), Input(value=persisted_value), Text('STATIC_VALUE:'), Input(value=static_value)
    )

    # Nested scenario
    nested_persisted_value = Variable({'nested': {'value': 'test'}}, persist_value=True)
    nested_scenario = Stack(Text('PERSISTED_VALUE:'), Input(value=nested_persisted_value.get('nested').get('value')))

    return Stack(Card(simple_scenario, title='Simple scenario'), Card(nested_scenario, title='Nested scenario'))
