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

from typing import Literal, Optional

# Re-export CSSProperties for easier importing
from dara.core.visual.css import CSSProperties  # noqa: F401

IconStyle = Literal['solid', 'regular', 'brands']
IconSize = Literal['1x', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x', '2xs', 'xs', 'sm', 'lg', 'xl', '2xl']


def get_icon(
    name: str,
    style: IconStyle = 'solid',
    size: Optional[IconSize] = None,
):
    """
    Get FontAwesome icon class string. Can be used for components requiring an icon name. The size be any one of the
    following:'2xs', 'xs', 'sm', 'lg', 'xl', '2xl', '1x', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x'.
    Note: only free tier icons are supported.

    To find an icon:

    1) Navigate to https://fontawesome.com/search?m=free
    2) Find the icon you want
    3) Fill in `name` (and optionally `style` and size)

    :params name: icon name (without the `fa` prefix)
    :params style: icon style, defaults to `solid` (i.e. `fa-brands` is `brands`)
    :params size: optional icon size
    """
    icon_class = f'fa-{style} fa-{name}'

    if size:
        icon_class = f'fa-{size} {icon_class}'

    return icon_class
