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

from pydantic import field_validator

from dara.components.common.anchor import Anchor
from dara.components.common.base_component import LayoutComponent, LayoutError
from dara.components.common.icon import Icon
from dara.components.common.text import Text


class Paragraph(LayoutComponent):
    """
    ![Paragraph](../../../../docs/packages/dara-components/common/assets/Paragraph.png)

     A Paragraph component allows multiple bits of text to be concatenated together easily into a single paragraph. It
     only accepts Text or Anchor components as children.

     A Paragraph component is created via:

     ```python

    from dara.components.common import Paragraph, Text

    Paragraph(Text("This is some paragraph text"))

     ```

     The Text components provided are concatenated:

     ```python

    from dara.components.common import Paragraph, Text

    Paragraph(Text("This is a long sentence"), Text("which is concatenated into a single paragraph"))

     ```

     The Paragraph can also be created with a mix of Text or Anchor components:

     ```python

    from dara.components.common import Anchor, Paragraph, Text

    Paragraph(
        Text('Some initial text'),
        Anchor('an anchor', href='https://www.example.com'),
        Text('More text'),
    )

     ```

    """

    @field_validator('children')
    @classmethod
    def validate_children(cls, children):
        for child in children:
            if isinstance(child, (Text, Anchor, Icon)) is False:
                raise LayoutError(
                    f'Only Text and Anchor components can be nested inside a Paragraph, you passed: \
                                  ({child.__class__.__name__})'
                )
        return children
