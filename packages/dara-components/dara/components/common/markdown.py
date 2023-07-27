"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Union

from dara.components.common.base_component import BaseDashboardComponent
from dara.core.interactivity import NonDataVariable


class Markdown(BaseDashboardComponent):
    """
    ![Markdown](../../../../docs/packages/dara-components/common/assets/Markdown.png)

    A Markdown component is a basic component for displaying bulky text blocks. It takes a string of text that
    is then rendered as markdown. Supports gfm ([GitHub Flavored Markdown](https://github.github.com/gfm/)).

    A Markdown component is created via:

    ```python
    from dara.components.common import Markdown

    Markdown(' ## Heading\n ### Subheading')

    ```

    :param markdown: a string of markdown to render
    :param html_raw: whether to render HTML included in the markdown; disabled by default as this can be a security risk
    if the markdown is user-provided
    """

    markdown: Union[NonDataVariable, str]
    html_raw: bool = False

    def __init__(self, markdown: Union[NonDataVariable, str], html_raw: bool = False, **kwargs):
        super().__init__(markdown=markdown, html_raw=html_raw, **kwargs)
