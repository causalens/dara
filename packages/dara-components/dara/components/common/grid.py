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

from typing import ClassVar, Optional, Union

from dara.components.common.base_component import LayoutComponent
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.definitions import ComponentInstance, discover
from dara.core.visual.components.types import Direction


class ScreenBreakpoints(BaseModel):
    xs: Optional[int] = None
    sm: Optional[int] = None
    md: Optional[int] = None
    lg: Optional[int] = None
    xl: Optional[int] = None


class Column(LayoutComponent):
    """
    Column can contains any components similar to Stack. You may align their content as well as defining how many columns it occupies by defining span.
    Grid works in a 12 columns per row system. So if you have a column that spans 8 and the next spans 4 they will be added side by side, occupying 67% and 33% of the Grid width respectively.
    Also note that, given this system, span + offset values should add to no more than 12, doing so may result in unwanted behavior.

    #### Example of simplest Column with alignment:
    ```python
        Grid.Column(Text('Example'), justify='center', align_items='center')
    ```

    #### Example of a Column with fixed span and offset:
    ```python
        Grid.Column(Text('Example'), span=3, offset=4)
    ```

    #### Example of a Column with span which differs depending on breakpoints:
    ```python
        Grid.Column(Text('Example'), span=Grid.Breakpoints(xs=12, sm=6, md=4, lg=3))
    ```

    #### Example of a Column with offset which differs depending on breakpoints:
    ```python
        Grid.Column(Text('Example'), offset=Grid.Breakpoints(xs=6, md=4, lg=3), span=6)
    ```

    :param span: the number of columns this column should span, it can take an `integer` if unchanged across different screen sizes or take `Grid.Breakpoints` which allows you to define the span across five responsive tiers
    :param justify: How to justify the content of the column, accepts any flexbox justifications
    :param align: How to align the content of the column, accepts any flexbox alignments
    :param offset: offset column by x number of columns, it can take an `integer` if unchanged across different screen sizes or take `Grid.Breakpoints`. Note that offset + span should add to no more than 12. Values greater that add up to more than 12 can result in unwanted behaviour.
    :param direction: The direction to Column children, can be 'vertical' or 'horizontal', default is 'horizontal'
    :param hug: Whether to hug the content, defaults to False
    """

    # TODO: :param order: optional number denoting the order of priority of the columns, with 1 being first to appear, and 12 the last to be added.

    span: Optional[Union[int, ScreenBreakpoints]] = None
    offset: Optional[Union[int, ScreenBreakpoints]] = None
    direction: Direction = Direction.HORIZONTAL

    def __init__(self, *args: Union[ComponentInstance, None], **kwargs):
        super().__init__(*args, **kwargs)


class Row(LayoutComponent):
    """
    Rows will automatically calculate and wrap columns within it by a 12 column system.

    - If columns have an undefined span it will try to fit them equally in a row occupying all space available.
    - If columns have a defined span it will respect it and fit wrap other columns into rows such that all rows occupy a maximum of 12 columns.
    - It will keep the order of the columns in the row in the order they are defined.

    #### Example of Row with `column_gap`:

    ```python
        Grid.Row(
            Grid.Column(Text('Cell 0')),
            Grid.Column(Text('Cell 1')),
            column_gap=2
        )
    ```

    :param column_gap: a number containing the desired percentage gap between columns for that row, e.g. 2 would be a 2% gap between columns
    :param hug: Whether to hug the content, defaults to False
    :param justify: How to justify the content of the row, accepts any flexbox justifications
    :param align: How to align the content of the row, accepts any flexbox alignments
    """

    column_gap: Optional[int] = None

    def __init__(self, *args: Union[ComponentInstance, None], **kwargs):
        super().__init__(*args, **kwargs)


ColumnType = type[Column]
RowType = type[Row]


