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

from typing import Any, Literal, Optional

from dara.components.common.base_component import FormComponent
from dara.core.base_definitions import Action
from dara.core.interactivity import Variable


class Textarea(FormComponent):
    """
    ![Textarea](../../../../docs/packages/dara-components/common/assets/Textarea.png)

    A component that creates an area for entering text. Takes the text variable that can be given a value that
    will be displayed as the default value when the textarea is empty. The variable will update when the user
    enters text. Optional autofocus boolean, which when true will start the cursor in the textarea.

    A Textarea component is created via:

    ```python
    from dara.core import Variable
    from dara.components.common import Textarea

    value_var = Variable('initial textarea content')

    Textarea(value=value_var)
    ```

    :param autofocus: Boolean, if True then then initially render with the cursor in the component
    :param value: A Variable instance recording the component's state
    :param onchange: Action triggered when the textarea value has changed.
    :param id: the key to be used if this component is within a form
    :param resize: sets whether the textarea is resizable, and if so, in which directions
    """

    autofocus: bool = False
    value: Optional[Variable[Any]] = None
    onchange: Optional[Action] = None
    id: Optional[str] = None
    resize: Optional[Literal['none', 'both', 'horizontal', 'vertical', 'block', 'inline']] = None
