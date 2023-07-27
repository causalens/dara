"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional

from pydantic import validator

from dara.components.common.base_component import LayoutComponent
from dara.core.interactivity import NonDataVariable


class Overlay(LayoutComponent):
    """
    The overlay component accepts a set of children and renders them as an overlay depending on the value of the show flag.

    An overlay component is created like so:

    ```python

    from dara.core import Variable
    from dara.components.common import Overlay, Text

    Overlay(
        Text('Overlay Text'),
        show=Variable(default=True)
    )

    ```

    :param show: Boolean Variable instance recording the state, if True it renders the overlay and its' children
    :param position: the position of the overlay; can be top-left, top-right, bottom-left, bottom-right
    :param padding: the padding around the overlay elements passed a string; can also be passed as individual side's padding in css shorthand format
    :param margin: the margin property to shift the overlay in any direction passed as a string; can also be passed as individual side's margin in css shorthand format
    """

    show: Optional[NonDataVariable] = None
    padding: Optional[str] = None
    margin: Optional[str] = None

    @validator('position')
    @classmethod
    def validate_position(cls, position) -> str:
        position_list = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
        if position not in position_list:
            raise ValueError(
                f'Invalid position: {position}, position should be one of the following values: {position_list}'
            )
        return position
