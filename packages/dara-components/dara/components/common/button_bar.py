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
from typing import Any, List, Optional

from pydantic import field_validator

from dara.components.common.base_component import FormComponent
from dara.components.common.utils import Item
from dara.core.base_definitions import Action
from dara.core.interactivity import Variable


class ButtonBarStyle(str, Enum):
    PRIMARY = 'primary'
    SECONDARY = 'secondary'


class ButtonBar(FormComponent):
    """
    ![ButtonBar](../../../../docs/packages/dara-components/common/assets/ButtonBar.png)

    The ButtonBar component adds a button bar with a set of options that can be selected from and update a Variable
    instance. It can be a useful component for defining different content to be displayed, similar to that of a navigation bar.

    A simple button bar component:

    ```python
    from dara.core import Variable
    from dara.components.common import ButtonBar, Item

    bar_var = Variable('val2')

    ButtonBar(
        items=[
            Item(label='Value 1', value='val1'),
            Item(label='Value 2', value='val2'),
            Item(label='Value 3', value='val3'),
        ],
        value=bar_var,
    )
    ```

    A ButtonBar component with onchange:

    ```python
    from dara.core import Variable, action
    from dara.components.common import ButtonBar, Item

    bar_var = Variable('val2')

    @action
    async def notify_change(ctx: action.Ctx):
        bar = ctx.input
        await ctx.notify(title='Alert', message=f'ButtonBar value changed to {bar}', status='SUCCESS')

    ButtonBar(
        items=[
            Item(label='Value 1', value='val1'),
            Item(label='Value 2', value='val2'),
            Item(label='Value 3', value='val3'),
        ],
        value=bar_var,
        onchange=notify_change(),
    )
    ```

    A button bar component with styling:

    ```python
    from dara.core import Variable
    from dara.components.common import ButtonBar, ButtonBarStyle, Item

    bar_var = Variable('val2')

    ButtonBar(
        items=[
            Item(label='Value 1', value='val1'),
            Item(label='Value 2', value='val2'),
            Item(label='Value 3', value='val3'),
        ],
        value=bar_var,
        styling=ButtonBarStyle.SECONDARY
    )
    ```

    :param items: An Item list that defines the button labels
    :param value: A Variable or DervivedVariable updated by the buttons
    :param onchange: Action triggered when button in ButtonBar is selected
    :param id: the key to be used if this component is within a form
    :param styling: A style of the ButtonBar, can be 'primary' or 'secondary'
    """

    items: List[Item]
    value: Optional[Variable] = None
    onchange: Optional[Action] = None
    id: Optional[str] = None
    styling: ButtonBarStyle = ButtonBarStyle.PRIMARY

    @field_validator('items', mode='before')
    @classmethod
    def validate_items(cls, items: Any) -> List[Item]:
        if not isinstance(items, list):
            raise ValueError('Items must be passed as a list to the button bar component')
        if len(items) == 0:
            raise ValueError('Items list is empty, you must provide at least one item')
        return [Item.to_item(item) for item in items]
