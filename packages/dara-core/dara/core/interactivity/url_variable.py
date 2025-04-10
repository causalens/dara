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

from typing import Any, Generic, Optional, TypeVar

from pydantic import ConfigDict, SerializerFunctionWrapHandler, model_serializer

from dara.core.interactivity.non_data_variable import NonDataVariable

VariableType = TypeVar('VariableType')


class UrlVariable(NonDataVariable, Generic[VariableType]):
    """
    A UrlVariable is very similar to a normal Variable however rather than it's state being stored in the memory of
    the client it's value is stored in the url of page as a query parameter. This is very useful for parameterizing
    pages as you switch from one to the other.
    """

    default: Optional[VariableType] = None
    query: str
    uid: str
    model_config = ConfigDict(extra='forbid')

    def __init__(self, query: str, default: Optional[VariableType] = None, uid: Optional[str] = None):
        """
        A UrlVariable is very similar to a normal Variable however rather than it's state being stored in the memory of
        the client it's value is stored in the url of page as a query parameter. This is very useful for parameterizing
        pages as you switch from one to the other.

        :param query: the key in the query string to identify this variable
        :param default: the initial value for the variable, defaults to None
        :param uid: the unique identifier for this variable; if not provided a random one is generated
        """
        super().__init__(query=query, default=default, uid=uid)

    def sync(self):
        """
        Create an action to synchronise the value of this UrlVariable with input value sent from the component.

        ```python

        from dara.core import UrlVariable
        from dara.components import Select

        var = UrlVariable('first', query='num')
        another_var = UrlVariable('second', query='num_two')

        Select(
            value=var,
            items=['first', 'second', 'third'],
            onchange=another_var.sync(),
        )

        ```
        """
        from dara.core.interactivity.actions import (
            UpdateVariableImpl,
            assert_no_context,
        )

        assert_no_context('ctx.update')
        return UpdateVariableImpl(variable=self, value=UpdateVariableImpl.INPUT)

    def toggle(self):
        """
        Create an action to toggle the value of this UrlVariable. Note this only works for boolean variables.

        ```python

        from dara.core import UrlVariable
        from dara.components import Button

        var = UrlVariable(True, query='show')

        Button(
            'Toggle',
            onclick=var.toggle(),
        )

        ```
        """
        from dara.core.interactivity.actions import (
            UpdateVariableImpl,
            assert_no_context,
        )

        assert_no_context('ctx.update')
        return UpdateVariableImpl(variable=self, value=UpdateVariableImpl.TOGGLE)

    def update(self, value: Any):
        """
        Create an action to update the value of this UrlVariable to a provided value.

        ```python

        from dara.core import UrlVariable
        from dara.components import Button

        show = UrlVariable(True, query='show')

        Button(
            'Hide',
            onclick=show.update(False),
        )

        ```
        """
        from dara.core.interactivity.actions import (
            UpdateVariableImpl,
            assert_no_context,
        )

        assert_no_context('ctx.update')
        return UpdateVariableImpl(variable=self, value=value)

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)
        return {**parent_dict, '__typename': 'UrlVariable', 'uid': str(parent_dict['uid'])}
