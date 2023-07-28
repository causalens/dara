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

from typing import Optional

from dara.components.common.base_component import ContentComponent


class Icon(ContentComponent):
    """
    An Icon Component that adds font-awesome icons to the framework. It accepts a color that can be any valid
    css color, e.g. 'red', 'black' or a hex code '#fff'. Alternatively you can also use one of the colors defined
    by the theme, this is shown in the example below:

    ```python

    from dara.core.css import get_icon
    from dara.components.common import Icon
    from dara.core.visual.themes.light import Light


    Icon(
        icon=get_icon('wrench'),
        color=Light.colors.orange,
    )

    ```

    The icon size can be defined within the get_icon function, this can take any of the following values: '2xs', 'xs',
    'sm', 'lg', 'xl', '2xl', '1x', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x'. To learn more bout sizing icons
    please visit [icon sizing](https://fontawesome.com/docs/web/style/size).

    Example usage:

    ```python

    from dara.core.css import get_icon
    from dara.components.common import Icon


    Icon(
        icon=get_icon('spaghetti-monster-flying', size='5x'),
    )

    ```



    :param icon: An optional icon to display, see dara.core.css.get_icon for details
    :param color: the color of the icon
    """

    icon: str
    color: Optional[str] = None
