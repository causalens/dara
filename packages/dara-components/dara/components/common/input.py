"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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

    Input(value=Variable('initial input value'))

    ```

    You could define a numerical input with the following:

    ```python

    from dara.core import Variable
    from dara.components.common import Input

    Input(value=Variable(0), type='number')

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
    value: Optional[Variable[str]] = None
