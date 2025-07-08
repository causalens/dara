import pytest
from pandas import DataFrame, date_range

from dara.core.interactivity.filtering import (
    ClauseQuery,
    Pagination,
    QueryCombinator,
    QueryOperator,
    ValueQuery,
    apply_filters,
)

TEST_DATA = DataFrame(
    {
        # Numbers
        'col1': [1, 2, 3, 4, 1],
        'col2': [6, 7, 8, 6, 10],
        # categorical - letters
        'col3': ['a', 'b', 'a', 'd', 'e'],
        'col4': ['f', 'f', 'h', 'i', 'j'],
        # categorical - numbers
        'col5': ['1', '2', '3', '4', '5'],
        # datetime
        'col6': date_range('2020-01-01', periods=5, freq='2M'),
        # Numbers - negative + fractions
        'col7': [-5.5, -5, -4.5, 0.5, 1],
        # Categorical - words
        'col8': ['cat', 'rat', 'dog', 'flower', 'bird'],
    }
)
"""
```
   col1  col2 col3 col4 col5       col6  col7    col8
0     1     6    a    f    1 2020-01-31  -5.5     cat
1     2     7    b    f    2 2020-03-31  -5.0     rat
2     3     8    a    h    3 2020-05-31  -4.5     dog
3     4     6    d    i    4 2020-07-31   0.5  flower
4     1    10    e    j    5 2020-09-30   1.0    bird
```
"""


@pytest.mark.parametrize(
    'test_input,expected',
    [
        ((None, None), TEST_DATA.index.tolist()),
        ((0, None), TEST_DATA.index.tolist()),
        ((None, 0), []),
        ((None, 3), [0, 1, 2]),
        ((None, 999), TEST_DATA.index.tolist()),
        ((3, None), [3, 4]),
        ((1, 2), [1, 2]),
    ],
)
def test_pagination(test_input, expected):
    offset, limit = test_input

    paginated, count = apply_filters(data=TEST_DATA, pagination=Pagination(offset=offset, limit=limit))
    assert paginated is not None
    assert paginated.index.tolist() == expected
    assert count == len(TEST_DATA)  # count pre-pagination


@pytest.mark.parametrize(
    'test_input,expected',
    [
        ((None, None, None), TEST_DATA.index.tolist()),
        ((None, None, 'col1'), TEST_DATA.sort_values('col1').index.tolist()),
        ((None, None, '-col1'), TEST_DATA.sort_values('col1', ascending=False).index.tolist()),
        ((0, 3, 'col2'), TEST_DATA.sort_values('col2').head(3).index.tolist()),
        ((1, 2, '-col2'), TEST_DATA.sort_values('col2', ascending=False).iloc[1:3].index.tolist()),
        ((None, 5, 'col3'), TEST_DATA.sort_values('col3').head(5).index.tolist()),
        ((2, None, '-col3'), TEST_DATA.sort_values('col3', ascending=False).iloc[2:].index.tolist()),
        # Internal column names should resolve to raw column names
        ((None, None, '__col__1__col1'), TEST_DATA.sort_values('col1').index.tolist()),
        ((None, None, '__index__1__col1'), TEST_DATA.sort_values('col1').index.tolist()),
        ((1, 2, '-__col__2__col2'), TEST_DATA.sort_values('col2', ascending=False).iloc[1:3].index.tolist()),
        ((None, 5, '__index__3__col3'), TEST_DATA.sort_values('col3').head(5).index.tolist()),
    ],
)
def test_pagination_with_order_by(test_input, expected):
    offset, limit, order_by = test_input

    paginated, count = apply_filters(
        data=TEST_DATA, pagination=Pagination(offset=offset, limit=limit, orderBy=order_by)
    )

    assert paginated is not None
    assert paginated.index.tolist() == expected
    assert count == len(TEST_DATA)  # count pre-pagination


@pytest.mark.parametrize(
    'test_input,expected',
    [
        # Number col, number value
        (('col1', 1), [0, 4]),
        # Number col, string value -> infer number
        (('col1', '4'), [3]),
        # Categorical col, number value -> infer string
        (('col5', 4), [3]),
        # Categorical col, string value
        (('col3', 'a'), [0, 2]),
        # Datetime column
        (('col6', '2020-01-31Z'), [0]),
        # Negative and fraction, number
        (('col7', -4.5), [2]),
        # Negative and fraction, string
        (('col7', '-4.5'), [2]),
        # Internal column names should resolve to raw column names
        # Number col, number value, __col__
        (('__col__1__col1', 1), [0, 4]),
        # Number col, number value, __index__
        (('__index__1__col1', 1), [0, 4]),
        # Negative and fraction, string, __col__
        (('__col__7__col7', '-4.5'), [2]),
        # Negative and fraction, string, __index__
        (('__index__7__col7', '-4.5'), [2]),
    ],
)
def test_value_equals_filter(test_input, expected):
    column, value = test_input

    filtered, count = apply_filters(data=TEST_DATA, filters=ValueQuery(column=column, value=value))
    assert filtered is not None
    assert filtered.index.tolist() == expected
    assert count == len(expected)


