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

from pydantic import ValidationInfo, field_validator

from dara.components.common.base_component import FormComponent
from dara.components.common.utils import Item
from dara.core.base_definitions import Action
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.interactivity import ClientVariable, Variable
from dara.core.logging import dev_logger


class ListSection(BaseModel):
    """
    A class for building lists, takes a header and a list of Item objects to display.

    :param label: The header to render for this section
    :param items: A list of items for this section as an Item, str or dict list
    """

    label: str
    items: List[Union[Item, str, dict]]

    @field_validator('items')
    @classmethod
    def validate_items(cls, items: Any) -> List[Item]:
        if len(items) == 0:
            raise ValueError('Items of ListSection was empty, you must provide at least one item to the component')
        return [Item.to_item(item) for item in items]


class Select(FormComponent):
    """
    ![Select](../../../../docs/packages/dara-components/common/assets/Select.png)

    The Select component accepts a value and a set of items to choose from. The items should be a list of strings that
    or a list of Item instances that define a string label and a value of another type (must be json serializable). If
    the multiselect option is True then multiple items can be selected at a time, and if the searchable option is True
    the list of items becomes searchable. The value passed must be a Variable instance and it will be updated with the
    underlying value when the option is changed.

    A Select component is created via:

    ```python
    from dara.core import Variable
    from dara.components.common import Select

    selection_var = Variable('first')

    Select(
        value=selection_var,
        items=['first', 'second', 'third'],
    )
    ```

    A searchable Select component is created via:

    ```python
    from dara.core import Variable
    from dara.components.common import Select

    selection_var = Variable('first')

    Select(
        value=selection_var,
        items=['first', 'second', 'third'],
        searchable=True,
    )
    ```

    A more complicated example with explicit item labels/values that allows multiple items to be selected at the same time:

    ```python
    from dara.core import Variable
    from dara.components.common import Select, Item

    selection_var = Variable([1, 2])

    Select(
        items=[Item(label='first',value=1), Item(label='second',value=2)],
        value=selection_var,
        multiselect=True
    )
    ```

    Example of using a select component to allow selections in a sectioned list:

    ```python
    from dara.core import Variable
    from dara.components.common import Select, ListSection

    selection_var = Variable()

    Select(
        items=[ListSection(label='Section 1', items=['1 item 1', '1 item 2', '1 item 3']), ListSection(label='Section 2', items=['2 item 1', '2 item 2'])],
        searchable=True,
        value=selection_var,
    )
    ```

    :param id: the key to be used if this component is within a form
    :param items: An array of ListSection, Item or strings that defines the options to render
    :param max_rows: An optional number of rows to fit in a multiselect
    :param multiselect: Boolean, if True more than one item can be selected
    :param onchange: Action triggered when the select value has changed.
    :param placeholder: Placeholder text to be displayed when the select is empty
    :param searchable: Boolean, if True the items can be filtered via a search term
    :param value: A Variable instance recording the component's state
    """

    id: Optional[str] = None
    multiselect: bool = False
    searchable: bool = False
    items: Union[List[Union[Item, ListSection]], ClientVariable]
    max_rows: int = 3
    onchange: Optional[Action] = None
    placeholder: Optional[str] = None
    value: Optional[Variable[Any]] = None

    @field_validator('items', mode='before')
    @classmethod
    def validate_items(cls, items: Any, info: ValidationInfo) -> Union[List[Union[Item, ListSection]], ClientVariable]:
        multiselect = info.data.get('multiselect')
        searchable = info.data.get('searchable')
        if isinstance(items, ClientVariable):
            return items
        if not isinstance(items, list):
            raise ValueError('Items must be passed as a list to the select component')
        if len(items) == 0:
            raise ValueError('Items list is empty, you must provide at least one item')
        # Check if items is it is a list of ListSection
        if isinstance(items, list) and all(isinstance(item, ListSection) for item in items):
            # Check that if multiselect is set or searchable is False that a warning is shown that the configuration is not supported for sectioned list version of select
            if (multiselect) or (not searchable):
                dev_logger.warning(
                    'A list of ListSection was passed with a non supported configuration. Select behaviour will be defaulted to searchable=True instead'
                )
            return [_parse_item(item, return_listsection=True) for item in items]
        return [Item.to_item(item) for item in items]


def _parse_item(item: Any, return_listsection: bool = False) -> Union[Item, ListSection]:
    """
    Converts items to Item objects for a SectionedList. Can return a ListSection for a dictionary if
    return_listsection is set to True.
    """
    if isinstance(item, dict):
        if return_listsection and item.get('label') is not None and item.get('items') is not None:
            items = item.get('items')
            if not isinstance(items, list):
                raise ValueError(f"Dictionary 'items' value for SectionedList must be a list, got {items}")
            return ListSection(label=str(item.get('label')), items=[Item.to_item(subitem) for subitem in items])
        return Item.to_item(item)
    if isinstance(item, ListSection):
        return item
    return Item.to_item(item)
