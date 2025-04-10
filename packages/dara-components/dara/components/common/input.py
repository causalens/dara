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


class Input(FormComponent):
    """
    ![Input](../../../../docs/packages/dara-components/common/assets/Input.png)

    The input component accepts a value, which should be a Variable instance and will allow the user to enter free text
    into the field.

    An Input component is created via:

    ```python
    from dara.core import Variable
    from dara.components.common import Input

    value_var = Variable('initial input value')

    Input(value=value_var)
    ```

    You could define a numerical input with the following:

    ```python
    from dara.core import Variable
    from dara.components.common import Input

    value_var = Variable(0)

    Input(value=value_var, type='number')
    ```

    :param value: A Variable instance recording the component's state
    :param onchange: Action triggered when the input value has changed.
    :param type: The type of the input, can be any of the accepted by HTML input types, e.g. number, text
    :param placeholder: Placeholder text to be displayed when the input is empty
    :param id: the key to be used if this component is within a form
    """

    id: Optional[str] = None
    placeholder: Optional[str] = None
    type: Optional[str] = None
    onchange: Optional[Action] = None
    value: Optional[Variable] = None
