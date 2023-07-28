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
