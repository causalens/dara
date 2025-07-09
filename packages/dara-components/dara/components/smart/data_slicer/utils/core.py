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

import re
from datetime import datetime, timezone
from typing import Any, List, Optional, Union, cast

import numpy
from pandas import DataFrame, Series
from typing_extensions import TypedDict

from dara.components.smart.data_slicer.extension.data_slicer_filter import (
    ALLOWED_FILTERS,
    ColumnType,
    FilterInstance,
)
from dara.components.smart.data_slicer.extension.filter_status_button import FilterStats


class ColumnDefinition(TypedDict):
    name: str
    type: ColumnType


def infer_column_type(data: DataFrame, col: str) -> ColumnType:
    """
    Get ColumnType for a given column of a dataframe.

    Returns None for datetime columns if treat_datetime_as_numerical is True.
    Otherwise treats datatime as numerical.

    :param data: dataset as a pandas dataframe
    :param col: column to get type for
    """
    series_values = data[col].values

    # This inference logic follows Dataset.from_dataframe column inference process
    if isinstance(series_values.dtype, numpy.dtype):
        if numpy.issubdtype(series_values.dtype, numpy.number):
            return ColumnType.NUMERICAL
        elif numpy.issubdtype(series_values.dtype, numpy.datetime64):
            return ColumnType.DATETIME
        else:
            return ColumnType.CATEGORICAL
    else:
        return ColumnType.CATEGORICAL


def get_column_definitions(data: DataFrame) -> List[ColumnDefinition]:
    symbols: List[str] = data.columns.values.tolist()

    return [ColumnDefinition(name=s, type=infer_column_type(data, s)) for s in symbols if s != '__index__']


def get_column_items(column_defs: List[ColumnDefinition]) -> list:
    return [{'label': c['name'], 'value': c['name']} for c in column_defs]


def isnumber(*values: Union[str, float]):
    """
    Check if all values are numeric strings (ints, floats etc)
    """
    for val in values:
        try:
            float(val)
        except ValueError:
            return False

    return True


def apply_range_filter(range_filter: str, column: Series) -> Optional['Series']:
    """
    Apply a 'range' filter on a column

    :param range_filter: string containing ranges in format [-5.4, 6.5], [:, :] with : meaning (-)infinity
    :param column: series data
    """
    final_range_filter = None

    # Look for groups of [<something>]
    ranges: List[str] = re.findall(r'\[[^\[\]]+\]', range_filter)

    for rang in ranges:
        if ',' not in rang:
            continue

        # Remove [] signs and split
        lower_raw, upper_raw = rang[1:-1].split(',')

        # Clean up whitespaces
        lower_raw = lower_raw.strip()
        upper_raw = upper_raw.strip()

        # Replace ':' symbols with (-)infinity
        lower: Union[str, float] = float('-inf') if lower_raw == ':' else lower_raw
        upper: Union[str, float] = float('inf') if upper_raw == ':' else upper_raw

        # Only consider the range valid if the limits are numbers and lower < upper
        if lower != '' and upper != '' and isnumber(lower, upper):
            lower_num = float(lower)
            upper_num = float(upper)

            if lower_num < upper_num:
                current_range_filter = (column >= lower_num) & (column <= upper_num)
                final_range_filter = (
                    final_range_filter | current_range_filter
                    if final_range_filter is not None
                    else current_range_filter
                )

    return final_range_filter


def apply_values_filter(values_filter: str, column: Series, col_type: ColumnType) -> Optional['Series']:
    """
    Apply a 'values' filter on a column

    :param range_filter: a range or comma-separated list of ranges
    :param column: series data
    """
    final_values_filter = None

    values: List[Any] = (
        [v.strip() for v in values_filter.split(',') if v != ''] if ',' in values_filter else [values_filter.strip()]
    )

    if col_type == ColumnType.NUMERICAL:
        # values have to be numeric
        if isnumber(*values):
            values = [float(v) for v in values]
            final_values_filter = column.isin(values)

        # Don't filter if non-numeric value is found in values
    elif col_type == ColumnType.CATEGORICAL:
        # values have to be strings
        final_values_filter = column.isin(values)

    return final_values_filter


def parseISO(date: str) -> numpy.datetime64:
    """
    Parse an ISO datestring to numpy.datetime64.
    Deals with 'Z' being used instead of +0000 as a timezone which is common in JavaScript but
    the Python APIs doesn't accept that.

    :param date: ISO datetime string created on the frontend
    """
    d = None

    # First parse it to datetime correctly, handling a case where Z is used instead of +00:00
    if date.endswith('Z'):
        d = datetime.fromisoformat(date[:-1])
        if d.tzinfo is not None:
            raise ValueError(f"time data '{date}' contains multiple timezone suffixes")
        d = d.replace(tzinfo=timezone.utc)
    else:
        d = datetime.fromisoformat(date)

    # Convert to UTC for simplicity
    d = d.astimezone(tz=timezone.utc)
    return numpy.datetime64(d)


def apply_date_filter(from_date: str, to_date: str, column: 'Series') -> Optional['Series']:
    """
    Apply a 'from_date' and 'to_date' filters to a column

    :param from_date: ISO datestring representing the 'from' value
    :param to_date: ISO datestring representing the 'to' value
    :column: series data
    """
    final_date_filter = None

    if from_date != '':
        from_timestamp = parseISO(from_date)
        from_date_filter = column.gt(from_timestamp)  # type: ignore
        final_date_filter = from_date_filter

    if to_date != '':
        to_timestamp = parseISO(to_date)
        to_date_filter = column.lt(to_timestamp)  # type: ignore
        final_date_filter = final_date_filter & to_date_filter if final_date_filter is not None else to_date_filter

    return final_date_filter


def apply_filters(variable_filters: List[FilterInstance], data: DataFrame) -> DataFrame:
    """
    Apply filters on data

    :param variable_filters: list of filters to apply
    :param data: data to filter
    """
    output = data.copy()

    for fil in variable_filters:
        var = fil['column']

        values_filter: Optional['Series'] = None
        range_filter: Optional['Series'] = None
        date_filter: Optional['Series'] = None

        if var is None or var.strip() == '':
            continue

        column_type = infer_column_type(data, var)

        # Range filter
        if fil['range'] != '' and 'range' in ALLOWED_FILTERS[column_type]:
            range_filter = apply_range_filter(fil['range'], cast(Series, data[var]))

        # Values filter
        if fil['values'] != '' and 'values' in ALLOWED_FILTERS[column_type]:
            values_filter = apply_values_filter(fil['values'], cast(Series, data[var]), column_type)

        if (fil['from_date'] != '' or fil['to_date'] != '') and ('from_date' in ALLOWED_FILTERS[column_type]):
            date_filter = apply_date_filter(fil['from_date'], fil['to_date'], cast(Series, data[var]))

        # OR all of the defined filters together
        final_filter = None
        for filter_series in [values_filter, range_filter, date_filter]:
            if filter_series is not None:
                final_filter = final_filter | filter_series if final_filter is not None else filter_series

        # if any filters were defined
        if final_filter is not None:
            output = output[final_filter]

    return cast(DataFrame, output)


def get_filter_stats(input_data: DataFrame, output_data: DataFrame, filters: List[FilterInstance]) -> FilterStats:
    """
    Get filter statistics

    :param input_data: raw input data
    :param output_date: filtered data
    :param filters: list of filters applied
    """
    return FilterStats(
        max_rows=input_data.shape[0] if input_data is not None else 0,
        current_rows=output_data.shape[0] if output_data is not None else 0,
        active_filters=len(filters),
    )
