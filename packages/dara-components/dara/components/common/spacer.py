"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Union

from pydantic import validator

from dara.components.common.base_component import ContentComponent


class Spacer(ContentComponent):
    """
    ![Spacer](../../../../docs/packages/dara-components/common/assets/Spacer.png)

    A Spacer component is a way of adding space between two elements in your document. It can be placed
    in a vertical or horizontal stack and add a gap (defined by the size property, defaults to 0.75rem) into the flow of
    the parent.

    Additionally, Spacer can also draw a dividing line down the center of this gap to act as a separator between
    different sections or columns. Setting `line=True` will enable the line and setting the inset property will define
    how close to the container edge it goes.

    A Spacer component can be created like so:

    ```python

    from dara.components.common import Spacer, Stack, Text

    Stack(
        Text('Above Spacer'),
        Spacer(),
        Text('Below Spacer'),
    )

    ```

    Or with a dividing line:

    ```python

    from dara.components.common import Spacer, Stack, Text

    Stack(
        Text('Above Spacer'),
        Spacer(line=True),
        Text('Below Spacer'),
    )

    ```

    You can also add an inset to the line as px or percentage:

    ```python

    from dara.components.common import Spacer, Stack, Text

    Stack(
        Text('Above Spacer'),
        Spacer(line=True, inset='1rem'),
        Text('Middle Spacer'),
        Spacer(line=True, inset='5%'),
        Text('Below Spacer'),
    )

    ```

    :param line: Whether the spacer should draw a dividing line
    :param size: The size of the gap to introduce (can be a number of pixels or percentage)
    :param inset: The distance away from the edges to stop drawing the line (can be a number of pixels or percentage)
    """

    line: bool = False
    size: Union[int, str] = '0.75rem'
    inset: Union[int, str] = '0rem'

    @validator('size', 'inset')
    @classmethod
    def validate_dimension(cls, value):
        if isinstance(value, int):
            return f'{value}px'
        return value
