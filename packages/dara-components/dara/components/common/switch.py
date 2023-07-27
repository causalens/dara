"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional, Union

from dara.components.common.base_component import FormComponent
from dara.core.base_definitions import Action
from dara.core.interactivity import UrlVariable, Variable


class Switch(FormComponent):
    """
    ![Switch](../../../../docs/packages/dara-components/common/assets/Switch.png)

    A component that creates a switch. Takes a boolean `value` that determines whether the switch is on or off.

    A Switch component is created via:

    ```python

    from dara.core import Variable
    from dara.components.common import Switch

    Switch(value=Variable(default=True))

    ```

    :param value: Boolean Variable instance recording the component's state
    :param onchange: Action triggered when the component switches states.
    :param id: the key to be used if this component is within a form
    """

    value: Optional[Union[Variable[bool], UrlVariable[bool]]] = None
    onchange: Optional[Action] = None
    id: Optional[str] = None
