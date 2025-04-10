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

from typing import List, Optional, Union

from dara.components.common.base_component import LayoutComponent
from dara.core.base_definitions import Action
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.definitions import ComponentInstanceType
from dara.core.interactivity import Variable


class ComponentItem(BaseModel):
    title: str
    subtitle: Optional[str] = None
    component: ComponentInstanceType


class ComponentSelectList(LayoutComponent):
    """
    ![ComponentSelectList](../../../../docs/packages/dara-components/common/assets/ComponentSelectList.png)

     The ComponentSelectList Component shows a container which contains cards that can be selected by an user.

     A ComponentSelectList can be created via:
     ```python
     from dara.core import Variable
     from dara.components import (
         ComponentSelectList,
         ComponentItem,
         Text,
     )

    ComponentSelectList(
         items=[
             ComponentItem(title='TitleA', subtitle='subtitle', component=Text('A')),
             ComponentItem(title='TitleB', subtitle='subtitle', component=Text('B')),
             ComponentItem(title='TitleC', subtitle='subtitle', component=Text('C')),
         ],
         selected_items=Variable('TitleB'),
     )
     ```

     :param items: The items to display, each should have a title, subtitle and component to display
     :param items_per_row: An optional param to specify the number of items per row, 3 by default
     :param multi_select: An optional flag for allowing selecting multiple cards, False by default
     :param on_select: An optional Action for listening to changes in the selected items
     :param selected_items: The initial selected items, can be an list if multiSelect is true otherwise a string. This takes the titles of the items as value.
    """

    items: List[ComponentItem]
    items_per_row: Optional[int] = None
    multi_select: Optional[bool] = None
    on_select: Optional[Action] = None
    selected_items: Optional[Variable[Union[str, List[str]]]] = None
