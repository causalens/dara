"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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
