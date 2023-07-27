"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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
        value=Variable('first'),
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
