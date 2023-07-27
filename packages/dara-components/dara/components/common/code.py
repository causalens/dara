"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from enum import Enum
from typing import Optional, Union

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import NonDataVariable


class Themes(str, Enum):
    """Code component available themes enum"""

    LIGHT = 'light'
    DARK = 'dark'


class Code(ContentComponent):
    """
    ![Code](../../../../docs/packages/dara-components/common/assets/Code.png)

    A Code component is used to display/highlight a section of code in your document. It accepts a block of code as
    it's first argument and can also accept an optional parameter of language to specify the type of highlighting to
    use. By default the language is set to python (available languages can be found here:
    https://highlightjs.org/static/demo/)

    A code component rendered with code as a string and language:

    ```python

    from dara.components.common import Code

    Code(code='def some_func():\n    pass', language='py')

    ```

    You can set a theme for the code component different than the one set for the app, for example you can have the
    app using the default light theme, but code in dark mode:

    ```python

    from dara.components.common import Code

    Code(code='def some_func():\n    pass', theme=Code.Themes.DARK)

    ```

    :param code: The code to be formatted as a string
    :param theme: Defines the theme to be used by the component, can be either 'light' or 'dark', if unset it will infer this from the app's set theme
    :param language: The language to use for code highlighting
    """

    code: Union[str, NonDataVariable]
    theme: Optional[Themes] = None
    language: str = 'python'

    Themes = Themes
