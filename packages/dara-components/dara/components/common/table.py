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

from enum import Enum
from typing import List, Literal, Optional, Sequence, Union

from pydantic import ConfigDict, Field, ValidationInfo, field_validator

from dara.components.common.base_component import ContentComponent
from dara.core.base_definitions import Action
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.interactivity import (
    AnyDataVariable,
    NonDataVariable,
    UrlVariable,
    Variable,
)


class TableFormatterType(Enum):
    ADAPTIVE_PRECISION = 'adaptive_precision'
    BADGE = 'badge'
    CODE = 'code'
    COMPARE = 'compare'
    DATETIME = 'datetime'
    FORMATTED_TEXT = 'formatted_text'
    NUMBER = 'number'
    NUMBER_INTL = 'number_intl'
    PERCENT = 'percent'
    LINK = 'link'
    THRESHOLD = 'threshold'


class TableFormatterCompareCondition(Enum):
    EQUAL = 'equal'


class TableFilter(Enum):
    TEXT = 'text'
    CATEGORICAL = 'categorical'
    NUMERIC = 'numeric'
    DATETIME = 'datetime'


class Column(BaseModel):
    """
    Internal representation of a Table column, required for serialization to work correctly

    A column at minimum can be created by defining a col_ids:

    ```python

    from dara.components.common import Table
    Table.column(
        col_id='col1',
    )

    ```

    A column with various formatting options like align can be created via:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        align='center',
    )

    ```

    A column which is set a width and can be made to stick to either the "left" or "right" of
    the table:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        width='250px',
        sticky='left',
    )

    ```

    A column with the an adaptive precision formatter that returns a string of the value with a
    pre-defined precision:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.ADAPTIVE_PRECISION,
        },
    )

    ```

    A column with a badge formatter that returns a cell with a badge corresponding to the badges
    defined:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.BADGE,
            'badges': {
                'val1': {'color': '#5f5f5f', 'label': 'Label 1'},
                'val2': {'color': '#3f6f2f', 'label': 'Label 2'}
            }
        },
    )

    ```

    A column with a code formatter that displays the cell contents as highlighted code:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.CODE,
            'language': 'Python',
        },
    ),

    ```

    A column with a compare formatter that returns a green colored cell text if the value pass the condition
    relative to the target, else returns a red colored cell text:

    ```python

    from dara.components.common import Table
    from dara.components.common.table.table import TableFormatterCompareCondition

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.COMPARE,
            'condition': TableFormatterCompareCondition.EQUAL,
            'target': 20,
        },
    ),

    ```

    A column with a formatted text formatter that returns the value in a pre tag to keep it's original styling:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.FORMATTED_TEXT,
        },
    ),

    ```

    A column with a number formatter that returns a string of the value at the given numerical precision:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.NUMBER,
            'precision': 1,
        },
    ),

    ```

    A column with advanced number formatter, passed arguments which will directly be passed into the [Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat)
    constructor. Example below formats numbers as dollars with 2 decimal places ('11.29' -> '$11.29')

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.NUMBER_INTL,
            'locales': 'en-US',
            'options': {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 2
            }
        },
    ),

    ```


    A column with a percent formatter that returns an adaptive precision value string with percentage sign
    attached:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.PERCENT,
            'precision': 1,
        },
    ),

    ```

    A column with a link formatter that pulls an associated href off the row and creates a link with
    the cell value as the text in the link, the link has to be defined in each row by assigning the link to href.
    **Please note** that the links must be in a column labeled `href` in your DataFrame.

    ```python

    from pandas import DataFrame
    from dara.components.common import Table
    from dara.core import DataVariable

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.LINK,
        },
    ),

    data = DataFrame([
        {
            'col1': 'Google',
            'col2': 'val1',
            'col3': 'val2',
            .
            .
            .
            'href': 'http://www.google.com',
        },
        .
        .
        .
    ])
    data_var = DataVariable(data)

    ```

    A column with a threshold formatter that returns a colored cell for numbers within the thresholds:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        formatter={
            'type': Table.TableFormatterType.THRESHOLD,
            'thresholds': [
                {
                    'color': '#6e3f8f,
                    'bounds': (0, 1),
                },
                {
                    'color': '#3e1f2f,
                    'bounds': (1, 10),
                },
                {
                    'color': '#5e7f4f,
                    'bounds': (10, 100),
                },
            ],
        },
    ),

    ```

    A column with a date formatter that shows the date in the given format, the format used follows that defined by [date-fns](https://date-fns.org/v2.29.3/docs/format)

    ```python
    from dara.components.common import Table

    Table.column(
            col_id='col1',
            label='Col 1',
            filter=Table.TableFilter.DATETIME,
            formatter={'type': Table.TableFormatterType.DATETIME, 'format': 'dd/MM/yyyy'},
    ),
    ```

    A filter can be applied to allow filtering a column of a given type:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        filter=Table.TableFilter.TEXT
    ),

    ```

    A column may have a tooltip to show when hovering over the column's header:

    ```python

    from dara.components.common import Table

    Table.column(
        col_id='col1',
        label='Col 1',
        tooltip='This is some tooltip explaining col1'
    ),

    ```

    :param align: The align setting for the column
    :param col_id: The id of the column
    :param label: The label of the column
    :param filter: Optional filter to enable for the column
    :param unique_items: If chosen filter is categorical, this must be provided as a list of unique strings which are used to define the categories for the filter
    :param formatter: Dictionary formatter for the column
    :param width: The width of the column
    :param align: The alignment of text in the column's cells
    :param sticky: Pinning the column to left or right
    :param tooltip: The tooltip to show when hovering over the column's header
    :param type: Optional prop to specify type of column, used to determine e.g. filter type. If not specified, inferred from formatters
    """

    align: Optional[str] = None
    col_id: str
    unique_items: Optional[List[str]] = None
    filter: Optional[TableFilter] = None
    formatter: Optional[dict] = None
    label: Optional[str] = Field(default=None, validate_default=True)  # mimics always=True in pydantic v1
    sticky: Optional[str] = None
    tooltip: Optional[str] = None
    width: Optional[Union[int, str]] = None
    type: Optional[Union[Literal['number'], Literal['string'], Literal['datetime']]] = None

    model_config = ConfigDict(use_enum_values=True)

    @field_validator('label')
    @classmethod
    def validate_label(cls, value, info: ValidationInfo):
        if value is None:
            return info.data.get('col_id')
        return value

    @field_validator('formatter')
    @classmethod
    def vaildate_formatter_dict(cls, formatter):
        """
        Validate that the formatter dict of a column is correct
        """
        if not isinstance(formatter, dict):
            raise ValueError(f'Invalid formatter dict: {formatter}, must be a dictionary')
        formatter_type = formatter.get('type')
        if formatter_type not in TableFormatterType:
            raise ValueError(
                f'Invalid formatter type: {formatter.get("type")}, accepted values {list(TableFormatterType)}'
            )
        if formatter_type in (TableFormatterType.NUMBER, TableFormatterType.PERCENT):
            precision = formatter.get('precision')
            if precision is not None and (not isinstance(precision, int) or precision <= 0):
                raise ValueError(f'Invalid precision value: {precision}, must be positive integer')
        elif formatter_type == TableFormatterType.NUMBER_INTL:
            locales = formatter.get('locales')
            if not isinstance(locales, str) or not (
                isinstance(locales, str) and all(isinstance(x, str) for x in locales)
            ):
                raise ValueError(f'Invalid locales value: {locales}, must be a string or list of strings')

            options = formatter.get('options')
            if not isinstance(options, dict):
                raise ValueError(f'Invalid options value: {options}, must be a dict')
        elif formatter_type == TableFormatterType.DATETIME:
            date_format = formatter.get('format')
            if date_format is not None and not isinstance(date_format, str):
                raise ValueError(f'Invalid date format: {date_format}, must be string')
        elif formatter_type == TableFormatterType.CODE:
            language = formatter.get('language')
            if not isinstance(language, str):
                raise ValueError(f'Invalid code language: {language}, must be a string')
        elif formatter_type == TableFormatterType.THRESHOLD:
            thresholds = formatter.get('thresholds')
            if not isinstance(thresholds, list):
                raise ValueError(f'Invalid thresholds: {thresholds}, must be passed as a list of thresholds')
            for threshold in thresholds:
                if not (
                    isinstance(threshold.get('color'), str)
                    and isinstance(threshold.get('bounds'), tuple)
                    and len(threshold.get('bounds')) == 2
                ):
                    raise ValueError(
                        f'Invalid threshold: {threshold}, must contain a color and tuple of length 2 defining the bounds'
                    )
                lower_bound = threshold.get('bounds')[0]
                upper_bound = threshold.get('bounds')[1]
                if not (isinstance(lower_bound, (int, float))):
                    raise ValueError(f'Invalid bound type: {lower_bound}, must be int or float')
                if not (isinstance(upper_bound, (int, float))):
                    raise ValueError(f'Invalid bound type: {upper_bound}, must be int or float')
        elif formatter_type == TableFormatterType.BADGE:
            badges = formatter.get('badges')
            if not isinstance(badges, dict):
                raise ValueError(f'Invalid badges: {badges}, must be passed as a dictionary of badges')
            for badge in badges:
                if (
                    not isinstance(badges[badge], dict)
                    or badges[badge].get('color') is None
                    or badges[badge].get('label') is None
                ):
                    raise ValueError(
                        f'Invalid badge: {badge}: {badges[badge]}, must be a dictionary containing color and label'
                    )
                if not isinstance(badges[badge].get('color'), str):
                    raise ValueError(
                        f'Invalid color: {badges[badge].get("color")} for badge: {badges[badge]}, must be a string'
                    )
        return formatter

    @field_validator('sticky')
    @classmethod
    def validate_sticky(cls, sticky):
        """
        Validate that the sticky string has the correct values
        """
        if sticky not in ('left', 'right', None):
            raise ValueError(f'Invalid sticky value: {sticky}, accepted values: left, right')
        return sticky

    @field_validator('filter')
    @classmethod
    def validate_unique_items(cls, filter, info: ValidationInfo):
        """
        Validate that for categorical filters unique_items is provided
        """
        if filter == 'categorical':
            unique_items = info.data.get('unique_items')
            col_id = info.data.get('col_id')
            if unique_items is None:
                raise ValueError(
                    f'Invalid unique_items: {col_id} has categorical filter, it must have unique_items defined'
                )
        return filter


