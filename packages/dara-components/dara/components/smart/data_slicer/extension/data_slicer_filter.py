"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel
from typing_extensions import TypedDict

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
