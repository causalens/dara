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

import re
from typing import Union

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import ClientVariable


class Heading(ContentComponent):
    """
    ![Heading](../../../../docs/packages/dara-components/common/assets/Heading.png)

    A Heading component is the basic component for adding any kind of title/sub-title to your app. It accepts the
    text to display as the first argument as well as an optional level argument, which controls the heading size/weight,
    defaults to 1 which is the highest(largest) level.

    The heading component also adds an anchor automatically to the heading, which can be linked to using the anchor_name
    property that is exposed on an instance of the header.

    A Heading component is created via:

    ```python

    from dara.components.common import Heading

    Heading(
        heading="This is the heading text"
    )

    ```

    The heading can be linked to with an Anchor, which when clicked scrolls to that heading within the same page:

    ```python

    from dara.components.common import Anchor, Heading, Stack, Spacer

    heading = Heading(
        heading="This is a second-level heading",
        level=2
    )

    Stack(
        heading,
        Spacer(height='100vh'),
        Anchor('Click here to go to heading', href=f'#{heading.anchor_name}')
    )

    ```


    :param heading: The text for the heading to display
    :param level: The level of heading to display, defaults to 1
    """

    heading: Union[str, ClientVariable]
    level: int = 1

    @property
    def anchor_name(self):
        if isinstance(self.heading, ClientVariable):
            raise ValueError('Heading anchor name cannot be accessed directly from a variable')
        return re.sub(r'\s+', '-', self.heading.lower())

    def __init__(self, heading: Union[str, ClientVariable], **kwargs):
        super().__init__(heading=heading, **kwargs)
