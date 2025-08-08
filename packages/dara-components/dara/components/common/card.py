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

from typing import Optional, Union

from dara.components.common.base_component import LayoutComponent
from dara.core import ClientVariable
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
    :param justify: How to justify the content of the card, accepts any flexbox justifications
    :param align: How to align the content of the card, accepts any flexbox alignments
    """

    subtitle: Optional[Union[str, ClientVariable]] = None
    title: Optional[Union[str, ClientVariable]] = None
    accent: bool = False

    def __init__(self, *args: Union[ComponentInstance, None], **kwargs):
        super().__init__(*args, **kwargs)
