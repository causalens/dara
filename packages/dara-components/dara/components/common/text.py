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

from typing import Union

from pydantic import field_validator

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import ClientVariable


class Text(ContentComponent):
    """
    A Text component is the basic component for adding text to an app.

    A Text component is created via:

    ```python

    from dara.components.common import Text

    Text('A bold string', bold=True)
    Text('A string with larger font size', font_size='1.2rem')

    ```

    Additionally, a Text component can have its value set with a Variable via:

    ```python

    from dara.core import Variable
    from dara.components.common import Text

    Text(Variable('A Variable string'))

    ```

    :param text: The text to display
    :param formatted: Whether to display the text with existing formatting intact or not, default False
    """

    text: Union[str, ClientVariable]
    align: Union[str, None] = 'left'  # type: ignore # this is actually textAlign not align-items
    formatted: bool = False

    @field_validator('text')
    @classmethod
    def only_strings(cls, value: str):
        if not isinstance(value, (str, ClientVariable)):
            raise ValueError(f'Invalid text passed to Text: {value}, expected a string')
        return value

    def __init__(self, text: Union[str, ClientVariable], **kwargs):
        super().__init__(text=text, **kwargs)
