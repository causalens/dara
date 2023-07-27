"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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
