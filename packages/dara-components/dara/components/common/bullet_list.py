"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import List, Union

from dara.components.common.base_component import ContentComponent
from dara.core.interactivity import DerivedVariable, Variable


class BulletList(ContentComponent):
    """
    ![BulletList](../../../../docs/packages/dara-components/common/assets/BulletList.png)

    A component for creating bullet point lists. Takes a list of items to display and an optional parameter
    that specifies whether the list is ordered, defaults to unordered.

    A BulletList component is created via:

    ```python

    from dara.components.common import BulletList

    BulletList(items=['My', 'Unordered', 'Bullet', 'List'])

    ```

    :param items: List of strings to render
    :param numbered: Boolean, if True then number the bullets
    """

    items: Union[List[str], Variable, DerivedVariable]
    numbered: bool = False
