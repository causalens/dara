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

from typing import Optional

from dara.components.common.base_component import LayoutComponent
from dara.core.interactivity import ClientVariable


class TabbedCard(LayoutComponent):
    """
    ![TabbedCard](../../../../docs/packages/dara-components/common/assets/TabbedCard.png)

    A tabbed card wraps a series of tab instances and optionally takes which tab will initially be displayed

    A tabbed card component can be created via:

    ```python
    from dara.components.common import Tab, TabbedCard, Text

    TabbedCard(
        Tab(
            Text('Some Text'),
            title='Tab 1'
        ),
        Tab(
            Text('Some Text'),
            title='Tab 2'
        )
    )
    ```

    A tabbed card component where the tab is controlled by a Variable:

    ``` python
    from dara.core import Variable
    from dara.components.common import Tab, TabbedCard, Text

    tab_var = Variable('Tab 2')

    TabbedCard(
        Tab(Text('Some Text'), title='Tab 1'),
        Tab(Text('Some Text'), title='Tab 2'),
        selected_tab=tab_var,
    )
    ```

    :param initial_tab: Optional title of the tab to initially render, defaults to the first
    :param selected_tab: Optional selected tab mapped to a variable so that the selected tab can be easily accessed
    """

    initial_tab: Optional[str] = None
    selected_tab: Optional[ClientVariable] = None


class Tab(LayoutComponent):
    """
     A tab takes a title, subtitle and its child must be a component instance to display

     A Tab component can be created via:

     ```python

    from dara.components.common import Tab, Text

    Tab(
        Text('Some text'),
        title='A Title'
    )

     ```

     :param title: The title of the tab
    """

    title: str
