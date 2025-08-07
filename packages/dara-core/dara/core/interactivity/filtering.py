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

from __future__ import annotations

import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any, List, Optional, Tuple, Union, cast, overload

import numpy
from pandas import DataFrame, Series
from pydantic import field_validator  # noqa: F401

from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.logging import dev_logger

COLUMN_PREFIX_REGEX = re.compile(r'__(?:col|index)__\d+__')


def clean_column_name(col: str) -> str:
    """
    Cleans a column name by removing the index or col prefix
    """
    return re.sub(COLUMN_PREFIX_REGEX, '', col)


class Pagination(BaseModel):
    """
    Model representing pagination to be applied to a dataset.

    Retrieves results [offset:offset+limit]
    If index is defined, retrieves only the row of the specified index
    """

    offset: Optional[int] = None
    limit: Optional[int] = None
    orderBy: Optional[str] = None
    index: Optional[str] = None

    @field_validator('orderBy', mode='before')
    @classmethod
    def clean_order_by(cls, order_by):
        if order_by is None:
            return None
        return clean_column_name(order_by)


class QueryCombinator(str, Enum):
    AND = 'AND'
    OR = 'OR'


class QueryOperator(str, Enum):
    EQ = 'EQ'
    CONTAINS = 'CONTAINS'
    GT = 'GT'
    LT = 'LT'
    BT = 'BT'
    NE = 'NE'


# TODO: these can possibly be extended to overload some operators for nicer DX


class ClauseQuery(BaseModel):
    """
    Represents a clause in a query, i.e. query1 AND query2.
    """

    combinator: QueryCombinator
    clauses: List[FilterQuery]


class ValueQuery(BaseModel):
    """
    Represents a singular filter to be applied to a dataset column.
    """

    column: str
    operator: QueryOperator = QueryOperator.EQ
    value: Any


FilterQuery = Union[ClauseQuery, ValueQuery]
"""
Filter query to be applied
"""

ClauseQuery.model_rebuild()


def coerce_to_filter_query(filters: Union[ClauseQuery, ValueQuery, dict, None]) -> Optional[FilterQuery]:
    """
    Coerce a filter query to a FilterQuery object. Converts dict representation to the correct query type.
    """
    if isinstance(filters, dict):
        if 'combinator' in filters:
            return ClauseQuery(**filters)
        elif 'column' in filters:
            return ValueQuery(**filters)
        else:
            raise ValueError(f'Unknown filter query {filters}')

    return filters


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


class ColumnType(Enum):
    CATEGORICAL = 'categorical'
    DATETIME = 'datetime'
    NUMERICAL = 'numerical'


def infer_column_type(series: Series) -> ColumnType:
    """
    Get ColumnType for a given column of a dataframe.

    Returns None for datetime columns if treat_datetime_as_numerical is True.
    Otherwise treats datatime as numerical.

    :param series: series to infer
    """
    series_values = series.values

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


def _filter_to_series(data: DataFrame, column: str, operator: QueryOperator, value: Any) -> Optional[Series]:
    """
    Convert a single filter to a Series[bool] for filtering
    """
    series = cast(Series, data[column])

    # Contains is a special case, we always treat the column as a string
    if operator == QueryOperator.CONTAINS:
        return series.astype(str).str.contains(str(value), case=False, regex=False)

    col_type = infer_column_type(series)

    try:
        # In the case of categorical filter we get a List for value
        if isinstance(value, List):
            return series.isin(value)
        # Converts date passed from frontend to the right format to compare with pandas
        if col_type == ColumnType.DATETIME:
            value = [parseISO(value[0]), parseISO(value[1])] if isinstance(value, List) else parseISO(value)
        elif col_type == ColumnType.CATEGORICAL:
            value = str(value)
        elif isinstance(value, List):
            lower_bound = float(value[0]) if '.' in str(value[0]) else int(value[0])
            upper_bound = float(value[1]) if '.' in str(value[1]) else int(value[1])
            value = [lower_bound, upper_bound]
        else:
            value = float(value) if '.' in str(value) else int(value)

        if operator == QueryOperator.GT:
            return series > value

        if operator == QueryOperator.LT:
            return series < value

        if operator == QueryOperator.NE:
            return series != value

        if operator == QueryOperator.BT:
            return series.between(value[0], value[1])

        return series == value
    except Exception as e:
        # If any error occurred either when converting types or doing the comparison just don't filter at all
        dev_logger.debug('Filter Error', extra={'err': e, 'column': str, 'value': value, 'operator': operator})
        return None


def _resolve_filter_query(data: DataFrame, query: FilterQuery) -> Optional[Series]:
    """
    Resolve a FilterQuery to a Series[bool] for filtering. Strips the internal column index from the query.
    """
    if isinstance(query, ValueQuery):
        return _filter_to_series(
            data, re.sub(COLUMN_PREFIX_REGEX, repl='', string=query.column, count=1), query.operator, query.value
        )
    elif isinstance(query, ClauseQuery):
        filters = None

        for clause in query.clauses:
            resolved_clause = _resolve_filter_query(data, clause)

            if resolved_clause is not None:
                if query.combinator == QueryCombinator.AND:
                    filters = resolved_clause if filters is None else filters & resolved_clause
                elif query.combinator == QueryCombinator.OR:
                    filters = resolved_clause if filters is None else filters | resolved_clause
                else:
                    raise ValueError(f'Unknown combinator {query.combinator}')

        return filters
    else:
        raise ValueError(f'Unknown query type {type(query)}')


@overload
def apply_filters(
    data: DataFrame, filters: Optional[FilterQuery] = None, pagination: Optional[Pagination] = None
) -> Tuple[DataFrame, int]: ...


@overload
def apply_filters(
    data: None, filters: Optional[FilterQuery] = None, pagination: Optional[Pagination] = None
) -> Tuple[None, int]: ...


def apply_filters(
    data: Optional[DataFrame], filters: Optional[FilterQuery] = None, pagination: Optional[Pagination] = None
) -> Tuple[Optional[DataFrame], int]:
    """
    Apply filtering and pagination to a DataFrame.
    """
    if data is None:
        return None, 0

    new_data = data

    # FILTER
    if filters is not None:
        resolved_query = _resolve_filter_query(data, filters)
        if resolved_query is not None:
            new_data = new_data[resolved_query]

    # Count before paginating
    total_count = len(new_data.index)

    if pagination is not None:
        # ON FETCHING SPECIFIC ROW
        if pagination.index is not None:
            return cast(DataFrame, data[int(pagination.index) : int(pagination.index) + 1]), total_count

        # SORT
        if pagination.orderBy is not None:
            order_by = pagination.orderBy
            ascending = True

            # Minus indicates its descending order
            if order_by.startswith('-'):
                order_by = order_by[1:]
                ascending = False

            col = re.sub(COLUMN_PREFIX_REGEX, '', order_by)
            if col == 'index':
                new_data = new_data.sort_index(ascending=ascending, inplace=False)
            else:
                new_data = new_data.sort_values(by=col, ascending=ascending, inplace=False)  # type: ignore

        # PAGINATE
        start_index = pagination.offset if pagination.offset is not None else 0
        stop_index = start_index + pagination.limit if pagination.limit is not None else total_count

        new_data = new_data.iloc[start_index:stop_index]

    return cast(DataFrame, new_data), total_count
