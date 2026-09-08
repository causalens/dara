from dara.core.definitions import ComponentInstance, JsComponentDef

PoweredByCausalensDef = JsComponentDef(
    name='PoweredByCausalens', js_source='@darajs/core/components/powered-by-causalens', py_module='dara.core'
)


class PoweredByCausalens(ComponentInstance):
    """
    PoweredByCausalens logo component
    """

    js_source = '@darajs/core/components/powered-by-causalens'
