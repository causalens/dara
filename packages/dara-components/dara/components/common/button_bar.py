"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from enum import Enum
from typing import Any, List, Optional, Union

from pydantic import validator

from dara.components.common.base_component import FormComponent
from dara.components.common.utils import Item
from dara.core.base_definitions import Action
from dara.core.interactivity import UrlVariable, Variable


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

    ButtonBar(
        items=[
            Item(label='Value 1', value='val1'),
            Item(label='Value 2', value='val2'),
            Item(label='Value 3', value='val3'),
        ],
        value=Variable('val2')
    )

    ```

    A ButtonBar component with onchange:

    ```python

    from dara.core import Variable, Notify
    from dara.components.common import ButtonBar, Item

    ButtonBar(
        items=[
            Item(label='Value 1', value='val1'),
            Item(label='Value 2', value='val2'),
            Item(label='Value 3', value='val3'),
        ],
        value=Variable('val2')
        onchange=Notify(message='ButtonBar value changed'),
    )

    ```

    A button bar component with styling:

    ```python

    from dara.core import Variable
    from dara.components.common import ButtonBar, ButtonBarStyle, Item

    ButtonBar(
        items=[
            Item(label='Value 1', value='val1'),
            Item(label='Value 2', value='val2'),
            Item(label='Value 3', value='val3'),
        ],
        value=Variable('val2'),
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
    value: Optional[Union[Variable, UrlVariable]] = None
    onchange: Optional[Action] = None
    id: Optional[str] = None
    styling: ButtonBarStyle = ButtonBarStyle.PRIMARY

    @validator('items', pre=True)
    @classmethod
    def validate_items(cls, items: Any) -> List[Item]:
        if not isinstance(items, list):
            raise ValueError('Items must be passed as a list to the button bar component')
        if len(items) == 0:
            raise ValueError('Items list is empty, you must provide at least one item')
        return [Item.to_item(item) for item in items]
