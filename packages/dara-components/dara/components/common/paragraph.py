"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from pydantic import validator

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

    @validator('children')
    @classmethod
    def validate_children(cls, children):
        for child in children:
            if isinstance(child, (Text, Anchor, Icon)) is False:
                raise LayoutError(
                    f'Only Text and Anchor components can be nested inside a Paragraph, you passed: \
                                  ({child.__class__.__name__})'
                )
        return children