@pytest.mark.parametrize(
    'test_input,expected',
    [
        # Number col, number value
        (('col1', 1), [1, 2, 3]),
        # Number col, string value -> infer number
        (('col1', '2'), [2, 3]),
        # # Categorical col, string value -> letters that come after 'a'
        (('col3', 'a'), [1, 3, 4]),
        # Categorical col, number value -> infer string
        (('col5', 4), [4]),
        # # Datetime column
        (('col6', '2020-04-10Z'), [2, 3, 4]),
        # Negative and fraction, number
        (('col7', -4.75), [2, 3, 4]),
        # Negative and fraction, string
        (('col7', '0.25'), [3, 4]),
    ],
)
def test_value_gt_filter(test_input, expected):
    column, value = test_input

    filtered, count = apply_filters(
        data=TEST_DATA, filters=ValueQuery(column=column, value=value, operator=QueryOperator.GT)
    )
    assert filtered is not None
    assert filtered.index.tolist() == expected
    assert count == len(expected)


@pytest.mark.parametrize(
    'test_input,expected',
    [
        # Number col, number value
        (('col1', 3), [0, 1, 4]),
        # Number col, string value -> infer number
        (('col1', '2'), [0, 4]),
        # # Categorical col, string value -> letters that come after 'a'
        (('col3', 'c'), [0, 1, 2]),
        # Categorical col, number value -> infer string
        (('col5', 4), [0, 1, 2]),
        # # Datetime column
        (('col6', '2020-04-10'), [0, 1]),
        # Negative and fraction, number
        (('col7', -4.75), [0, 1]),
        # Negative and fraction, string
        (('col7', '0.25'), [0, 1, 2]),
    ],
)
def test_value_lt_filter(test_input, expected):
    column, value = test_input

    filtered, count = apply_filters(
        data=TEST_DATA, filters=ValueQuery(column=column, value=value, operator=QueryOperator.LT)
    )
    assert filtered is not None
    assert filtered.index.tolist() == expected
    assert count == len(expected)


@pytest.mark.parametrize(
    'test_input,expected',
    [
        # Values containing digit 5 -> string is inferred
        (('col7', 5), [0, 1, 2, 3]),
        # Dates containing '31' -> string is inferred
        (('col6', 31), [0, 1, 2, 3]),
        # Dates containing '31'
        (('col6', '31'), [0, 1, 2, 3]),
        # words containing 'at'
        (('col8', 'at'), [0, 1]),
    ],
)
def test_contains_filter(test_input, expected):
    column, value = test_input

    filtered, count = apply_filters(
        data=TEST_DATA, filters=ValueQuery(column=column, value=value, operator=QueryOperator.CONTAINS)
    )
    assert filtered is not None
    assert filtered.index.tolist() == expected
    assert count == len(expected)


@pytest.mark.parametrize(
    'test_input,expected',
    [
        ((('col1', 1), ('col2', 6)), [0]),
        ((('col1', 1), ('col2', 7)), []),
        ((('col1', 1), ('col2', 10)), [4]),
        ((('col1', 1), ('col3', 'a')), [0]),
        ((('col1', 1), ('col3', 'b')), []),
        ((('col1', 1), ('col3', 'e')), [4]),
    ],
)
def test_simple_and_clause_query(test_input, expected):
    clause1, clause2 = test_input

    filtered, count = apply_filters(
        data=TEST_DATA,
        filters=ClauseQuery(
            combinator=QueryCombinator.AND,
            clauses=[
                ValueQuery(column=clause1[0], value=clause1[1]),
                ValueQuery(column=clause2[0], value=clause2[1]),
            ],
        ),
    )
    assert filtered is not None
    assert filtered.index.tolist() == expected
    assert count == len(expected)


@pytest.mark.parametrize(
    'test_input,expected',
    [
        ((('col1', 1), ('col2', 6)), [0, 3, 4]),
        ((('col1', 1), ('col3', 'a')), [0, 2, 4]),
        ((('col2', 6), ('col3', 'a')), [0, 2, 3]),
        ((('col2', 7), ('col3', 'd')), [1, 3]),
    ],
)
def test_simple_or_clause_query(test_input, expected):
    clause1, clause2 = test_input

    filtered, count = apply_filters(
        data=TEST_DATA,
        filters=ClauseQuery(
            combinator=QueryCombinator.OR,
            clauses=[
                ValueQuery(column=clause1[0], value=clause1[1]),
                ValueQuery(column=clause2[0], value=clause2[1]),
            ],
        ),
    )
    assert filtered is not None
    assert filtered.index.tolist() == expected
    assert count == len(expected)


@pytest.mark.parametrize(
    'query,expected',
    [
        (
            # col1 == 1 AND (col2 == 6 OR col3 == 'a')
            ClauseQuery(
                combinator=QueryCombinator.AND,
                clauses=[
                    ValueQuery(column='col1', value=1),
                    ClauseQuery(
                        combinator=QueryCombinator.OR,
                        clauses=[
                            ValueQuery(column='col2', value=6),
                            ValueQuery(column='col3', value='a'),
                        ],
                    ),
                ],
            ),
            [0],
        ),
        (
            # (col1 == 1 AND col4 == 'f') OR (col2 == 6 AND col3 == 'd')
            ClauseQuery(
                combinator=QueryCombinator.OR,
                clauses=[
                    ClauseQuery(
                        combinator=QueryCombinator.AND,
                        clauses=[
                            ValueQuery(column='col1', value=1),
                            ValueQuery(column='col4', value='f'),
                        ],
                    ),
                    ClauseQuery(
                        combinator=QueryCombinator.AND,
                        clauses=[
                            ValueQuery(column='col2', value=6),
                            ValueQuery(column='col3', value='d'),
                        ],
                    ),
                ],
            ),
            [0, 3],
        ),
    ],
)
def test_nested_clause_query(query, expected):
    filtered, count = apply_filters(data=TEST_DATA, filters=query)
    assert filtered is not None
    assert filtered.index.tolist() == expected
    assert count == len(expected)
