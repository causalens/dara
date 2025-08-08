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

from dara.components.common.base_component import BaseDashboardComponent
from dara.core.interactivity import ClientVariable


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

    markdown: Union[ClientVariable, str]
    html_raw: bool = False

    def __init__(self, markdown: Union[ClientVariable, str], html_raw: bool = False, **kwargs):
        super().__init__(markdown=markdown, html_raw=html_raw, **kwargs)
