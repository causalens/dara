from typing import Any, Dict, List, Optional, Union

from typing_extensions import TypedDict

from dara.components.common.button import Button
from dara.core import Action, ComponentInstance, NonDataVariable, StyledComponentInstance


class MenuItem(TypedDict):
    label: Union[str, ComponentInstance]
    """the label of the menu item"""

    icon: Optional[str]
    """optional icon to show next to the label"""

    style: Optional[Dict[str, Any]]
    """optional style to apply to the menu item"""

    preventClose: Optional[bool]
    """optional flag to prevent the menu from closing when the item is clicked"""

    before: Optional[ComponentInstance]
    """optional component to show before the label"""

    after: Optional[ComponentInstance]
    """optional component to show after the label"""


class DropdownMenu(StyledComponentInstance):
    button: Button
    onclick: Action
    menu_items: Union[List[List[MenuItem]], NonDataVariable]
