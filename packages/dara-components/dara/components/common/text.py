"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Union

from pydantic import validator

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import NonDataVariable


class Text(ContentComponent):
    """
    A Text component is the basic component for adding text to an app.

    A Text component is created via:

    ```python

    from dara.components.common import Text

    Text('A bold string', bold=True)

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

    text: Union[str, NonDataVariable]
    align: str = 'left'
    formatted: bool = False

    @validator('text')
    @classmethod
    def only_strings(cls, value: str):
        if not isinstance(value, (str, NonDataVariable)):
            raise ValueError(f'Invalid text passed to Text: {value}, expected a string')
        return value

    def __init__(self, text: Union[str, NonDataVariable], **kwargs):
        super().__init__(text=text, **kwargs)
