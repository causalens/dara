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

from pydantic import field_validator

from dara.components.common.base_component import LayoutComponent
from dara.core.interactivity import ClientVariable


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
    """

    show: Optional[ClientVariable] = None

    @field_validator('position')
    @classmethod
    def validate_position(cls, value) -> str:
        position_list = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
        if value not in position_list:
            raise ValueError(
                f'Invalid position: {value}, position should be one of the following values: {position_list}'
            )
        return value
