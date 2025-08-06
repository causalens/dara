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

from typing import TYPE_CHECKING, Optional

from pydantic import SerializerFunctionWrapHandler, model_serializer
from typing_extensions import Literal

from dara.core.interactivity.client_variable import ClientVariable

if TYPE_CHECKING:
    from dara.core.interactivity.derived_variable import DerivedVariable


class StateVariable(ClientVariable):
    """
    A StateVariable is an internal variable type used to track client-side state of other variables.
    It is not meant to be created directly by users, but rather returned by properties like
    DerivedVariable.is_loading, DerivedVariable.has_error, etc.

    This variable tracks the state of a parent DerivedVariable and maps to specific properties
    like loading state, error state, etc.
    """

    parent_variable: 'DerivedVariable'
    property_name: Literal['loading', 'error', 'hasValue']

    def __init__(
        self,
        parent_variable: 'DerivedVariable',
        property_name: Literal['loading', 'error', 'hasValue'],
        uid: Optional[str] = None,
        **kwargs,
    ):
        """
        Initialize a StateVariable.

        :param parent_variable: The DerivedVariable this StateVariable tracks
        :param property_name: The property name this StateVariable represents ('loading', 'error', etc.)
        :param uid: Optional unique identifier; if not provided, one is generated
        """
        super().__init__(uid=uid, parent_variable=parent_variable, property_name=property_name, **kwargs)

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)
        return {
            **parent_dict,
            '__typename': 'StateVariable',
            'uid': str(parent_dict['uid']),
            'parent_variable': self.parent_variable,
            'property_name': self.property_name,
        }
