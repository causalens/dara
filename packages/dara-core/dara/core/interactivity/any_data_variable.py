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
