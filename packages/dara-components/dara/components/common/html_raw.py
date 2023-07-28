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

from dara.components.common.base_component import ContentComponent


class HtmlRaw(ContentComponent):
    """
    A HTML Raw component that displays a raw HTML and stretches to fit its container

    A HTML Raw component can be created like:

    ```python

    from dara.components.common import HtmlRaw

    HtmlRaw(
        html='<iframe height="100%" width="100%" src="https://www.youtube.com/embed/tgbNymZ7vqY"></iframe>'
    )

    ```

    :param html: The raw html to display, should be string
    """

    html: str
