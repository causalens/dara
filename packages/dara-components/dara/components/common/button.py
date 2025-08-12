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

from enum import Enum
from typing import Optional, Union, cast

from dara.components.common.base_component import LayoutComponent
from dara.components.common.text import Text
from dara.core import ComponentInstance
from dara.core.base_definitions import Action
from dara.core.definitions import discover
from dara.core.interactivity import ClientVariable, Condition


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
    from dara.core import action
    from dara.components import Button, ButtonStyle

    @action
    async def navigate_to(ctx: action.Ctx, url: str):
        await ctx.navigate(url)

    Button(
        'Click',
        onclick=navigate_to('/test'),
        icon='Pen',
        styling=ButtonStyle.SECONDARY,
        outline=True,
    )
    ```

    The different button styles supported are: 'error', 'ghost', 'plain', 'primary' and 'secondary'. Other styling option
    is to choose whether to show the outline or filled version with the outline property. This defaults to False.

    A button component that is disabled but can be enabled by updating the variable disabling it:

    ```python

    from dara.core import Variable, action
    from dara.components import Button

    disabled = Variable(True)

    @action
    async def navigate_to(ctx: action.Ctx, url: str):
        await ctx.navigate(url)

    Button(
        'Click',
        disabled=disabled,
        onclick=navigate_to('/test'),
    )
    ```

    A button component can also take any component inside of it to make it into some clickable component.
    For example a button with a Stack and some Text inside of it would look like:

    ```python

    from dara.core import action
    from dara.components import Button, Stack, Text

    @action
    async def navigate_to(ctx: action.Ctx, url: str):
        await ctx.navigate(url)

    Button(
        Stack(
            Text(
                'Stack passed to button, when clicked I navigate to test page',
            ),
        ),
        onclick=navigate_to('/test'),
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

    disabled: Optional[Union[Condition, ClientVariable, bool]] = None
    onclick: Optional[Action] = None
    icon: Optional[str] = None
    styling: Optional[ButtonStyle] = None
    outline: bool = False

    def __init__(
        self, children: Union[str, ComponentInstance, ClientVariable], styling: Optional[ButtonStyle] = None, **kwargs
    ):
        child = children
        style = styling if styling is not None else ButtonStyle.PRIMARY
        if isinstance(children, (str, ClientVariable)):
            child = Text(text=children)
        if not styling and isinstance(children, ComponentInstance) and not isinstance(children, Text):
            style = ButtonStyle.PLAIN

        super().__init__(cast(ComponentInstance, child), styling=style, **kwargs)
