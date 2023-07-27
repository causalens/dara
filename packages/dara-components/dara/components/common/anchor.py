"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import List, Optional, Union

from dara.components.common.base_component import (
    ContentComponent,
    LayoutError,
    ModifierComponent,
)
from dara.components.common.text import Text
from dara.core.definitions import TemplateMarker, discover
from dara.core.interactivity import AnyVariable, DerivedVariable, Variable


@discover
class Anchor(ModifierComponent):
    """
    ![Anchor](../../../../docs/packages/dara-components/common/assets/Anchor.gif)

    The anchor component can be used to add links to your app. You can either add one to an external
    website or to somewhere else within the same page of your app. If within the same page the page
    will scroll to the place where the anchor was defined.

    Example: link to some external resource
    ```python
    from dara.components.common import Anchor

    Anchor('My link', href='https://www.causalens.com/', new_tab=True)
    ```

    Example: anchor as a link to somewhere within the same page of your app
    ```python
    from dara.components.common import Anchor, Text, Stack

    Stack(
        Anchor('Click here to scroll to anchor', href='#test_anchor'),
        Text('Large gap', height='100vh'),
        Anchor(Text('Scrolled to here!!!'), name='test_anchor'),
    )
    ```

    :param href: the destination link for this anchor
    :param name: a unique name for this anchor, so it can be linked to by another
    :param clean: whether to remove all styling from the anchor
    :param new_tab: whether to open the link in a new tab
    """

    href: Optional[str] = None
    name: Optional[str] = None
    clean: bool = False
    new_tab: bool = False

    def __init__(
        self, child: Union[ContentComponent, str, Variable[str], DerivedVariable[str], TemplateMarker], **kwargs
    ):
        if isinstance(child, (ContentComponent, Variable, DerivedVariable, TemplateMarker, str)) is False:
            raise LayoutError(f'Only a single ContentComponent may be passed as an Anchors child, passed : {child}')

        # Handle a string or Variable being passed directly to an anchor
        if isinstance(child, (str, AnyVariable, TemplateMarker)):
            child = Text(child)
        parsed_args: List[ContentComponent] = [child]
        super().__init__(*parsed_args, **kwargs)
