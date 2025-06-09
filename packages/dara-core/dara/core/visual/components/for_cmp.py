from dara.core.definitions import ComponentInstance, JsComponentDef
from dara.core.interactivity.any_variable import AnyVariable

ForDef = JsComponentDef(name='For', js_module='@darajs/core', py_module='dara.core')


class For(ComponentInstance):
    """
    The For component is a special component designed to handle rendering of templated components.
    It accepts a renderer component and a data source, then dynamically renders the template
    component for each item in the data source.

    Note that this component simply renders the items in the data source, it is not responsible for their layout.
    """

    items: AnyVariable
    renderer: ComponentInstance
    key: str | None = None
