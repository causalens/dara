"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

import abc
from typing import Literal, Optional

from pydantic import BaseModel

from dara.core.base_definitions import CacheType
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.filtering import FilterQuery


class AnyDataVariable(AnyVariable, abc.ABC):
    """
    AnyDataVariable represents any variable that is specifically designed to hold datasets (i.e. DataVariable, DerivedDataVariable)

    :param uid: the unique identifier for this variable; if not provided a random one is generated
    :param filters: a dictionary of filters to apply to the data
    """

    uid: str
    filters: Optional[FilterQuery] = None

    def __init__(self, uid: Optional[str] = None, **kwargs) -> None:
        super().__init__(uid=uid, **kwargs)

    def filter(self, filters: FilterQuery):
        return self.copy(update={'filters': filters}, deep=True)


class DataVariableRegistryEntry(BaseModel):
    """
    Registry entry for DataVariable.
    """

    cache: CacheType
    uid: str
    type: Literal['plain', 'derived']

    class Config:
        extra = 'forbid'
        arbitrary_types_allowed = True
