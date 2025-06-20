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

from enum import Enum
from typing import TYPE_CHECKING, ClassVar, Union

from pydantic import SerializerFunctionWrapHandler, model_serializer

from dara.core.base_definitions import DaraBaseModel as BaseModel

# Type-only imports
if TYPE_CHECKING:
    from dara.core.interactivity.any_variable import AnyVariable


class Operator(Enum):
    EQUAL = 'equal'
    NOT_EQUAL = 'not_equal'
    GREATER_EQUAL = 'greater_equal'
    GREATER_THAN = 'greater_than'
    LESS_EQUAL = 'less_equal'
    LESS_THAN = 'less_than'
    TRUTHY = 'truthy'


OperatorType = type[Operator]


class Condition(BaseModel):
    operator: Operator
    other: Union[BaseModel, int, float, str, bool, None, AnyVariable]
    variable: AnyVariable

    Operator: ClassVar[OperatorType] = Operator

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)

        return {**parent_dict, '__typename': 'Condition'}
