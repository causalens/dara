from typing import Literal, Optional, Union

from pydantic import Field

from dara.core.base_definitions import DaraBaseModel
from dara.core.definitions import ComponentInstance, JsComponentDef
from dara.core.interactivity.any_variable import AnyVariable

ForDef = JsComponentDef(name='For', js_module='@darajs/core', py_module='dara.core')


class VirtualizationConfig(DaraBaseModel):
    size: Union[str, float, None] = None
    """
    The size of each element in the virtualized list.
    If a number is provided, it will be treated as a fixed size.
    If a string is provided, it will be treated as a key accessor to get the size from each element.
    """

    direction: Literal['vertical', 'horizontal'] = Field(default='vertical')


class For(ComponentInstance):
    """
    The For component is a special component designed to handle rendering of templated components.
    It accepts a renderer component and a data source, then dynamically renders the template
    component for each item in the data source.

    Note that by default this component only renders the items in the data source, it is not responsible for their layout.

    To use each item's data in the renderer, use the `LoopVariable` accessible via `Variable.list_item` property.

    ```python
    from dara.core import Variable
    from dara.core.visual.components import For

    my_list = Variable([1, 2, 3])

    # Renders a list of Text component where each item is the corresponding item in the list
    For(
        items=my_list,
        renderer=Text(text=my_list.list_item),
        placeholder=Text('No items') # fallback component to render if the data source is empty
    )
    ```

    Most of the time, you'll want to store objects in a list. You should then use the `get` property to access specific
    properties of the object and the `key_accessor` on the `For` component to specify the unique key.

    ```python
    from dara.core import Variable
    from dara.core.visual.components import For

    my_list = Variable([{'id': 1, 'name': 'John', 'age': 30}, {'id': 2, 'name': 'Jane', 'age': 25}])

    # Renders a list of Text component where each item is the corresponding item in the list
    For(
        items=my_list,
        renderer=Text(text=my_list.list_item.get('name')),
        key_accessor='id'
    )
    ```

    For interactivity can use list items in Dara actions, DerivedVariables, py_components, and `If` component for conditional rendering.

    ```python
    import asyncio
    from dara.core import Variable, action, DerivedVariable, py_component
    from dara.components import Text, Card, Button, Stack, Input

    # Define a variable that holds a list of items
    arr_var = Variable(
        [
            {'id': 1, 'name': 'foo', 'age': 30, 'data': {'city': 'london', 'country': 'uk'}},
            {'id': 2, 'name': 'bar', 'age': 25, 'data': {'city': 'paris', 'country': 'france'}},
            {'id': 3, 'name': 'baz', 'age': 32, 'data': {'city': 'rome', 'country': 'italy'}},
            {'id': 4, 'name': 'xyz', 'age': 20, 'data': {'city': 'new york', 'country': 'usa'}},
        ]
    )

    @action
    async def say_hello(ctx: ActionCtx, item):
        await ctx.notify(f'Hello {item}!', title='Hello', status='SUCCESS')

    @py_component
    async def display_city(city: str):
        return Text(text=f'Server-rendered city: {city}')

    Stack(
        Text(text='Items:'),
        For(
            items=arr_var,
            key_accessor='id',
            renderer=Card(
                Stack(
                    Text('City:'),
                    # Dynamic display of the city property
                    Text(text=arr_var.list_item['data']['city']),
                    Text('Country:'),
                    # Dynamic display of the country property
                    Text(text=arr_var.list_item['data']['country']),
                    # Pass item data into the action
                    Button('Say Hello!', onclick=say_hello(arr_var.list_item['name'])),
                    # Conditionally render data based on the value
                    If(arr_var.list_item['age'] > 30, Text(text='Age is greater than 30')),
                    # Pass item data into a derived variable
                    Text(
                        text=DerivedVariable(lambda x: f'age doubled is {x * 2}', variables=[arr_var.list_item['age']])
                    ),
                    # Pass item data into a py_component
                    display_city(arr_var.list_item['data']['city']),
                ),
                title=arr_var.list_item.get('name'),
                subtitle=arr_var.list_item.get('age'),
            ),
        )
    )
    ```

    For component also supports "virtualization" of the list items. This means that the component
    will only render a certain number of items at a time, and will load more items as the user scrolls down.
    This can be configured by passing a `VirtualizationConfig` instance to the `virtualization` argument.

    For example, the above example can be extended to virtualize the list by adding the config:

    ```python
    Stack(
        For(
            items=arr_var,
            key_accessor='id',
            renderer=..., # omitted for brevity
            virtualization={'size': 300, 'direction': 'vertical'},
        )
    )
    ```

    which will set each item's size to precisely 300px and will virtualize the list vertically.

    Alternatively, the size can be set to a string to specify a field in the data to use as the size.

    :param items: The data source to render the template component for.
    :param renderer: The template component to render for each item in the data source.
    :param placeholder: The component to render if the data source is empty, i.e. there are no items.
    :param key_accessor: The key accessor to use for the data source. If not provided, the key will be the index of the item in the data source.
    Can be a dotted path to access a nested path in the list item.
    :param virtualization: The virtualization configuration for the component. If provided, the component will be virtualized.
    """

    items: AnyVariable
    renderer: ComponentInstance
    placeholder: Optional[ComponentInstance] = None
    key_accessor: Optional[str] = None
    virtualization: Optional[VirtualizationConfig] = None
