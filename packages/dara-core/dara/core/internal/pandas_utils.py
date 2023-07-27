"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Optional, TypeVar

from pandas import DataFrame

INDEX = '__index__'


def append_index(df: Optional[DataFrame]) -> Optional[DataFrame]:
    """
    Add a numerical index column to the dataframe
    """
    if df is None:
        return None

    if INDEX not in df.columns:
        new_df = df.copy()
        new_df.insert(0, INDEX, range(0, len(df.index)))
        return new_df

    return df


value_type = TypeVar('value_type')


def remove_index(value: value_type) -> value_type:
    """
    If `value` is a DataFrame, remove the __index__ column from it.

    Otherwise return same value untouched.
    """
    if isinstance(value, DataFrame):
        return value.drop(columns=['__index__'], inplace=False, errors='ignore')

    return value


def df_to_json(df: DataFrame) -> str:
    return df.to_json(orient='records')
