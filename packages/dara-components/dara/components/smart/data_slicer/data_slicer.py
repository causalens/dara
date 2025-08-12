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

from typing import List, Union

from pandas import DataFrame

from dara.components import (
    Button,
    Card,
    Heading,
    Label,
    Paragraph,
    Select,
    Stack,
    Tab,
    TabbedCard,
    Table,
    Text,
)
from dara.components.common.table import Column
from dara.components.smart.data_slicer.extension.data_slicer_filter import (
    DataSlicerFilter,
)
from dara.components.smart.data_slicer.utils.core import (
    apply_filters,
    get_column_definitions,
    get_column_items,
)
from dara.components.smart.data_slicer.utils.data_preview import (
    get_columns,
    get_describe_data,
    get_head_data,
    get_tail_data,
)
from dara.components.smart.data_slicer.utils.plotting import render_input_plot
from dara.core import DerivedVariable, Variable, py_component
from dara.core.actions import UpdateVariable
from dara.core.definitions import ComponentInstance, discover
from dara.core.interactivity import AnyVariable, ServerVariable

NO_RESULTS_FOUND = Stack(Text('No results found'))
TABLE_ROWS = 5


def increment(ctx: UpdateVariable.Ctx):  # type: ignore
    return ctx.inputs.old + 1


@discover
class DataSlicer:
    def __init__(self, data: Union[DataFrame, AnyVariable], rows_to_show: int = 10):
        """
        DataSlicer component allows the user to select a subset of a dataset by variable ranges or individual rows.
        Once instantiated, the `DerivedVariable` returned by `get_output()` will contain the filtered data.

        Displayed inline.

        :param data: input data
        :param rows_to_show: number of rows to show in the 'Head' and 'Tail' sections of filter preview
        """
        self.data_var = data if isinstance(data, AnyVariable) else ServerVariable(data)
        self.selected_column = Variable(None)
        self.rows_to_show = Variable(rows_to_show)

        self.column_definitions = DerivedVariable(get_column_definitions, variables=[self.data_var])
        self.column_items = DerivedVariable(get_column_items, variables=[self.column_definitions])
        self.table_columns = DerivedVariable(get_columns, variables=[self.column_definitions])

        self.current_variable_filters = Variable([])
        self.preview_output = DerivedVariable(apply_filters, variables=[self.current_variable_filters, self.data_var])

        # Table preview outputs
        self.describe_data = DerivedVariable(get_describe_data, variables=[self.preview_output])
        self.head_data = DerivedVariable(get_head_data, variables=[self.preview_output, self.rows_to_show])
        self.tail_data = DerivedVariable(get_tail_data, variables=[self.preview_output, self.rows_to_show])

        # This is a workaround for issues in DO-230
        self.manual_output_trigger = Variable(0)
        self.update_output_action = UpdateVariable(increment, variable=self.manual_output_trigger)
        self.final_filters = DerivedVariable(
            lambda x, _y: x,
            variables=[self.current_variable_filters, self.manual_output_trigger],
            deps=[self.manual_output_trigger],
        )
        self.final_output = DerivedVariable(
            lambda x, _y: x,
            variables=[self.preview_output, self.manual_output_trigger],
            deps=[self.manual_output_trigger],
        )

    def get_output(self) -> DerivedVariable:
        """
        Get the DerivedVariable containing filtered data
        """
        return self.final_output

    @py_component
    def describe_table(self, columns: List[Column]):
        """
        Display data.describe() as a Table
        """
        # For describe all columns are numbers
        cols = [col.copy(update={'type': 'numerical', 'formatter': None}) for col in columns]
        cols.insert(0, Column(col_id='index', label='Stat'))
        return Table(data=self.describe_data, columns=cols, max_rows=TABLE_ROWS)

    @py_component
    def table_head(self, columns: List[Column]):
        """
        Display data.head() as a Table
        """
        return Table(data=self.head_data, columns=columns, max_rows=TABLE_ROWS)

    @py_component
    def table_tail(self, columns: List[Column]):
        """
        Display data.tail() as a Table
        """
        return Table(data=self.tail_data, columns=columns, max_rows=TABLE_ROWS)

    @py_component
    def plot_column(self, data: DataFrame, selected_column: str):
        """
        Select and plot a column
        """
        if len(data.index) < 2:
            return Stack(Text('Plots are available for datasets with at least two rows'))

        return Stack(
            Label(
                Select(value=self.selected_column, items=self.column_items),
                value='Select column to plot',
                direction='horizontal',
                label_width='20%',
            ),
            render_input_plot(data, selected_column),
        )

    def variable_filter(self) -> ComponentInstance:
        """
        Filter section of the component
        """
        return Card(
            Stack(
                Paragraph(
                    Text('Range', italic=True, bold=True),
                    Text(
                        ' accepts a comma-separated list of ranges with ":" sign meaning (minus) infinity, e.g. "[-5.4, 6.5], [:, 100], [0, :]". ',
                        italic=True,
                    ),
                    Text('Values', italic=True, bold=True),
                    Text(' accepts a comma-separated list of values, e.g. "4,55.6,101"', italic=True),
                    height='15%',
                ),
                DataSlicerFilter(columns=self.column_definitions, filters=self.current_variable_filters),
                raw_css={'gap': '0px'},
            ),
        )

    def output_preview(self) -> ComponentInstance:
        """
        Preview section of the component
        """
        return TabbedCard(
            Tab(
                Stack(self.describe_table(self.table_columns)),
                title='Describe',
            ),
            Tab(Stack(self.table_head(self.table_columns)), title='Head'),
            Tab(Stack(self.table_tail(self.table_columns)), title='Tail'),
            Tab(Stack(self.plot_column(self.preview_output, self.selected_column)), title='Plot'),
            height='55%',
            raw_css={'flexGrow': '0'},
        )

    def content(self) -> ComponentInstance:
        """
        Component content - filters and preview
        """
        return Stack(self.variable_filter(), self.output_preview(), height='90%')

    def __call__(self) -> ComponentInstance:
        return Stack(
            Stack(
                Heading('Data Slicer'),
                Button('Apply Filter', onclick=self.update_output_action),
                justify='space-between',
                direction='horizontal',
            ),
            self.content(),
        )
