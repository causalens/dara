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
