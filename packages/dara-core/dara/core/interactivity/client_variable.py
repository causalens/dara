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

from __future__ import annotations

import abc
from typing import Optional

from dara.core.interactivity.any_variable import AnyVariable


class ClientVariable(AnyVariable, abc.ABC):
    """
    Client represents any variable which can be ordinarily serialized to the client

    :param uid: the unique identifier for this variable; if not provided a random one is generated
    """

    uid: str

    def __init__(self, uid: Optional[str] = None, **kwargs) -> None:
        super().__init__(uid=uid, **kwargs)

    @property
    def list_item(self):
        """
        Get a LoopVariable that represents the current item in the list.
        Should only be used in conjunction with the `For` component.

        Note that it is a type of a Variable so it can be used in places where a regular Variable is expected.

        By default, the entire list item is used as the item.

        `LoopVariable` supports nested property access using `get` or index access i.e. `[]`.
        You can mix and match those two methods to access nested properties as they are equivalent.

        ```python
        my_list = Variable(['foo', 'bar', 'baz'])

        # Represents the entire item in the list
        my_list.list_item

        my_list_of_objects = Variable([
            {'id': 1, 'name': 'John', 'data': {'city': 'London', 'country': 'UK'}},
            {'id': 2, 'name': 'Jane', 'data': {'city': 'Paris', 'country': 'France'}},
        ])

        # Represents the item 'name' property
        my_list_of_objects.list_item['name']

        # Represents the item 'data.country' property
        my_list_of_objects.list_item.get('data')['country']
        """

        from .loop_variable import LoopVariable

        return LoopVariable()
