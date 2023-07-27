"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

import re
from typing import Union

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import NonDataVariable


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

    heading: Union[str, NonDataVariable]
    level: int = 1

    @property
    def anchor_name(self):
        return re.sub(r'\s+', '-', self.heading.lower())

    def __init__(self, heading: Union[str, NonDataVariable], **kwargs):
        super().__init__(heading=heading, **kwargs)
