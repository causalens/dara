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

import logging
from typing import Union

from dara.components.common.base_component import LayoutComponent
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import Variable
from dara.core.visual.components.types import Direction

logger = logging.getLogger(__name__)


class Stack(LayoutComponent):
    """
    ![Stack](../../../../docs/packages/dara-components/common/assets/Stack.png)

    A Stack component is one of the core components for laying out a document. By default a stack takes any number of children
    as arguments and stacks them underneath each other from first to last. This behavior can be altered to create
    evenly spaced columns from left to right by adding the direction='horizontal' argument to the constructor.

    Stacks can be nested inside one another to create complex layouts that automatically scale correctly to the display
    size. Stacks will also take into account any child width/height in the layout, e.g. in a 3 column layout, if the
    first column has a width of 20% then the remaining columns will each get a width of 40% automatically.

    Note that by default Stack adds a gap of 0.75rem between child components. When defining the widths and heights inside
    of a Stack if the sum is greater than 100% the Stack will overflow. For example if a Stack has two text components each taking
    a height of 50%, then the total height is 50% + 50% + 0.75rem, in that case it does overflow. Make sure to take
    the gap into account when defining the width/height of your child components. In the example above you could use `calc` and instead
    define the Text heights as `calc((100% - 0.75rem) / 2)`. If you wish to disable this default gap you can add `raw_css={'gap': 0}` to the component.

    A Stack component can be created like so:

    ```python

    from dara.components.common import Stack, Text

    Stack(
        Text('One Component'),
        Text('Another Component')
    )

    ```

    By default a Stack will occupy as much space as it can and if multiple Stacks are present they will fill the parent container.
    This behavior can be altered by setting the `hug` argument to True. This will make the Stack hug its contents and only
    occupy as much space as it needs. Example of a horizontal Stack that hugs its contents:

    ```python

    from dara.components.common import Stack, Text

    Stack(
        Text('One Component'),
        Text('Another Component'),
        direction='horizontal',
        hug=True,
    )

    ```

    You can also set a specific size that the Stack should take if there are certain proportions you want to maintain, in
    the example below the first Stack will take 30% of the available space, the second Stack will take as much space as
    its contents need, and the last Stack will take the remaining space:

    ```python

    from dara.components.common import Stack

    Stack(
        # first Stack takes 30% of the available space
        Stack(
            ...
            height='30%',
        ),
        # second Stack takes as much space as its contents need
        Stack(
            ...
            hug=True,
        ),
        # last Stack takes the remaining space
        Stack(
            ...
        ),
    )

    ```

    If you would like the contents of a Stack to scroll you can set the `scroll` argument to True,
    However if the Stack has the hug argument set to True then you would need to set the `overflow` argument to 'auto' instead.

    ```python

    from dara.components.common import Stack, Text

    Stack(
        ...,
        Stack(
            ...,  # some content that overflows
            scroll=True,
        ),
        Stack(
            ...,  # some content that should overflow
            hug=True,
            overflow='auto',
        )
    )

    ```

    Important: when using `For` component with `virtualization` enabled, do not use the Stack `scroll` argument,
    as it is redundant and will result in unexpected behavior. The `For` component will automatically handle scrolling
    for you.

    :param direction: The direction to stack children, can be 'vertical' or 'horizontal', default is 'vertical'
    :param collapsed: Whether to collapse the stack
    :param justify: How to justify the content of the stack, accepts any flexbox justifications
    :param align: How to align the content of the stack, accepts any flexbox alignments
    :param hug: Whether to hug the content of the stack, defaults to False
    :param scroll: Whether to scroll the content of the stack, defaults to False
    """

    collapsed: Union[Variable[bool], bool] = False
    direction: Direction = Direction.VERTICAL
    hug: Union[bool, None] = False
    scroll: bool = False

    # Dummy init that just passes through arguments to superclass, fixes Pylance complaining about types
    def __init__(self, *args: Union[ComponentInstance, None], **kwargs):
        super().__init__(*args, **kwargs)
