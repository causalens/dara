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

from typing import Any, List, Optional, Union

from pydantic import validator

from dara.components.common.base_component import FormComponent
from dara.components.common.utils import Item
from dara.core.base_definitions import Action
from dara.core.interactivity import NonDataVariable, UrlVariable, Variable
from dara.core.visual.components.types import Direction


class RadioGroup(FormComponent):
    """
    ![RadioGroup](../../../../docs/packages/dara-components/common/assets/RadioGroup.png)

    RadioGroup component accepts list of selectable items and allows user to have one of them
    selected at a time.

    Simple RadioGroup component:

    ```python

    from dara.components.common import RadioGroup, Item

    # you can pass items as a list of values
    RadioGroup(
        items=['first', 'second'],
        value=Variable('first'),
    )

    # or as an `Item` list
    RadioGroup(
        items=[Item(label='first',value=1), Item(label='second',value=2)],
        value=Variable(1),
    )
    ```

    This component can also be displayed horizontally by setting the `direction` param:

    ```python
    from dara.components.common import RadioGroup, Item

    RadioGroup(
        items=['first', 'second'],
        value=Variable('first'),
        direction='horizontal'
    )
    ```

    :param items: An Item list that defines labels to render and values to receive from RadioGroup
    :param value: A Variable instance recording the component's initial and subsequent state
    :param list_styling: If set to True, the component shows a list style version of radio group where the background is highlighted instead of the radio button themselves.
    :param onchange: Action triggered when the selected value has changed.
    :param direction: Sets the direction of the radio buttons can be either horizontal or vertical.
    :param id: the key to be used if this component is within a form
    """

    items: Union[List[Item], NonDataVariable]
    value: Optional[Union[Variable[Any], UrlVariable[Any]]] = None
    list_styling: Optional[bool] = False
    onchange: Optional[Action] = None
    direction: Direction = Direction.VERTICAL
    id: Optional[str] = None

    @validator('items', pre=True)
    @classmethod
    def validate_items(cls, items: Any) -> Union[List[Item], NonDataVariable]:
        if isinstance(items, NonDataVariable):
            return items
        if not isinstance(items, list):
            raise ValueError('Items must be passed as a list to the RadioGroup component')
        if len(items) == 0:
            raise ValueError('Items list is empty, you must provide at least one item')
        return [Item.to_item(item) for item in items]
