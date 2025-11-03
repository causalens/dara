from dara.core.definitions import ComponentInstance, JsComponentDef
from dara.core.interactivity.client_variable import ClientVariable

DynamicComponentDef = JsComponentDef(
    name='DynamicComponent',
    js_module='@darajs/core',
    js_component='PublicDynamicComponent',
    py_module='dara.core',
)


class DynamicComponent(ComponentInstance):
    """
    DynamicComponent allows dynamically rendering an arbitrary Dara component. It is used under the hood
    to recursively render Dara components on each page. It can be used directly in advanced use cases where a component can be
    serialized and passed around as a dictionary.

    :param component: A Dara component instance or a dictionary representing a Dara component,
    or a variable that will be resolved to a component instance.
    """

    component: ComponentInstance | dict | ClientVariable
