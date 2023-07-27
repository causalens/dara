"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from enum import Enum
from typing import Optional, Union

from dara.components.common.base_component import LayoutComponent
from dara.components.common.text import Text
from dara.core import ComponentInstance
from dara.core.base_definitions import Action
from dara.core.definitions import TemplateMarker, discover
from dara.core.interactivity import Condition, NonDataVariable


class ButtonStyle(str, Enum):
    ERROR = 'error'
    GHOST = 'ghost'
    PRIMARY = 'primary'
    SECONDARY = 'secondary'
    PLAIN = 'plain'


@discover
class Button(LayoutComponent):
    """
    ![Button](../../../../docs/packages/dara-components/common/assets/Button.png)

    A Button component. It accepts text or any component as content and has additional options for adding icons.
    If a string or Text component are the child of button then it defaults to 'primary' styling, otherwise it defaults
    to 'plain' styling.

    To control what happens when a button is clicked you can pass an `Action` to the `onclick` parameter.

    A button component with an icon and styling:

    ```python

    from dara.core.actions import NavigateTo
    from dara.components.common import Button, ButtonStyle

    action = NavigateTo(url='/test')

    Button(
        'Click',
        onclick=action,
        icon='Pen',
        styling='ButtonStyle.SECONDARY,
        outline=True,
    )

    ```

    The different button styles supported are: 'error', 'ghost', 'plain', 'primary' and 'secondary'. Other styling option
    is to choose whether to show the outline or filled version with the outline property. This defults to False.

    A button component that is disabled but can be enabled by updating the variable disabling it:

    ```python

    from dara.core.actions import NavigateTo
    from dara.core.definitions import Variable
    from dara.components.common import Button

    action = NavigateTo(url='/test')

    disabled = Variable(True)

    Button(
        'Click',
        disabled=disabled,
        onclick=action,
    )

    ```

    A button component can also take any component inside of it to make it into some clickable component.
    For example a button with a Stack and some Text inside of it would look like:

    ```python

    from dara.core.actions import NavigateTo
    from dara.components.common import Button, Stack, Text

    Button(
        Stack(
            Text(
                'Stack passed to buton, when clicked I navigate to test page',
            ),
        ),
        onclick=NavigateTo(url='test'),
    )

    ```

    :param disabled: A variable, condition, or bool to disabled the button when true
    :param onclick: An Action that is triggered by clicking the button
    :param icon: An optional icon to display, see dara.core.css.get_icon for details
    :param styling: A style of the button, can be 'primary', 'secondary', 'error', 'plain' or 'ghost'
    :param outline: This allows to pick between two styles, if False the button is filled with a solid background color,
        if True it shows a transparent background with an outlined colored border. Filled buttons are more prominent and
        often used as primary actions, while outline buttons are more subtle and commonly used as secondary actions.
    """

    disabled: Optional[Union[Condition, NonDataVariable, bool]] = None
    onclick: Optional[Action] = None
    icon: Optional[str] = None
    styling: Optional[ButtonStyle] = None
    outline: bool = False

    class Config:
        smart_union = True

    def __init__(
        self,
        children: Union[str, ComponentInstance, NonDataVariable, TemplateMarker],
        styling: Optional[ButtonStyle] = None,
        **kwargs
    ):
        child = children
        style = styling if styling is not None else ButtonStyle.PRIMARY
        if isinstance(children, (str, NonDataVariable, TemplateMarker)):
            child = Text(text=children)
        if not styling and isinstance(children, ComponentInstance) and not isinstance(children, Text):
            style = ButtonStyle.PLAIN

        super().__init__(child, styling=style, **kwargs)
