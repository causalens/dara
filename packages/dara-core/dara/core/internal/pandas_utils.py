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

from typing import Optional, TypeVar, cast

from pandas import DataFrame, MultiIndex

INDEX = '__index__'


def append_index(df: Optional[DataFrame]) -> Optional[DataFrame]:
    """
    Add a numerical index column to the dataframe
    """
    if df is None:
        return None

    if INDEX not in df.columns:
        new_df = df.copy()
        new_df.insert(0, INDEX, range(0, len(df.index)))  # type: ignore
        return new_df

    return df


value_type = TypeVar('value_type')


def remove_index(value: value_type) -> value_type:
    """
    If `value` is a DataFrame, remove the __index__ column from it.

    Otherwise return same value untouched.
    """
    if isinstance(value, DataFrame):
        return cast(value_type, value.drop(columns=['__index__'], inplace=False, errors='ignore'))

    return value


def df_convert_to_internal(original_df: DataFrame) -> DataFrame:
    """
    Convert a DataFrame to an internal format, with the following modifications:
    - Flatten hierarchical columns to a single level
    - Append a numeric index suffix to all columns
    - Reset each index and append it as a special column
    """
    df = original_df.copy()

    # If the DataFrame is already in the correct format, return it as is
    if any(isinstance(c, str) and c.startswith('__col__') for c in df.columns):
        return df

    # Append index to match the way we process the original DataFrame
    df = cast(DataFrame, append_index(df))

    # Handle hierarchical columns: [(A, B), (A, C)] -> ['A_B', 'A_C']
    if isinstance(df.columns, MultiIndex):
        df.columns = ['_'.join(col).strip() if col[0] != INDEX else INDEX for col in df.columns.values]

    # Append a suffix to all columns
    df.columns = [
        f'__col__{i}__{col}' if not (isinstance(col, str) and col.startswith(INDEX)) else col
        for i, col in enumerate(df.columns)
    ]

    # Handle multi-index
    if isinstance(df.index, MultiIndex):
        df.index.names = [
            f'__index__{i}__{x}' if x is not None else f'__index__{i}__level_{i}' for i, x in enumerate(df.index.names)
        ]
        df = df.reset_index(names=df.index.names)
    else:
        # Otherwise, handle single index
        df.index.name = f'__index__0__{df.index.name}' if df.index.name is not None else '__index__0__index'
        df = df.reset_index(names=[df.index.name])

    return df


def df_to_json(df: DataFrame) -> str:
    return df_convert_to_internal(df).to_json(orient='records', date_unit='ns') or ''


def get_schema(df: DataFrame):
    from pandas.io.json._table_schema import build_table_schema

    raw_schema = build_table_schema(df)

    for field_data in cast(list, raw_schema['fields']):
        if field_data.get('type') == 'datetime':
            # for datetime fields we need to know the resolution, so we get the actual e.g. `datetime64[ns]` string
            column_name = field_data.get('name')
            dtype_str = str(df[column_name].dtype)
            field_data['type'] = dtype_str

    return raw_schema
