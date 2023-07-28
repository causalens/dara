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
