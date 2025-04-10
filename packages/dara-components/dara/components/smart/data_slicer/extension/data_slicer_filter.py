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

from enum import Enum
from typing import List, Optional

from typing_extensions import TypedDict

from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import AnyVariable, Variable


class ColumnType(Enum):
    CATEGORICAL = 'categorical'
    DATETIME = 'datetime'
    NUMERICAL = 'numerical'


class FilterInstance(TypedDict):
    column: str
    range: str
    values: str
    from_date: str
    to_date: str


ALLOWED_FILTERS = {
    ColumnType.CATEGORICAL: ['values'],
    ColumnType.NUMERICAL: ['values', 'range'],
    ColumnType.DATETIME: ['from_date', 'to_date'],
}


class Column(BaseModel):
    name: str
    type: ColumnType


class DataSlicerFilter(ComponentInstance):
    """
    Data Slicer Filter component.

    :param filters: variable holding a list of filters
    :param columns: variable holding list of columns
    """

    js_module = '@darajs/components'

    filters: Variable[List[FilterInstance]]
    columns: AnyVariable
    height: Optional[str] = None
