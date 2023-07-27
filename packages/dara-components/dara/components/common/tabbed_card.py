"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional

from dara.components.common.base_component import LayoutComponent
from dara.core.interactivity import NonDataVariable


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

    TabbedCard(
        Tab(Text('Some Text'), title='Tab 1'),
        Tab(Text('Some Text'), title='Tab 2'),
        selected_tab=Variable('Tab 2'),
    )

    ```

    :param initial_tab: Optional title of the tab to initially render, defaults to the first
    :param selected_tab: Optional selected tab mapped to a variable so that the selected tab can be easily accessed
    """

    initial_tab: Optional[str] = None
    selected_tab: Optional[NonDataVariable] = None


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
