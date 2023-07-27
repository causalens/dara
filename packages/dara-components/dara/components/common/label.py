"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import List, Optional, Union

from pydantic import validator

from dara.components.common.base_component import ContentComponent
from dara.core.definitions import ComponentInstance
from dara.core.visual.components.types import Direction


class Label(ContentComponent):
    """
    ![Label](../../../../docs/packages/dara-components/common/assets/Label.png)

    The Label component accepts a label, which will be placed either above or next to the child component.

    Example of a simple Label component:

    ```python

    from dara.components.common import Label, Input

    Label(
        Input(),
        value='My Input:',
        direction='horizontal',
    )

    ```

    For further customisation you can also pass a ComponentInstance to the value param:

    ```python

    from dara.components.common import Label, Input, Text

    Label(
        Input(),
        value=Heading('My Input:', level=2),
        direction='horizontal',
    )

    ```

    :param value: A label to be presented with the child component, accepts a string or ComponentInstance
    :param direction: Whether to place the label horizontally (next to the component), or vertically (above the component)
    :param label_width: A optional string containing the width the label should take
    """

    value: Union[str, ComponentInstance]
    direction: Direction = Direction.VERTICAL
    label_width: Optional[str] = None

    @validator('children')
    @classmethod
    def validate_only_one_child(cls, children: List[ComponentInstance]) -> List[ComponentInstance]:

        if len(children) > 1:
            raise TypeError(
                'More than one component was passed to the Label component. Label accepts only one child component'
            )

        return children
