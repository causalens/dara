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

from pydantic import field_validator

from dara.components.common.base_component import FormComponent
from dara.components.common.utils import Item
from dara.core.base_definitions import Action
from dara.core.interactivity import ClientVariable, Variable


class CheckboxGroup(FormComponent):
    """
    ![CheckboxGroup](../../../../docs/packages/dara-components/common/assets/CheckboxGroup.png)

    CheckboxGroup component accepts a list of selectable items and allows the user to select them.
    It displays a list of checkboxes. It is possible to set how many checkboxes may be selected
    at a given time with the `select_max` param. Otherwise all of them may be selected.

    Simple CheckboxGroup component:

    ```python
    from dara.core import Variable
    from dara.components import CheckboxGroup


    CheckboxGroup(
        items=['first', 'second', 'third', 'fourth', 'fifth'],
        value=Variable(['second', 'fifth']),
    )
    ```

    CheckboxGroup with items with custom labels and values:

    ```python
    from dara.core import Variable
    from dara.components import CheckboxGroup, Item

    CheckboxGroup(
        items=[Item(label='first',value=1), Item(label='second',value=2)],
        value=Variable([1]),
    )
    ```

    CheckboxGroup component with at most two values selectable at a time:

    ```python
    from dara.core import Variable
    from dara.components import CheckboxGroup

    CheckboxGroup(
        items=['first', 'second', 'third', 'fourth', 'fifth'],
        value=Variable(),
        select_max=2,
    )
    ```

    CheckboxGroup component where at least two values need to be selected for var and var_to_update to be updated.

    ```python
    from dara.core import Variable
    from dara.components.common import CheckboxGroup

    var = Variable()

    CheckboxGroup(
        items=['first', 'second', 'third', 'fourth', 'fifth'],
        value=var,
        select_min=2,
        list_styling=True,
    )
    ```

    :param items: An Item list that defines labels to render and values to receive from CheckboxGroup
    :param select_max: The maximum number of items that can be selected at a time, the component blocks the user from making any selections above this number.
    :param select_min: The minimum number of items that can be selected at a time, if less items than
        the selected number are selected no action is triggered by the onchange, and variable values are not updated.
    :param list_styling: If set to True, the component shows a list style version of checkboxes where the background is highlighted instead of the checkboxes themselves.
    :param value: A Variable instance recording the component's initial and subsequent state
    :param onchange: Action triggered when the selected value has changed
    :param id: the key to be used if this component is within a form
    """

    items: Union[List[Item], ClientVariable]
    select_max: Optional[int] = None
    select_min: Optional[int] = None
    list_styling: bool = False
    value: Optional[Variable[Any]] = None
    onchange: Optional[Action] = None
    id: Optional[str] = None

    @field_validator('items', mode='before')
    @classmethod
    def validate_items(cls, items: Any) -> Union[List[Item], ClientVariable]:
        if isinstance(items, ClientVariable):
            return items
        if not isinstance(items, list):
            raise ValueError('Items must be passed as a list to the CheckboxGroup component')
        if len(items) == 0:
            raise ValueError('Items list is empty, you must provide at least one item')
        return [Item.to_item(item) for item in items]