@discover
class Grid(LayoutComponent):
    """
    ![Grid](../../../../docs/packages/dara-components/common/assets/Grid.png)

    Grid Layout provides a flexbox grid with a twelve column system.
    Rows will automatically calculate their widths and wrap on the page as needed.
    It also allows for responsive desiness by defining column span breakpoints.
    """

    row_gap: str = '0.75rem'
    breakpoints: Optional[ScreenBreakpoints] = ScreenBreakpoints()

    Column: ClassVar[ColumnType] = Column
    Row: ClassVar[RowType] = Row
    Breakpoints: ClassVar[type[ScreenBreakpoints]] = ScreenBreakpoints

    # Dummy init that just passes through arguments to superclass, fixes Pylance complaining about types
    def __init__(self, *args: Union[ComponentInstance, None], **kwargs):
        """
        Grid Layout provides a flexbox grid with a twelve column system.
        Rows will automatically calculate their widths and wrap on the page as needed.
        It also allows for responsive desiness by defining column span breakpoints.

        #### Example of a simple Grid component:

        ```python

        from dara.components.common import Grid, Text

        Grid(
            Grid.Row(
                Grid.Column(Text('Cell 0')),
                Grid.Column(Text('Cell 1')),
            ),
            Grid.Row(
                Grid.Column(Text('Cell 2')),
            ),
        )

        ```

        #### Example of a Grid with fixed span and undefined span columns:
        Note how you can let the `Row` wrap itself into different rows with undefined `span` columns filling all available space:

        ```python

        from dara.components.common import Grid, Text

        Grid(
            Grid.Row(
                Grid.Column(Text('Span = 2'), span=2, background='orange'),
                Grid.Column(Text('Undefined'), background='cornflowerblue'),
                Grid.Column(Text('Span = 6'), span=6, background='coral'),
                Grid.Column(Text('Span = 5'), span=5, background='crimson'),
                Grid.Column(Text('Undefined'), background='darkmagenta'),
                Grid.Column(Text('Undefined'), background='gold'),
                Grid.Column(Text('Span = 6'), span=12, background='lightseagreen'),
            ),
        )

        ```

        #### Example of a Responsive Grid:
        Here we define how much each column spans foe each screen size type. For `xs` screens each column spans the whole 12 columns available.
        For larger and larger screens we allow these to come side by side. For `sm` you have two columns per row, `md` three columns and finally `lg` or bigger screens you can have all four columns side by side.
        Here we also show `column_gap` which is a `Row` property allowing you to define some spacing between columns, and `row_gap` a `Grid` property to define spacing between rows.

        ```python

        from dara.components.common import Grid, Text

        span_layout = Grid.Breakpoints(xs=12, sm=6, md=4, lg=3)

        Grid(
            Grid.Row(
                Grid.Column(Text('Red'), span=span_layout, background='red'),
                Grid.Column(Text('Green'), span=span_layout, background='green'),
                Grid.Column(Text('Blue'), span=span_layout, background='blue'),
                Grid.Column(Text('Yellow'), span=span_layout, background='yellow'),
                column_gap=2,
            ),
            row_gap='10px',
        )

        ```

        #### Example of a Custom Breakpoints:
        You can also custom define where one or all of the breakpoints happen, This uses the same `Grid.Breakpoints` helper, but now instead of defining the span of each column we define in pixels each breakpoint.

        ```python

        from dara.components.common import Grid, Text

        custom_breakpoints = Grid.Breakpoints(xs=0, sm=500, md=600, lg=700, xl=800)

        Grid(
            Grid.Row(
                Grid.Column(Text('Red'), span= Grid.Breakpoints(xs=12, sm=6, md=4, lg=3), background='red'),
                Grid.Column(Text('Blue'), span= 4, background='blue'),
            ),
            breakpoints=custom_breakpoints,
        )

        ```

        #### Example of a Grid component which only occupies as much space as it needs with the hug property:

        ```python

        from dara.components.common import Grid, Text

        Grid(
            Grid.Row(
                Grid.Column(Text('Cell 0')),
                Grid.Column(Text('Cell 1')),
            ),
            Grid.Row(
                Grid.Column(Text('Cell 2')),
            ),
            hug=True,
        )

        ```

        In the example above each row will only occupy as much space as it needs, that will be the space the text takes. This can be overwritten at a row level.
        For example, you could set a specific value for a row height, or even set grow to True/hug to False to allow only one row to grow and the others occupy only the space needed.

        :param row_gap: a string containing the desired gap between rows, defaults to 0.75rem
        :param breakpoints: optionally pass when the breakpoints should occur in pixels
        :param justify: How to justify the content of the grid, accepts any flexbox justifications
        :param align: How to align the content of the grid, accepts any flexbox alignments
        """
        super().__init__(*args, **kwargs)