class Table(ContentComponent):
    """
    ![Table](../../../../docs/packages/dara-components/common/assets/Table.png)

    A Table Component for drawing a simple table into a document. Table's can be created by passing data
    as a DataVariable or a DerivedDataVariable. Columns can be passed as lists of dicts, where the col_id
    of the cols must match the column name in the dataframe. Alternatively they can be Variables/DerivedVariables,
    and if left undefined it will be inferred from the data passed.

    The list of columns can be a mix of dicts and strings. If a string is passed then it will be used as
    the col_id and label for the column whereas, passing a dict allows more control over the options. The
    available options for columns are as follows (see Column class for more detail):
    * col_id - the id of the column (required)
    * label - the label to show at the top of the column
    * filter - an instance of a filter class (e.g. Table.TableFilter.DATETIME)
    * unique_items - a list of unique items that categorical filter can filter from
    * formatter - an instance of a formatter class (e.g. Table.Formatter.NUMBER)
    * width - the width of the column as a number of pixels or a percentage string
    * align - The alignment of text in the columns cells

    A simple table component constructed with columns passed as a list of strings and data passed as list of dicts:

    ```python

    from pandas import DataFrame
    from dara.components.common import Table
    from dara.core import DataVariable

    data = DataVariable(
        DataFrame([
            {
                'col1': 1,
                'col2': 2,
            },
            {
                'col1': 3,
                'col2': 4,
            },
        ])
    )

    Table(
        columns=['col1', 'col2'],
        data=data
    )

    ```

    A table component using a list of dict for columns with column width, it takes all the options that
    the Column class takes:

    ```

    from pandas import DataFrame
    from dara.components.common import Table
    from dara.core import DataVariable

    data = DataVariable(
        DataFrame([
            {
                'col1': 1,
                'col2': 2,
            },
            {
                'col1': 3,
                'col2': 4,
            },
        ])
    )

    columns=[
        {
            'col_id': 'col1',
            'label': 'Col 1',
            'width': '200px',
        },
        {
            'col_id': 'col2',
            'label': 'Col 2',
            'width': '250px',
        },
    ]

    Table(
        columns=columns,
        data=data
    )

    ```

    A table component that has clickable rows and multiple rows can be selected:

    ```

    from pandas import DataFrame
    from dara.components.common import Table
    from dara.core import DataVariable, Variable

    data = DataVariable(
        DataFrame([
            {
                'col1': 1,
                'col2': 2,
            },
            {
                'col1': 3,
                'col2': 4,
            },
        ])
    )

    selected_rows = Variable([])

    Table(
        columns=['col1', 'col2'],
        data=data,
        selected_indices=selected_rows,
        multi_select=True
    )

    ```

    A table component that is searchable:

    The columns may have filters set, this is done on a column by column basis with the `Table.column`'s `filter` param.
    You can also set which columns are searchable with the `Table`'s `search_columns` param, only columns present here are searchable.
    A column may both be searchable and have a filter.

    ```python

    from pandas import DataFrame
    from dara.components.common import Table
    from dara.core import DataVariable

    data = DataVariable(
        DataFrame([
            {
                'col1': 1,
                'col2': 'a',
                'col3': 'cat'
            },
            {
                'col1': 3,
                'col2': 'b',
                'col3': 'dog'
            },
        ])
    )

    Table(
        columns=['col1', 'col2', 'col3'],
        data=data,
        searchable=True,
        search_columns=['col3'],
    )

    ```


    A table component rendered from a panda dataframe including the index column:

    ```python

    import pandas
    from dara.components.common import Table
    from dara.core import DataVariable

    data = [{
        'age': 27,
        'name': 'Sam',
        'surname': 'Smith'
    }, {
        'age': 29,
        'name': 'Tim',
        'surname': 'Smith'
    }]
    df = pandas.DataFrame(data, columns=['age', 'name', 'surname'])
    df.reset_index()
    Table(data=DataVariable(df), columns=[{'col_id': 'age', 'label': 'Age'}, 'index'])

    ```

    A table component containing all four available filters:

    ```python
    from pandas import DataFrame
    from dara.components.common import Table
    from dara.core import DataVariable

    data = DataVariable(
        DataFrame(
            [
                {
                    'col1': 'a',
                    'col2': 1,
                    'col3': 'F',
                    'col4': '1990-02-12T00:00:00.000Z',
                },
                {
                    'col1': 'b',
                    'col2': 2,
                    'col3': 'M',
                    'col4': '1991-02-12T00:00:00.000Z',
                },
            ]
        )
    )

    columns = [
        Table.column(col_id='col1', label='Col 1', filter=Table.TableFilter.TEXT),
        Table.column(col_id='col2', label='Col 2', filter=Table.TableFilter.NUMERIC),
        Table.column(col_id='col3', label='Col 3', filter=Table.TableFilter.CATEGORICAL, unique_items=['M', 'F']),
        Table.column(
            col_id='col4',
            label='Col 4',
            filter=Table.TableFilter.DATETIME,
            formatter={'type': Table.TableFormatterType.DATETIME, 'format': 'dd/MM/yyyy'},
        ),
    ]

    Table(
        columns=columns, data=data
    )
    ```

    :param columns: The table's columns, this can be a list, a Variable/DerivedVariable or if left undefined it will be inferred from the data
    :param data: The table's data, must be a DataVariable or DerivedDataVariable
    :param multi_select: Whether to allow selection of multiple rows, works with onclick_row and defaults to False
    :param show_checkboxes: Whether to show or hide checkboxes column when onclick_row is set. Defaults to True
    :param onclick_row: An action handler for when a row is clicked on the table
    :param selected_indices: Optional variable to store the selected rows indices, must be a list of numbers. Note that these indices are
    the sequential indices of the rows as accepted by `DataFrame.iloc`, not the `row.index` value. If you would like the selection to persist over
    page reloads, you must set `persist_value=True` on the variable.
    :param search_columns: Optional list defining the columns to be searched, only the columns passed are searchable
    :param searchable: Boolean, if True table can be searched via Input and will only render matching rows
    :param include_index: Boolean, if True the table will render the index column(s), defaults to True
    :param max_rows: if specified, table height will be fixed to accommodate the specified number of rows
    """

    model_config = ConfigDict(ser_json_timedelta='float', use_enum_values=True)

    columns: Optional[Union[Sequence[Union[Column, dict, str]], NonDataVariable]] = None
    data: AnyDataVariable
    multi_select: bool = False
    show_checkboxes: bool = True
    onclick_row: Optional[Action] = None
    selected_indices: Optional[Union[List[int], UrlVariable, Variable]] = None
    search_columns: Optional[List[str]] = None
    searchable: bool = False
    include_index: bool = True
    max_rows: Optional[int] = None

    TableFormatterType = TableFormatterType
    TableFilter = TableFilter

    @field_validator('columns')
    @classmethod
    def validate_columns(cls, columns):
        if columns is None:
            return None
        if isinstance(columns, List):
            cols = []
            for col in columns:
                if isinstance(col, Column):
                    cols.append(col)
                elif isinstance(col, str):
                    cols.append(Column(col_id=col))
                else:
                    cols.append(Column(**col))
            return cols
        elif isinstance(columns, NonDataVariable):
            return columns
        else:
            raise ValueError(f'Invalid list passed to Table columns: {columns}, expected a list')

    def add_column(self, col: Union[str, dict, Column]):
        """Adds a new column to the data"""
        if not isinstance(self.columns, List):
            raise ValueError('You cannot add_columns to a Variable type columns or if they are undefined')
        if isinstance(col, str):
            self.columns.append(Column(col_id=col))
        elif isinstance(col, dict):
            self.columns.append(Column(**col))
        elif isinstance(col, Column):
            self.columns.append(col)
        else:
            raise ValueError(f'Invalid column passed to add_column: {col}')

    @staticmethod
    def column(*args, **kwargs) -> Column:
        """
        Helper function to create a column via the class rather than the dict
        """
        return Column(*args, **kwargs)
