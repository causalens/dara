from typing import Literal

from pydantic import Field

from dara.core.base_definitions import DaraBaseModel
from dara.core.definitions import ComponentInstance, JsComponentDef
from dara.core.interactivity.any_variable import AnyVariable

ForDef = JsComponentDef(name='For', js_module='@darajs/core', py_module='dara.core')


class VirtualizationConfig(DaraBaseModel):
    size: str | float | None = None
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

    Note that this component simply renders the items in the data source, it is not responsible for their layout.

    :param items: The data source to render the template component for.
    :param renderer: The template component to render for each item in the data source.
    :param key_accessor: The key accessor to use for the data source. If not provided, the key will be the index of the item in the data source.
    :param virtualization: The virtualization configuration for the component. If provided, the component will be virtualized.
    """

    items: AnyVariable
    renderer: ComponentInstance
    key_accessor: str | None = None
    virtualization: VirtualizationConfig | None = None
