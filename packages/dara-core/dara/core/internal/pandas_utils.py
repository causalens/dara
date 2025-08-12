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

import json
import uuid
from typing import Any, Literal, Optional, TypeVar, Union, cast, overload

from pandas import DataFrame, MultiIndex, Series
from typing_extensions import TypedDict, TypeGuard

INDEX = '__index__'


@overload
def append_index(df: DataFrame) -> DataFrame: ...


@overload
def append_index(df: None) -> None: ...


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

    # Apply display transformations to the DataFrame
    format_for_display(df)

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


def format_for_display(df: DataFrame) -> None:
    """
    Apply transformations to a DataFrame to make it suitable for display.
    Not: this does NOT make a copy of the DataFrame
    """
    for col in df.columns:
        column_data = df[col]
        if isinstance(column_data, DataFrame):
            # Handle duplicate column names - format each column in the sub-DataFrame
            for sub_col in column_data.columns:
                if isinstance(column_data[sub_col], Series) and column_data[sub_col].dtype == 'object':
                    column_data.loc[:, sub_col] = column_data[sub_col].apply(str)
        elif column_data.dtype == 'object':
            # We need to convert all values to string to avoid issues with
            # displaying data in the Table component, for example when
            # displaying datetime and number objects in the same column
            df.loc[:, col] = column_data.apply(str)


class FieldType(TypedDict):
    name: Union[str, tuple[str, ...]]
    type: Literal['integer', 'number', 'boolean', 'datetime', 'duration', 'any', 'str']


class DataFrameSchema(TypedDict):
    fields: list[FieldType]
    primaryKey: list[str]


class DataResponse(TypedDict):
    data: Optional[DataFrame]
    count: int
    schema: Optional[DataFrameSchema]


def is_data_response(response: Any) -> TypeGuard[DataResponse]:
    has_shape = isinstance(response, dict) and 'data' in response and 'count' in response
    if not has_shape:
        return False
    return response['data'] is None or isinstance(response['data'], DataFrame)


def data_response_to_json(response: DataResponse) -> str:
    """
    Serialize a DataResponse to JSON.

    json.dumps() custom serializers only accept value->value mappings, whereas `to_json` on pandas returns a string directly.
    To avoid double serialization, we first insert a placeholder string and then replace it with the actual serialized JSON.
    """
    placeholder = str(uuid.uuid4())

    def _custom_serializer(obj: Any) -> Any:
        if isinstance(obj, DataFrame):
            return placeholder
        raise TypeError(f'Object of type {type(obj)} is not JSON serializable')

    result = json.dumps(response, default=_custom_serializer)
    result = result.replace(
        f'"{placeholder}"', df_to_json(response['data']) if response['data'] is not None else 'null'
    )
    return result


def build_data_response(data: DataFrame, count: int) -> DataResponse:
    data_internal = df_convert_to_internal(data)
    schema = get_schema(data_internal)

    return DataResponse(data=data, count=count, schema=schema)


def get_schema(df: DataFrame):
    from pandas.io.json._table_schema import build_table_schema

    raw_schema = build_table_schema(df)

    for field_data in cast(list, raw_schema['fields']):
        if field_data.get('type') == 'datetime':
            # for datetime fields we need to know the resolution, so we get the actual e.g. `datetime64[ns]` string
            column_name = field_data.get('name')
            dtype_str = str(df[column_name].dtype)
            field_data['type'] = dtype_str

    return cast(DataFrameSchema, raw_schema)
