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

from typing import List, Optional, Union

from pydantic import field_validator

from dara.components.common.base_component import ContentComponent
from dara.core.definitions import ComponentInstance
from dara.core.visual.components.types import Direction


class Label(ContentComponent):
    """
    ![Label](../../../../docs/packages/dara-components/common/assets/Label.png)

    The Label component accepts a label, which will be placed either above or next to the child component.

    Example of a simple Label component:

    ```python
    from dara.core import Variable
    from dara.components.common import Label, Input

    value_var = Variable()

    Label(
        Input(value=value_var),
        value='My Input:',
        direction='horizontal',
    )
    ```

    For further customization you can also pass a ComponentInstance to the value param:

    ```python
    from dara.core import Variable
    from dara.components.common import Label, Input, Heading

    value_var = Variable()

    Label(
        Input(value=value_var),
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

    @field_validator('children')
    @classmethod
    def validate_only_one_child(cls, children: List[ComponentInstance]) -> List[ComponentInstance]:
        if len(children) > 1:
            raise TypeError(
                'More than one component was passed to the Label component. Label accepts only one child component'
            )

        return children
