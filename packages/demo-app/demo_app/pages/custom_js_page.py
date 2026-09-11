"""A local default-export component and action alongside built-in components."""

from dara.components import Button, Heading, Stack, Text
from dara.core import Action, ActionImpl, ComponentInstance, Variable


class CustomCounter(ComponentInstance):
    """Render a local component using the existing explicit variable/action hooks."""

    js_source = './js/counter.tsx'
    py_component = 'DemoCounter'
    value: Variable
    onclick: Action


class IncrementCounter(ActionImpl):
    """Forward the next value through a local action implementation."""

    js_source = './js/increment.ts'
    py_name = 'DemoIncrement'
    variable: Variable


count = Variable(0)


def custom_js_page():
    """Show that custom and built-in components share the same variable state."""
    return Stack(
        Heading('Custom JavaScript', level=1),
        CustomCounter(value=count, onclick=IncrementCounter(variable=count)),
        Text(count),
        Button('Reset with built-in action', onclick=count.update(0)),
    )
