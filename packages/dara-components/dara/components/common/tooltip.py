"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Union

from dara.components.common.base_component import ModifierComponent
from dara.components.common.stack import Stack
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import DerivedVariable, Variable


class Tooltip(ModifierComponent):
    """
    ![Tooltip](../../../../docs/packages/dara-components/common/assets/Tooltip.png)

    A Tooltip Component that allows for a tooltip to be attached to any other component in the framework. It accepts
    any component as it's first parameter and this will be the component that the tooltip is attached to. The second
    parameter can be either a string or a component and will be rendered as the content of the tooltip. The last
    parameter can be used to adjust the placement of the tooltip. Available placements are: auto, top, bottom, left and right.

    Note: Tooltip requires a single child, so any children you pass in will implicitly be wrapped in a `Stack` element.
    You can also use the component directly in order to apply styles to it.

    A Tooltip component can be added via:

    ```python
    from dara.components.common import Tooltip, Input

    Tooltip(
        Input(value=Variable('initial input value')),
        content='This is my tooltip',
        placement='bottom',
    )
    ```

    Using multiple elements

    ```python
    from dara.components.common import Tooltip, Text, Stack

    Tooltip(
        Text('Hover me!'),
        Text('Hover me too!'),
        content='This is my tooltip'
    )

    # Or explicitly style
    Tooltip(
        Stack(
            Text('Hover me!'),
            Text('Hover me too!'),
            hug=True
        ),
        content='This is my tooltip'
    )
    ```

    :param content: The text or component for the tooltip to display
    :param placement: Allows the placement to be specified, can be auto, top, left, right or bottom
    :param styling: Defines the style of the tooltip, can be 'default' or 'error'
    """

    content: Union[str, ComponentInstance, Variable[str], DerivedVariable[str]]
    placement: str = 'auto'
    styling: str = 'default'

    def __init__(
        self,
        *components: ComponentInstance,
        content: Union[str, ComponentInstance, Variable[str], DerivedVariable[str]],
        placement: str = 'auto',
        styling: str = 'default',
        **kwargs
    ):
        # Unless there's one component and it's Stack, wrap components in Stack
        if not (len(components) == 1 and isinstance(components[0], Stack)):
            components = (Stack(*components),)

        super().__init__(*components, content=content, placement=placement, styling=styling, **kwargs)
