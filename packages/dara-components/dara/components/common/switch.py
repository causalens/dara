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

from typing import Optional

from dara.components.common.base_component import FormComponent
from dara.core.base_definitions import Action
from dara.core.interactivity import Variable


class Switch(FormComponent):
    """
    ![Switch](../../../../docs/packages/dara-components/common/assets/Switch.png)

    A component that creates a switch. Takes a boolean `value` that determines whether the switch is on or off.

    A Switch component is created via:

    ```python
    from dara.core import Variable
    from dara.components.common import Switch

    value_var = Variable(default=True)

    Switch(value=value_var)
    ```

    :param value: Boolean Variable instance recording the component's state
    :param onchange: Action triggered when the component switches states.
    :param id: the key to be used if this component is within a form
    """

    value: Optional[Variable[bool]] = None
    onchange: Optional[Action] = None
    id: Optional[str] = None
