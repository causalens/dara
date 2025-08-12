from typing import Any, Dict, List, Optional, Union

from typing_extensions import TypedDict

from dara.components.common.base_component import BaseDashboardComponent
from dara.components.common.button import Button
from dara.core import Action, ClientVariable, ComponentInstance


class MenuItem(TypedDict, total=False):
    label: Union[str, ComponentInstance]
    """the label of the menu item"""

    icon: Optional[str]
    """optional icon to show next to the label, use get_icon() helper"""

    style: Optional[Dict[str, Any]]
    """optional style to apply to the menu item"""

    prevent_close: Optional[bool]
    """optional flag to prevent the menu from closing when the item is clicked"""

    before: Optional[ComponentInstance]
    """optional component to show before the label"""

    after: Optional[ComponentInstance]
    """optional component to show after the label"""


class DropdownMenu(BaseDashboardComponent):
    """
    A DropdownMenu component that displays a button which opens a dropdown menu with configurable menu items.
    Menu items can be organized into sections and support icons, custom styling, and custom components.

    A basic dropdown menu with simple text items:

    ```python
    from dara.core import action, ActionCtx
    from dara.components import Button, DropdownMenu

    @action
    async def handle_menu_click(ctx: ActionCtx):
        print(f"Clicked: {ctx.input['label']}")

    DropdownMenu(
        button=Button('Options'),
        onclick=handle_menu_click(),
        menu_items=[
            [
                MenuItem(label='Edit'),
                MenuItem(label='Delete'),
            ]
        ]
    )
    ```

    A dropdown menu with icons and custom styling:

    ```python
    from dara.core import action, ActionCtx, get_icon
    from dara.components import Button, DropdownMenu

    @action
    async def handle_menu_click(ctx: ActionCtx):
        print(f"Clicked: {ctx.input['label']}")

    DropdownMenu(
        button=Button('Actions', icon=get_icon('chevron-down')),
        onclick=handle_menu_click(),
        menu_items=[
            [
                MenuItem(
                    label='Edit',
                    icon=get_icon('pen'),
                    style={'color': 'blue'}
                ),
                MenuItem(
                    label='Delete',
                    icon=get_icon('trash'),
                    style={'color': 'red'}
                ),
            ],
            [
                MenuItem(label='Settings', icon=get_icon('gear'))
            ]
        ]
    )
    ```

    A dropdown menu with custom components and prevent close behavior:

    ```python
    from dara.core import action, ActionCtx, Variable
    from dara.components import Button, DropdownMenu, Text, Stack

    counter = Variable(0)

    @action
    async def handle_menu_click(ctx: ActionCtx, counter_value: int):
        print(f"Clicked: {ctx.input['label']}")

        if ctx.input['label'] == 'Increment':
            await ctx.update(counter, counter_value + 1)

    DropdownMenu(
        button=Button('Custom Menu'),
        onclick=handle_menu_click(counter),
        menu_items=[
            [
                MenuItem(
                    label=Stack(Text('Counter: '), Text(counter)),
                    prevent_close=True
                ),
                MenuItem(
                    label='Increment',
                    before=Text('→'),
                    after=Text('↑')
                )
            ]
        ]
    )
    ```

    A dropdown menu with footer content at the bottom:

    ```python
    from dara.core import action, ActionCtx
    from dara.components import Button, DropdownMenu, Text, Stack

    @action
    async def handle_menu_click(ctx: ActionCtx):
        print(f"Clicked: {ctx.input['label']}")

    DropdownMenu(
        button=Button('Menu with Footer'),
        onclick=handle_menu_click(),
        menu_items=[
            [
                MenuItem(label='Option 1'),
                MenuItem(label='Option 2'),
            ]
        ],
        footer=Stack(
            Text(
                'Additional info or controls can go here',
                raw_css={'padding': '8px', 'font-size': '0.8rem', 'color': 'gray'},
            )
        )
    )
    ```

    :param button: The button component that triggers the dropdown menu
    :param onclick: Action triggered when a menu item is clicked, receives the clicked item as parameter
    :param menu_items: List of menu item sections, where each section is a list of MenuItem objects
    :param footer: Optional component to display at the bottom of the dropdown menu
    """

    button: Button
    onclick: Action
    menu_items: Union[List[List[MenuItem]], ClientVariable]
    footer: Optional[ComponentInstance] = None
