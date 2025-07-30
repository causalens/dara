import json
import re
from datetime import datetime

import numpy as np
import pandas as pd
import pytest
from pandas.testing import assert_frame_equal

from dara.core.internal.pandas_utils import df_convert_to_internal, df_to_json, get_schema


@pytest.fixture
def sample_df():
    return pd.DataFrame({'A': [1, 2, 3], 'B': ['x', 'y', 'z'], 'C': [1.1, 2.2, 3.3]})


@pytest.fixture
def hierarchical_df():
    return pd.DataFrame(
        {('Group1', 'A'): [1, 2, 3], ('Group1', 'B'): ['x', 'y', 'z'], ('Group2', 'C'): [1.1, 2.2, 3.3]}
    )


@pytest.fixture
def multi_index_df(sample_df):
    df = sample_df.copy()
    df.set_index(['A', 'B'], inplace=True)
    return df


def assert_schema_columns(df):
    if isinstance(df, str):
        df = pd.read_json(df, orient='records')
    schema = get_schema(df)
    for col in df.columns:
        field_schema = next((f for f in schema['fields'] if f['name'] == col), None)
        assert field_schema is not None


def test_basic_conversion(sample_df):
    result = df_to_json(sample_df)
    assert isinstance(result, str)

    # Parse the JSON string back to a DataFrame
    df_result = pd.read_json(result, orient='records')

    # Check if all columns are prefixed correctly
    assert all(col.startswith('__col__') for col in df_result.columns if not col.startswith('__index__'))

    # Check if index is added as a column
    assert '__index__0__index' in df_result.columns

    assert_schema_columns(df_result)


def test_hierarchical_columns(hierarchical_df):
    result = df_to_json(hierarchical_df)
    df_result = pd.read_json(result, orient='records')

    assert '__col__1__Group1_A' in df_result.columns
    assert '__col__2__Group1_B' in df_result.columns
    assert '__col__3__Group2_C' in df_result.columns

    assert_schema_columns(df_result)


def test_multi_index(multi_index_df):
    result = df_to_json(multi_index_df)
    df_result = pd.read_json(result, orient='records')

    assert '__index__0__A' in df_result.columns
    assert '__index__1__B' in df_result.columns

    assert_schema_columns(df_result)


def test_already_formatted_df():
    df = pd.DataFrame({'__col__0__A': [1, 2, 3], '__col__1__B': ['x', 'y', 'z']})
    result = df_to_json(df)
    df_result = pd.read_json(result, orient='records')

    assert_frame_equal(df, df_result)

    assert_schema_columns(df_result)


def test_empty_dataframe():
    df = pd.DataFrame()
    result = df_to_json(df)
    assert result == '[]'


def test_non_string_column_names():
    df = pd.DataFrame({0: [1, 2, 3], 1: ['x', 'y', 'z'], 2.5: [1.1, 2.2, 3.3]})
    result = df_to_json(df)
    df_result = pd.read_json(result, orient='records')

    assert '__col__1__0.0' in df_result.columns
    assert '__col__2__1.0' in df_result.columns
    assert '__col__3__2.5' in df_result.columns

    assert_schema_columns(df_result)


def test_large_dataframe():
    df = pd.DataFrame(np.random.rand(10000, 100))
    result = df_to_json(df)
    df_result = pd.read_json(result, orient='records')

    assert df_result.shape == (10000, 102)  # 100 columns + 2 index column

    assert_schema_columns(df_result)


def test_mixed_dtypes():
    df = pd.DataFrame(
        {
            'A': [1, 2, 3],
            'B': ['x', 'y', 'z'],
            'C': [1.1, 2.2, 3.3],
            'D': [True, False, True],
            'E': pd.date_range('2025-01-01', periods=3),
        }
    )
    result = df_to_json(df)
    df_result = pd.read_json(result, orient='records')

    assert df_result['__col__1__A'].dtype == 'int64', f'Expected int64 dtype, got {df_result["__col__0__A"].dtype}'
    assert df_result['__col__2__B'].dtype == 'object', f'Expected object dtype, got {df_result["__col__1__B"].dtype}'
    assert df_result['__col__3__C'].dtype == 'float64', f'Expected float64 dtype, got {df_result["__col__2__C"].dtype}'
    assert df_result['__col__4__D'].dtype == 'bool', f'Expected bool dtype, got {df_result["__col__3__D"].dtype}'
    assert df_result['__col__5__E'].dtype == 'int64', (
        f'Expected datetime64 dtype, got {df_result["__col__5__E"].dtype}'
    )  # Datetime is sent as Unix timestamp

    assert_schema_columns(df_result)


