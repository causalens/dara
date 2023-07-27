"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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

    Textarea(value=Variable('initial textarea content'))

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
