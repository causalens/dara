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
from typing_extensions import TypedDict

from dara.components.common.base_component import FormComponent
from dara.core.base_definitions import Action
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import ClientVariable, Variable
from dara.core.visual.components.types import Direction


class RadioItem(TypedDict):
    value: Any
    label: Union[str, ComponentInstance]


class RadioGroup(FormComponent):
    """
    ![RadioGroup](../../../../docs/packages/dara-components/common/assets/RadioGroup.png)

    RadioGroup component accepts list of selectable items and allows user to have one of them
    selected at a time.

    Simple RadioGroup component:

    ```python
    from dara.core import Variable
    from dara.components import RadioGroup, RadioItem, Text

    value_var_str = Variable('first')

    # you can pass items as a list of values
    RadioGroup(
        items=['first', 'second'],
        value=value_var_str,
    )

    value_var_num = Variable(1)

    # or as an `RadioItem` list
    RadioGroup(
        items=[RadioItem(label='first',value=1), Item(label='second',value=2)],
        value=value_var_num,
    )

    # or as an `RadioItem` list with arbitrary components
    RadioGroup(
        items=[
            RadioItem(label=Text(text='first', color='red'), value=1),
            RadioItem(label=Text(text='second', color='blue'), value=2)
        ],
        value=value_var_num,
    )
    ```

    This component can also be displayed horizontally by setting the `direction` param:

    ```python
    from dara.components.common import RadioGroup, Item

    RadioGroup(
        items=['first', 'second'],
        value=value_var_str,
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

    items: Union[List[RadioItem], List[str], ClientVariable]
    value: Optional[Variable[Any]] = None
    list_styling: Optional[bool] = False
    onchange: Optional[Action] = None
    direction: Direction = Direction.VERTICAL
    id: Optional[str] = None

    @field_validator('items', mode='before')
    @classmethod
    def validate_items(cls, items: Any) -> Union[List[RadioItem], ClientVariable]:
        if isinstance(items, ClientVariable):
            return items
        if len(items) == 0:
            raise ValueError('Items list is empty, you must provide at least one item')
        return [RadioItem(value=item, label=item) if isinstance(item, str) else item for item in items]
