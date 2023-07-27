"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Literal, Optional

# Re-export CSSProperties for easier importing
# pylint: disable=unused-import
from dara.core.visual.css import CSSProperties

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
