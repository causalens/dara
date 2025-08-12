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

from enum import Enum
from typing import ClassVar, Optional, Union

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import ClientVariable


class Themes(str, Enum):
    """Code component available themes enum"""

    LIGHT = 'light'
    DARK = 'dark'


ThemesType = type[Themes]


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

    code: Union[str, ClientVariable]
    theme: Optional[Themes] = None
    language: str = 'python'

    Themes: ClassVar[ThemesType] = Themes
