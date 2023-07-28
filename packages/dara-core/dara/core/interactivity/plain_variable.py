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

from typing import Generic, List, Optional, TypeVar

from dara.core.interactivity.derived_data_variable import DerivedDataVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.non_data_variable import NonDataVariable

VariableType = TypeVar('VariableType')


class Variable(NonDataVariable, Generic[VariableType]):
    """
    A Variable represents a dynamic value in the system that can be read and written to by components and actions
    """

    default: Optional[VariableType]
    persist_value: bool = False
    uid: str
    nested: List[str] = []

    class Config:
        extra = 'forbid'

    def __init__(
        self, default: Optional[VariableType] = None, persist_value: Optional[bool] = False, uid: Optional[str] = None
    ):
        """
        A Variable represents a dynamic value in the system that can be read and written to by components and actions

        :param default: the initial value for the variable, defaults to None
        :param persist_value: whether to persist the variable value across page reloads
        :param uid: the unique identifier for this variable; if not provided a random one is generated
        """
        super().__init__(default=default, uid=uid, persist_value=persist_value)

    def get(self, key: str):
        """
        Create a copy of this Variable that points to a nested key. This is useful when
        storing e.g. a dictionary in a Variable and wanting to access a specific key.

        ```python
        from dara.core import Variable, UpdateVariable
        from dara_dashboarding_extension import Input, Text, Stack, Button

        state = Variable({
            'input_value': 'Text',
            'settings': {
                'language': 'English'
            }
        })

        page_content = Stack(
            # Only `input_value` will be displayed
            Text(text=state.get('input_value')),

            # Only the specified property will be updated
            Input(value=state.get('input_value')),

            # You can chain the `get` calls to specify a sub-property to use
            Input(value=state.get('settings').get('language')),

            # You can also use the `UpdateVariable` action to update a sub-property
            Button(
                'Set Language to German',
                onclick=UpdateVariable(lambda _: 'German', variable=state.get('settings').get('language')
            )
        )

        :param key: the key to access; must be a string
        ```
        """
        return self.copy(update={'nested': [*self.nested, key]}, deep=True)

    @classmethod
    def create_from_derived(cls, other: DerivedVariable):
        """
        Create a Variable instance from a DerivedVariable.
        The Variable will be initialised with the current value of the DerivedVariable but will still be mutable afterwards.

        :param default: the initial value for the variable, defaults to None
        """
        if isinstance(other, DerivedDataVariable):
            raise ValueError(
                'Cannot create a Variable from a DerivedDataVariable, only standard DerivedVariables are allowed'
            )

        return cls(default=other)   # type: ignore

    def dict(self, *args, **kwargs):
        parent_dict = super().dict(*args, **kwargs)
        return {**parent_dict, '__typename': 'Variable', 'uid': str(parent_dict['uid'])}
