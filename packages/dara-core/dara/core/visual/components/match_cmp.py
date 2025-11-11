from dara.core.definitions import ComponentInstance, JsComponentDef
from dara.core.interactivity.client_variable import ClientVariable

MatchDef = JsComponentDef(name='Match', js_module='@darajs/core', py_module='dara.core')


class Match(ComponentInstance):
    """
    The Match component allows the children to be rendered based on a value, at runtime in the JS code.
    The component then accepts a map of primitive values to children and a a default children set.

    An Match component is created like so, in this example it is comparing the enum value of a variable:

    ```python
    from enum import StrEnum
    from dara.core import Variable, Match
    from dara.components import Text

    class Status(StrEnum):
        OK = 'OK'
        ERROR = 'ERROR'
        WARNING = 'WARNING'

    var_status = Variable[Status](Status.OK)

    Match(
        value=var_status,
        when={
            Status.OK: Text('OK'),
            Status.ERROR: Text('ERROR'),
            Status.WARNING: Text('WARNING'),
        },
        default=Text('Unknown status')
    )
    ```

    Note that in simple cases this could simply be written using `SwitchVariable.match` instead. `Match` is useful when you want to display different components based on a variable value.

    :param value: a value to match against
    :param when: a map of primitive values to children
    :param default: children to display when the value is not matched, defaults to nothing rendered if not passed
    """

    value: ClientVariable
    when: dict[str | int | float, ComponentInstance | None]
    default: ComponentInstance | None = None
