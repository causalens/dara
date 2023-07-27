"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional

from dara.components.common.base_component import LayoutComponent
from dara.core.definitions import ComponentInstance


class Card(LayoutComponent):
    """
    ![Card](../../../../docs/packages/dara-components/common/assets/Card.png)

     A card wraps a component instance; giving it an optional title, and/or an optional subtitle.
    This component has two style options through the accent param. If accent is True, the card has
    a gradient background. Otherwise the card has a plain background.

    A Card component is created via:

    ```python

    from dara.components.common import Card, Stack, Text

    Card(
        Stack(
            Text('Content for the card body'),
        ),
        title='My First card',
        subtitle='needs more content',
    )

    ```

    :param subtitle: The subtitle of the card
    :param title: The title of the card
    :param accent: Boolean containing whether the styling should be filled with the accent gradient or plain, by default this is False.
    """

    subtitle: Optional[str] = None
    title: Optional[str] = None
    accent: bool = False

    def __init__(self, *args: ComponentInstance, **kwargs):
        super().__init__(*args, **kwargs)
