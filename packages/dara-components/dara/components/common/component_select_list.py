"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import List, Optional, Union

from pydantic import BaseModel

from dara.components.common.base_component import LayoutComponent
from dara.core.base_definitions import Action
from dara.core.definitions import ComponentInstanceType
from dara.core.interactivity import Variable


class ComponentItem(BaseModel):
    title: str
    subtitle: Optional[str]
    component: ComponentInstanceType


# TODO: update docs with examples once component is fixed
class ComponentSelectList(LayoutComponent):
    """
    ![ComponentSelectList](../../../../docs/packages/dara-components/common/assets/ComponentSelectList.png)

     The ComponentSelectList Component shows a container which contains cards that can be selected by an user.

     A ComponentSelectList can be created via:
     ```python
     from dara.core import Variable
     from dara.components.common import (
         ComponentSelectList,
         Text,
     )
     from dara.components.common.component_select_list.component_select_list import ComponentItem

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
