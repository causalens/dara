"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from __future__ import annotations

from enum import Enum
from typing import TYPE_CHECKING, Union

from pydantic import BaseModel

from dara.core.base_definitions import TemplateMarker

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


class Condition(BaseModel):
    operator: Operator
    other: Union[BaseModel, int, float, str, bool, None, AnyVariable]
    variable: Union[AnyVariable, TemplateMarker]

    Operator = Operator

    class Config:
        # This makes it properly check the union type rather than coercing to variable type
        smart_union = True
