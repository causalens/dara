from pandas import DataFrame

from dara.components import Card, Heading, Spacer, Stack, Table, Text
from dara.core import DataVariable, DerivedVariable

# Mixed-case data to test case-insensitive table sorting
SORTING_TEST_DATA = DataFrame([
    {'name': 'Zebra', 'value': 1, 'created': '2024-01-15T00:00:00.000Z'},
    {'name': 'apple', 'value': 2, 'created': '2024-01-10T00:00:00.000Z'},
    {'name': 'Banana', 'value': 3, 'created': '2024-01-20T00:00:00.000Z'},
    {'name': 'cherry', 'value': 4, 'created': '2024-01-05T00:00:00.000Z'},
    {'name': 'aardvark', 'value': 5, 'created': '2024-01-25T00:00:00.000Z'},
])

sorting_test_derived_var = DerivedVariable(
    func=lambda: SORTING_TEST_DATA.copy(),
    variables=[],
)

SORTING_COLUMNS = [
    Table.column(col_id='name', label='Name', filter=Table.TableFilter.TEXT),
    Table.column(col_id='value', label='Value', filter=Table.TableFilter.NUMERIC),
    Table.column(
        col_id='created',
        label='Created',
        filter=Table.TableFilter.DATETIME,
        formatter={'type': Table.TableFormatterType.DATETIME, 'format': 'dd/MM/yyyy'},
    ),
]


def italic_text(text: str):
    return Text(
        text,
        font_size='22px',
        padding='0px',
        raw_css={'font-style': 'italic'},
    )


def intro_page():
    return Stack(
        Heading('Table Sorting Test (Case Insensitive)'),
        Text(
            'Sort by Name column: "aardvark" should come before "apple", '
            '"Banana" before "cherry", etc. regardless of case.'
        ),
        Spacer(height='1rem'),
        Card(
            Stack(
                Heading('straight DataFrame', level=2),
                Table(columns=SORTING_COLUMNS, data=SORTING_TEST_DATA.copy()),
            ),
            title='Straight DataVariable Table',
        ),
        Spacer(height='1rem'),
        Card(
            Stack(
                Heading('DerivedVariable', level=2),
                Table(columns=SORTING_COLUMNS, data=sorting_test_derived_var),
            ),
            title='DerivedVariable Table',
        ),
    )

