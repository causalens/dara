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

from typing import List

from pandas import DataFrame

from dara.components.common.table import Column, TableFormatterType
from dara.components.smart.data_slicer.extension.data_slicer_filter import ColumnType
from dara.components.smart.data_slicer.utils.core import ColumnDefinition


def get_describe_data(df: DataFrame) -> DataFrame:
    # Exclude the internal __index__ col from stats
    cols = set(df.columns) - {'__index__'}
    describe_df = df[list(cols)].describe(include='all').fillna('NaN').reset_index()
    return describe_df


def get_head_data(df: DataFrame, rows_to_show: int) -> DataFrame:
    return df.head(rows_to_show).fillna('NaN')


def get_tail_data(df: DataFrame, rows_to_show: int) -> DataFrame:
    return df.tail(rows_to_show).fillna('NaN')


def get_columns(col_defs: List[ColumnDefinition]) -> List[Column]:
    cols = []

    for col_def in col_defs:
        col = Column(
            col_id=col_def['name'],
        )
        if col_def['type'] == ColumnType.DATETIME:
            col.formatter = {'type': TableFormatterType.DATETIME}
            col.type = 'datetime'

        cols.append(col)

    return cols