def test_null_values():
    df = pd.DataFrame({'A': [1, None, 3], 'B': ['x', np.nan, 'z'], 'C': [1.1, 2.2, None]})
    result = df_to_json(df)
    df_result = pd.read_json(result, orient='records')

    assert df_result['__col__1__A'].isna().sum() == 1
    assert df_result['__col__2__B'].isna().sum() == 1
    assert df_result['__col__3__C'].isna().sum() == 1

    assert_schema_columns(df_result)


def test_duplicate_column_names():
    df = pd.DataFrame({'A': [1, 2, 3], 'B': [1.1, 2.2, 3.3]})
    df2 = pd.concat([df, pd.DataFrame({'A': ['x', 'y', 'z'], 'B': [1.1, 2.2, 3.3]})], axis=1)
    result = df_to_json(df2)
    df_result = pd.read_json(result, orient='records')

    assert '__col__1__A' in df_result.columns
    assert '__col__2__B' in df_result.columns
    assert '__col__3__A' in df_result.columns
    assert '__col__4__B' in df_result.columns

    assert_schema_columns(df_result)


def test_json_serialization():
    df = pd.DataFrame(
        {'A': [1, 2, 3], 'B': ['x', 'y', 'z'], 'C': [{'key': 'value'}, {'key': 'value'}, {'key': 'value'}]}
    )
    result = df_to_json(df)

    # Ensure the result can be parsed as valid JSON
    try:
        json.loads(result)
    except json.JSONDecodeError:
        pytest.fail('Result is not valid JSON')

    assert_schema_columns(result)


def test_original_df_unmodified(sample_df):
    original_df_copy = sample_df.copy()
    result = df_to_json(sample_df)

    assert_frame_equal(sample_df, original_df_copy)

    assert_schema_columns(result)


def test_df_datetime64_to_json():
    dates = ['2024-07-14', '2024-07-15', '2024-07-21']
    test_dates = pd.to_datetime(dates)

    # Create DataFrame with different datetime64 units
    df = pd.DataFrame(
        {
            'dt_ns': test_dates.astype('datetime64[ns]'),
            'dt_ms': test_dates.astype('datetime64[ms]'),
            'dt_s': test_dates.astype('datetime64[s]'),
        }
    )

    result = df_to_json(df)
    df_result = pd.read_json(result, orient='records')

    schema = get_schema(df_convert_to_internal(df))

    for col in df_result.columns:
        field_schema = next((f for f in schema['fields'] if f['name'] == col), None)
        assert field_schema is not None
        if 'dt' in field_schema['name']:
            assert 'datetime64[' in field_schema['type']

    # parse json back to a dict
    json_dict = json.loads(result)

    # Try to load each column following the schema type and check that it's possible
    for row in json_dict:
        for col in ['dt_ns', 'dt_ms', 'dt_s']:
            col_name = next((k for k in row.keys() if col in k), None)
            assert col_name is not None
            col_value = next((v for k, v in row.items() if col in k), None)
            assert col_value is not None
            schema_field_data = next((f for f in schema['fields'] if f['name'] == col_name), None)
            unit = re.search(r'\[(.*)\]', schema_field_data['type']).group(1)

            # This follows client-side logic for converting back to milliseconds
            if unit == 'ns':
                value_ms = col_value / 1_000_000
            elif unit == 'ms':
                value_ms = col_value
            elif unit == 's':
                value_ms = col_value * 1_000
            else:
                raise ValueError(f'Unknown unit {unit}')

            value_seconds = value_ms / 1_000
            date = datetime.fromtimestamp(value_seconds)
            # Check that the date is correct, error case would be invalid date or 1970 etc
            assert date.year == 2024
