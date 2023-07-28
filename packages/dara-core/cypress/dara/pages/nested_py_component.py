from dara.core import py_component
from dara.components import Card, Stack, Text


# These py_components are defined dynamically inside other py_components
@py_component
def nested_layout(number):
    @py_component
    def nested_layout_2(number):
        @py_component
        def nested_layout_3(number):
            @py_component
            def percent(str):
                return Text(text=f'%{str}')

            return Stack(Text('Percent:'), percent(number))

        return Stack(Text('Hash:'), Text(text=f'#{number}'), nested_layout_3(number))

    return Stack(Text('Dollar:'), Text(text=f'${number}'), nested_layout_2(number))


# These py_components are defined upfront but they use other py_components internally
@py_component
def _upfront_percent(str):
    return Text(text=f'%{str}')


@py_component
def _upfront_layout_3(number):
    return Stack(Text('Percent:'), _upfront_percent(number))


@py_component
def _upfront_layout_2(number):
    return Stack(Text('Hash:'), Text(text=f'#{number}'), _upfront_layout_3(number))


@py_component
def upfront_layout(number):
    return Stack(Text('Dollar:'), Text(text=f'${number}'), _upfront_layout_2(number))


def nested_py_component():
    nested_scenario = nested_layout(100)
    upfront_scenario = upfront_layout(100)

    return Stack(
        Card(nested_scenario, title='Nested definition scenario'),
        Card(upfront_scenario, title='Upfront definition scenario'),
    )
