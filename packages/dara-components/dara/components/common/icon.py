"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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
