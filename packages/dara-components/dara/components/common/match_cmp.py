"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

from dara.components.common.base_component import ModifierComponent
from dara.core import ClientVariable
from dara.core.definitions import ComponentInstance


class Match(ModifierComponent):
    """
    The Match component allows the children to be rendered based on a value, at runtime in the JS code.
    The component then accepts a map of primitive values to children and a a default children set.

    An Match component is created like so, in this example it is comparing the enum value of a variable:

    ```python
    from enum import StrEnum
    from dara.core import Variable
    from dara.components import Match, Text

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
